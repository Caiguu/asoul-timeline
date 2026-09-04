import { ASOUL_ACCOUNTS } from "./accounts";
import { fetchDynamics, closeBrowser, parseLiveTimeText } from "./bilibili";
import { classifyType, ocrScheduleImage, type OcrScheduleItem } from "./llm";
import { saveDynamic, saveScheduleEntries, ensureAccount, type ScheduleEntry } from "./sync";
import { accounts as accountsTable } from "@asoul-timeline/db";
import { createDb } from "@asoul-timeline/db/local";
import { findMember, findMembers, roomUrlForMember, type MemberInfo } from "./members";
import type { ScheduleParticipant } from "@asoul-timeline/shared";
import type { ClassifyResult } from "./types";

const OFFICIAL_UID = 703007996;

// 初筛：仅 A-SOUL Official 含图且文本提到"日程表"的动态才调 OCR
const SCHEDULE_KEYWORDS = ["日程表", "日程", "本周", "一周安排", "直播安排"];
function isScheduleDynamic(raw: { uid: number; text: string; images: string[] }): boolean {
  if (raw.uid !== OFFICIAL_UID || raw.images.length === 0) return false;
  return SCHEDULE_KEYWORDS.some((kw) => raw.text.includes(kw));
}

function parseOcrDate(dateStr: string, createdAt: number): number | null {
  // dateStr 格式 "MM-DD"
  const m = dateStr.match(/(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const month = parseInt(m[1]);
  const day = parseInt(m[2]);
  const d = new Date(createdAt);
  let year = d.getFullYear();
  // 如果月份比当前小很多，可能是明年
  if (month < d.getMonth() + 1 - 6) year++;
  return new Date(year, month - 1, day).getTime();
}

function ocrTypeToLiveType(type: string): "single" | "dual" | "group" {
  if (type.includes("双")) return "dual";
  if (type.includes("团")) return "group";
  return "single";
}

// 从日程表动态正文中解析日期 -> 直播间主人映射
// 模式示例："7月17日的【A-SOUL夜谈】是在 @嘉然今天吃什么 的直播间哦"
function parseRoomOwnerByText(fullText: string, createdAt: number): Map<string, MemberInfo> {
  const map = new Map<string, MemberInfo>();
  // 严格匹配 "MM月DD日...@成员名" 模式（团播/双播直播间的主人）
  const regex = /(\d{1,2})月(\d{1,2})日[^@]*@([^\s　]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullText)) !== null) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    const member = findMember(match[3]);
    if (member) {
      const key = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, member);
    }
  }
  return map;
}

// face 缓存：uid -> face URL
const faceCache = new Map<number, string | null>();
function getFace(uid: number): string | null {
  return faceCache.get(uid) ?? null;
}
function cacheFace(uid: number, face: string | null) {
  if (face) faceCache.set(uid, face);
}

function toParticipants(members: MemberInfo[]): ScheduleParticipant[] {
  return members.map((m) => ({ uid: m.uid, name: m.name, face: getFace(m.uid) }));
}

async function processScheduleDynamic(
  raw: { id: string; uid: number; text: string; images: string[]; createdAt: number; dynamicUrl: string; authorName: string; authorFace: string | null },
): Promise<ScheduleEntry[]> {
  console.log(`[crawler] 日程表动态 ${raw.id}, 调用豆包OCR...`);
  const items = await ocrScheduleImage(raw.images[0]);
  if (items.length === 0) {
    console.log(`[crawler] OCR 未识别到条目`);
    return [];
  }
  console.log(`[crawler] OCR 识别到 ${items.length} 条直播`);

  // 从动态正文解析团播/双播直播间归属
  const roomOwnerByText = parseRoomOwnerByText(raw.text, raw.createdAt);

  const entries: ScheduleEntry[] = [];
  for (const item of items) {
    const dateMs = parseOcrDate(item.date, raw.createdAt);
    if (!dateMs) continue;

    // 解析时间，合并日期+时间
    let liveTime = dateMs;
    const timeMatch = item.time.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const d = new Date(dateMs);
      d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
      liveTime = d.getTime();
    }

    const liveType = ocrTypeToLiveType(item.type);

    // 解析参与成员（只有3个人，会自动过滤 A-SOUL）
    const members = findMembers(item.participants);
    const participants = toParticipants(members);

    // 解析直播间主人：
    //   1. 优先用 OCR 返回的 roomOwner（如果是3成员之一）
    //   2. 否则从日程表正文按日期查找 "在 @XX 的直播间" 的描述
    let roomOwnerMember = findMember(item.roomOwner);
    if (!roomOwnerMember) {
      roomOwnerMember = roomOwnerByText.get(item.date) ?? null;
    }
    const liveRoomUrl = roomUrlForMember(roomOwnerMember);

    // rid: 用 hash(liveTime + title) 保证唯一
    const rid = Math.abs(hashCode(`${liveTime}-${item.title}`));

    entries.push({
      dynamicId: raw.id,
      uid: OFFICIAL_UID,
      rid,
      title: item.title,
      liveTime,
      liveType,
      participants,
      liveRoomUrl,
    });
  }

  return entries;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

