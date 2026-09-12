import { chromium, type Browser } from "playwright";
import type { ForwardInfo, RichTextNode, ReserveInfo, TopicInfo } from "@asoul-timeline/shared";
import type { RawDynamic } from "./types";

const UA =
  process.env.BILI_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  // 强制清理残留 chromium 进程（防止 macOS 睡眠唤醒后僵尸进程卡死）
  try {
    Bun.spawn(["pkill", "-9", "-f", "chromium"], { stdio: ["ignore", "ignore", "ignore"] });
    await new Promise((r) => setTimeout(r, 500));
  } catch {}
}

function fixUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http://")) return "https://" + url.slice(7);
  if (url.startsWith("https://")) return url;
  return null;
}

function parseRichTextNodes(nodes: any[]): { text: string; richText: RichTextNode[] } {
  const richText: RichTextNode[] = [];
  const parts: string[] = [];

  for (const n of nodes ?? []) {
    const t = n.text ?? "";
    switch (n.type) {
      case "RICH_TEXT_NODE_TYPE_TEXT":
        richText.push({ type: "text", text: t });
        parts.push(t);
        break;
      case "RICH_TEXT_NODE_TYPE_EMOJI":
        const emojiUrl = fixUrl(n.emoji?.icon_url) ?? fixUrl(n.orig?.url);
        richText.push({ type: "emoji", text: t, url: emojiUrl });
        parts.push(t);
        break;
      case "RICH_TEXT_NODE_TYPE_AT":
        richText.push({ type: "at", text: t, uid: n.rid ?? null });
        parts.push(t);
        break;
      case "RICH_TEXT_NODE_TYPE_WEB":
        richText.push({ type: "web", text: t, url: n.jump_url ?? null });
        parts.push(t);
        break;
      case "RICH_TEXT_NODE_TYPE_TOPIC":
        richText.push({ type: "topic", text: t });
        parts.push(t);
        break;
      default:
        richText.push({ type: "text", text: t });
        parts.push(t);
    }
  }

  return { text: parts.join(""), richText };
}

function parseOpus(opus: any): { text: string; richText: RichTextNode[]; images: string[] } {
  const summary = opus?.summary;
  const { text, richText } = parseRichTextNodes(summary?.rich_text_nodes ?? []);
  const plainText = summary?.text ?? text;

  const images: string[] = [];
  for (const pic of opus?.pics ?? []) {
    const u = fixUrl(pic.url);
    if (u) images.push(u);
  }

  return { text: plainText || text, richText: richText.length ? richText : [{ type: "text", text: plainText }], images };
}

function parseForward(raw: any): ForwardInfo | null {
  const orig = raw.orig;
  if (!orig) return null;

  const oauthor = orig.modules?.module_author;
  const odyn = orig.modules?.module_dynamic;
  const omajor = odyn?.major;

  let text = "";
  let richText: RichTextNode[] = [];
  let images: string[] = [];

  if (omajor?.opus) {
    const opus = parseOpus(omajor.opus);
    text = opus.text;
    richText = opus.richText;
    images = opus.images;
  } else if (omajor?.draw?.items) {
    text = odyn?.desc?.text ?? "";
    for (const item of omajor.draw.items) {
      const u = fixUrl(item.src);
      if (u) images.push(u);
    }
    richText = [{ type: "text", text }];
  } else if (omajor?.archive) {
    text = `[视频] ${omajor.archive.title}`;
    richText = [{ type: "text", text }];
  } else if (odyn?.desc?.rich_text_nodes?.length) {
    const parsed = parseRichTextNodes(odyn.desc.rich_text_nodes);
    text = parsed.text;
    richText = parsed.richText;
  }

  return {
    authorName: oauthor?.name ?? "",
    authorFace: fixUrl(oauthor?.face),
    authorUrl: oauthor?.mid ? `https://space.bilibili.com/${oauthor.mid}` : null,
    text,
    richText,
    images,
    videoCover: fixUrl(omajor?.archive?.cover),
    videoTitle: omajor?.archive?.title ?? null,
  };
}

function parseReserve(additional: any): ReserveInfo | null {
  const r = additional?.reserve;
  if (!r) return null;
  return {
    title: r.title ?? "",
    liveTimeText: r.desc1?.text ?? "",
    reserveCount: r.desc2?.text ?? "",
    state: r.state ?? 0,
    rid: r.rid ?? 0,
  };
}

// 解析预约卡片的直播时间文本
// 注意：B站的 "今天/明天" 是接口请求时动态渲染的（延迟爬取后依然指向当前真实日期），
// 而 "MM-DD" 是绝对日期。因此相对词必须用当前时间做基准，绝对日期才用 createdAt 推断年份。
export function parseLiveTimeText(text: string, createdAt: number): number | null {
  const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*直播/);
  if (!timeMatch) return null;
  const hour = parseInt(timeMatch[1]);
  const minute = parseInt(timeMatch[2]);
  const now = new Date();
  const created = new Date(createdAt);
  let date: Date;

  if (text.includes("今天")) {
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  } else if (text.includes("明天")) {
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
  } else {
    const dm = text.match(/(\d{1,2})-(\d{1,2})/);
    if (!dm) return null;
    date = new Date(created.getFullYear(), parseInt(dm[1]) - 1, parseInt(dm[2]), hour, minute);
    // 绝对日期若比当前早超过半年，视为跨年（如 12 月发的 1 月日程）
    if (date.getTime() < now.getTime() - 180 * 24 * 60 * 60 * 1000) {
      date = new Date(date.getFullYear() + 1, date.getMonth(), date.getDate(), hour, minute);
    }
  }
  return date.getTime();
}