async function run(dry: boolean) {
  console.log(`[crawler] start (dry=${dry})`);

  // 从已有 accounts 表预填 face 缓存（日程表动态是第一个被处理的，
  // 此时嘉然/贝拉/乃琳还没爬到，但 DB 中应已有上次抓取的脸）
  if (!dry) {
    const db = createDb();
    for (const a of db.select().from(accountsTable).all()) {
      if (a.avatar) cacheFace(a.uid, a.avatar);
    }
  }

  for (let i = 0; i < ASOUL_ACCOUNTS.length; i++) {
    const account = ASOUL_ACCOUNTS[i];
    if (!account.uid) continue;
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));
    console.log(`[crawler] ${account.name} (uid=${account.uid})`);

    try {
      const raws = await fetchDynamics(account.uid);
      console.log(`[crawler] ${account.name} 抓取到 ${raws.length} 条动态`);
      if (!dry && raws.length > 0) {
        await ensureAccount(raws[0].uid, raws[0].authorName, raws[0].authorFace);
      }

      // 缓存所有动态作者的 face（用于日程表条目补全）
      for (const raw of raws) {
        cacheFace(raw.uid, raw.authorFace);
      }

      // 先处理日程表动态（优先级高）
      const scheduleRaws = raws.filter((r) => isScheduleDynamic(r));
      const normalRaws = raws.filter((r) => !isScheduleDynamic(r));

      for (const raw of scheduleRaws) {
        const entries = await processScheduleDynamic(raw);
        console.log(`  - ${raw.id} 日程表 -> ${entries.length} 条直播`);
        for (const e of entries) {
          console.log(`    ${new Date(e.liveTime).toLocaleString("zh-CN")} [${e.liveType}] "${e.title}" 参与:${e.participants.map((p) => p.name).join("+")} 房间:${e.liveRoomUrl ?? "无"}`);
        }

        // 把识别到的直播条目存到 raw.scheduleEntries（前端时间线展示）
        raw.scheduleEntries = entries.map((e) => ({
          title: e.title,
          liveTime: e.liveTime,
          liveType: e.liveType,
          participants: e.participants,
          liveRoomUrl: e.liveRoomUrl,
        }));

        // 先保存动态本身（schedule entries 外键引用它）
        if (!dry) {
          const result: ClassifyResult = {
            type: "live_reserve",
            text: raw.text,
            liveTime: null,
            liveTitle: entries.length > 0 ? `本周日程表(${entries.length}场直播)` : "本周日程表",
          };
          await saveDynamic(raw, result);
        }

        // 再保存 OCR 识别出的直播条目
        if (!dry && entries.length > 0) {
          await saveScheduleEntries(entries);
        }
      }

      for (const raw of normalRaws) {
        let result: ClassifyResult = {
          type: await classifyType(raw.text),
          text: raw.text,
          liveTime: null,
          liveTitle: null,
        };

        if (raw.reserve) {
          result = {
            type: "live_reserve",
            text: raw.text,
            liveTime: parseLiveTimeText(raw.reserve.liveTimeText, raw.createdAt),
            liveTitle: raw.reserve.title,
          };
        }

        console.log(`  - ${raw.id} ${raw.biliType} -> ${result.type}${raw.reserve ? " [直播预约: " + raw.reserve.title.slice(0, 20) + "]" : ""}`);
        if (!dry) await saveDynamic(raw, result);
      }
    } catch (err) {
      console.error(`[crawler] ${account.name} 失败:`, err);
    }
  }

  console.log("[crawler] done");
}

const dry = process.argv.includes("--dry");
run(dry).finally(() => closeBrowser());