function parseDynamic(it: any): RawDynamic {
  const author = it.modules?.module_author;
  const dyn = it.modules?.module_dynamic;
  const major = dyn?.major;

  let text = "";
  let richText: RichTextNode[] = [];
  let images: string[] = [];
  let videoCover: string | null = null;
  let videoTitle: string | null = null;

  if (major?.opus) {
    const opus = parseOpus(major.opus);
    text = opus.text;
    richText = opus.richText;
    images = opus.images;
  } else if (major?.draw?.items) {
    text = dyn?.desc?.text ?? "";
    richText = [{ type: "text", text }];
    for (const item of major.draw.items) {
      const u = fixUrl(item.src);
      if (u) images.push(u);
    }
  } else if (major?.archive) {
    videoCover = fixUrl(major.archive.cover);
    videoTitle = major.archive.title ?? null;
    text = `[视频] ${videoTitle ?? ""}`;
    const descParsed = parseRichTextNodes(dyn?.desc?.rich_text_nodes ?? []);
    richText = descParsed.richText.length ? descParsed.richText : [{ type: "text", text: dyn?.desc?.text ?? text }];
  } else if (dyn?.desc?.rich_text_nodes?.length) {
    const parsed = parseRichTextNodes(dyn.desc.rich_text_nodes);
    text = dyn.desc.text ?? parsed.text;
    richText = parsed.richText;
  }

  const forward = it.type === "DYNAMIC_TYPE_FORWARD" ? parseForward(it) : null;
  const reserve = parseReserve(dyn?.additional);

  // 话题标签（B站将话题放在 module_dynamic.topic，请求时动态生成）
  const rawTopic = dyn?.topic;
  const topic: TopicInfo | null = rawTopic?.name
    ? { id: Number(rawTopic.id) || 0, name: rawTopic.name, jumpUrl: fixUrl(rawTopic.jump_url) }
    : null;

  return {
    id: it.id_str,
    uid: author?.mid ?? 0,
    biliType: it.type ?? "",
    text: text || (forward ? "" : ""),
    richText,
    images,
    raw: JSON.stringify(it),
    authorName: author?.name ?? "",
    authorFace: fixUrl(author?.face),
    authorUrl: author?.mid ? `https://space.bilibili.com/${author.mid}` : null,
    dynamicUrl: `https://t.bilibili.com/${it.id_str}`,
    videoCover,
    videoTitle,
    forward,
    reserve,
    topic,
    scheduleEntries: null,
    createdAt: (author?.pub_ts ?? 0) * 1000,
  };
}

const MAX_RETRIES = 3;

export async function fetchDynamics(uid: number): Promise<RawDynamic[]> {
  const b = await getBrowser();
  const weekAgo = Date.now() - ONE_WEEK_MS;
  const apiUrlPattern = /\/x\/polymer\/web-dynamic\/v1\/feed\/space/;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const page = await b.newPage({ userAgent: UA });
    try {
      const responses: any[] = [];
      page.on("response", async (res) => {
        if (apiUrlPattern.test(res.url())) {
          try {
            const data = await res.json();
            if (data.code === 0 && data.data?.items?.length > 0) {
              responses.push(data);
            }
          } catch {}
        }
      });

      await page.goto(`https://space.bilibili.com/${uid}/dynamic`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // 等待有效响应，最多等 8 秒
      for (let i = 0; i < 16 && responses.length === 0; i++) {
        await page.waitForTimeout(500);
      }

      if (responses.length > 0) {
        // 取最后一条有效响应（最新数据）
        const captured = responses[responses.length - 1];
        const items = (captured.data.items as any[]).filter(
          (it: any) => it.type !== "DYNAMIC_TYPE_LIVE_RCMD",
        );
        const parsed = items.map(parseDynamic);
        const recent = parsed.filter((d) => d.createdAt >= weekAgo);
        console.log(
          `[bili] ${uid} got ${items.length} items, ${recent.length} within last week (attempt ${attempt + 1})`,
        );
        return recent;
      }

      // 没拿到有效响应，尝试滚动触发
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.waitForTimeout(3000);

      if (responses.length > 0) {
        const captured = responses[responses.length - 1];
        const items = (captured.data.items as any[]).filter(
          (it: any) => it.type !== "DYNAMIC_TYPE_LIVE_RCMD",
        );
        const parsed = items.map(parseDynamic);
        const recent = parsed.filter((d) => d.createdAt >= weekAgo);
        console.log(
          `[bili] ${uid} got ${items.length} items after scroll, ${recent.length} within last week (attempt ${attempt + 1})`,
        );
        return recent;
      }

      console.log(`[bili] ${uid} attempt ${attempt + 1} failed: no valid response`);
      if (attempt < MAX_RETRIES) await page.waitForTimeout(3000);
    } catch (err) {
      console.log(`[bili] ${uid} attempt ${attempt + 1} error:`, err);
      if (attempt < MAX_RETRIES) await page.waitForTimeout(3000);
    } finally {
      await page.close();
    }
  }

  console.log(`[bili] ${uid} all retries exhausted`);
  return [];
}