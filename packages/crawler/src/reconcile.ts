import { createDb } from "@asoul-timeline/db/local";
import { dynamics, liveSchedules } from "@asoul-timeline/db";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { judgeSchedule } from "./llm";
import { fetchDynamicDetail } from "./bilibili";
import { MEMBER_MAP } from "./members";

export type Candidate = {
  id: number; uid: number; liveTime: number; liveType: string | null;
  participants: { uid: number }[] | null;
};

export function memberUids(s: Candidate): number[] {
  if (s.participants?.length) return s.participants.map(p => p.uid);
  if (s.liveType === "group" || s.uid === 703007996) return MEMBER_MAP.map(m => m.uid);
  return [s.uid];
}

export function overlaps(a: Candidate, b: Candidate): boolean {
  return a.liveTime === b.liveTime && memberUids(a).some(uid => memberUids(b).includes(uid));
}

const beijingTime = (time: number) => new Date(time).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });

// 校验模型输出：同一个成员同一时刻只能保留一条，且不能丢掉不冲突的直播。
export function validSelection(rows: Candidate[], ids: number[]): boolean {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !rows.some(r => r.id === id))) return false;
  const selected = rows.filter(r => ids.includes(r.id));
  return !selected.some((r, i) => selected.slice(i + 1).some(s => overlaps(r, s)))
    && rows.every(r => ids.includes(r.id) || selected.some(s => overlaps(r, s)));
}

export async function reconcileSchedules(options: { checkReservations?: boolean } = {}) {
  const db = createDb();
  const sql = db.$client;
  const now = Date.now();
  const posts = db.select().from(dynamics).all();
  const byId = new Map(posts.map(p => [p.id, p]));
  // 旧版本曾按时间直接删除预约；从已保存的动态补回候选，再统一裁决。
  for (const post of posts.filter(p => p.reserve?.rid && p.liveTime)) {
    db.insert(liveSchedules).values({
      dynamicId: post.id, uid: post.uid, rid: post.reserve!.rid,
      title: post.liveTitle ?? post.reserve!.title, liveTime: post.liveTime!,
      status: "upcoming", createdAt: now, liveType: "single", source: "reserve",
      participants: [{ uid: post.uid, name: post.authorName, face: post.authorFace }],
      liveRoomUrl: MEMBER_MAP.find(m => m.uid === post.uid) ? `https://live.bilibili.com/${MEMBER_MAP.find(m => m.uid === post.uid)!.roomId}` : null,
    }).onConflictDoNothing({ target: liveSchedules.rid }).run();
  }
  const cached = async <T>(keyData: unknown, fn: () => Promise<T>, validate: (value: T) => boolean): Promise<T> => {
    const key = createHash("sha256").update(JSON.stringify(keyData)).digest("hex");
    const found = sql.query("SELECT result FROM schedule_decisions WHERE key = ?").get(key) as { result: string } | null;
    if (found) {
      const value = JSON.parse(found.result);
      if (validate(value)) return value;
    }
    const value = await fn();
    if (!validate(value)) throw new Error("AI 裁决返回无效或越界的条目");
    sql.run("INSERT OR REPLACE INTO schedule_decisions VALUES (?, ?, ?)", [key, JSON.stringify(value), now]);
    return value;
  };
  const cancel = (ids: number[], reason: string) => {
    const all = db.select().from(liveSchedules).all();
    const targets = all.filter(s => ids.includes(s.id));
    for (const s of all.filter(s => targets.some(t => t.id === s.id || overlaps(t, s)))) {
      db.update(liveSchedules).set({ status: "cancelled" }).where(eq(liveSchedules.id, s.id)).run();
    }
    if (ids.length) console.log(`[reconcile] 已取消 ${ids.join(",")}: ${reason}`);
  };

  if (options.checkReservations !== false) {
    const future = db.select().from(liveSchedules).all().filter(s => s.source === "reserve" && s.liveTime > now && s.status !== "cancelled");
    for (const id of new Set(future.map(s => s.dynamicId))) {
      const item = await fetchDynamicDetail(id);
      if (!item) continue;
      const reserve = item.modules?.module_dynamic?.additional?.reserve;
      const rows = future.filter(s => s.dynamicId === id);
      // 成功取得原动态但预约卡片已撤下，只对明确标记突击的预约使用此规则。
      if (!reserve) {
        cancel(rows.filter(s => /突击/.test(s.title + (byId.get(id)?.text ?? ""))).map(s => s.id), "原动态预约卡片已撤下");
      } else {
        // 预约人数、是否“已预约”不是取消状态；让 AI 只依据明确取消标志判定。
        try {
          const result = await cached<{ cancelled: boolean; reason: string }>(["reservation-v1", id, reserve.state, reserve.title, reserve.desc1, reserve.button],
            () => judgeSchedule("判断这张 B 站预约卡片是否明确表示主播已取消该场直播。state 数字未知时不得猜测；已预约/取消预约按钮是观众操作，不代表主播取消。只有标题或状态文字明确说直播已取消才返回 cancelled:true。返回 {cancelled:boolean,reason:string}。", reserve),
            r => typeof r?.cancelled === "boolean" && typeof r.reason === "string");
          if (result.cancelled) cancel(rows.map(s => s.id), result.reason);
        } catch (e) { console.warn(`[reconcile] 预约状态裁决失败: ${e}`); }
      }
    }
  }

  // 不仅检查最新列表：从持久化的动态中找“取消”公告，可重试失败的 AI 调用。
  for (const post of posts.filter(p => p.text.includes("取消"))) {
    const candidates = db.select().from(liveSchedules).all().filter(s =>
      s.status !== "cancelled" && s.liveTime >= post.createdAt && s.liveTime <= post.createdAt + 31 * 86400000
      && (post.uid === 703007996 || memberUids(s).includes(post.uid)));
    if (!candidates.length) continue;
    try {
      const result = await cached<{ cancelIds: number[]; reason: string; evidence: string }>(["notice-v2", post.id, post.text, candidates.map(s => [s.id, s.title, s.liveTime])],
        () => judgeSchedule("判断动态是否在通知直播取消，而非取消预约按钮、玩笑、否定取消或其他事情。所有时间字符串已转换北京时间，不要再做时区换算。结合发布时间、成员、明确日期/时间/主题，从候选中选择确实被取消的直播。今晚只指发布当天；明天指次日。生病不等于取消后续场次，内容调整不等于取消。不得推断公告未明确取消的直播；含糊不清返回空数组。evidence 必须原样引用动态中明确取消及对应日期的文字。返回 {cancelIds:number[],reason:string,evidence:string}。", {
          post: { uid: post.uid, text: post.text, publishedAt: beijingTime(post.createdAt) },
          candidates: candidates.map(s => ({ id: s.id, title: s.title, participants: s.participants, time: beijingTime(s.liveTime) })),
        }), r => Array.isArray(r?.cancelIds) && r.cancelIds.every(id => candidates.some(s => s.id === id)) && typeof r.reason === "string"
          && (!r.cancelIds.length || (typeof r.evidence === "string" && r.evidence.includes("取消") && post.text.includes(r.evidence))));
      cancel(result.cancelIds, result.reason);
    } catch (e) { console.warn(`[reconcile] 取消公告裁决失败 ${post.id}: ${e}`); }
  }

  const rows = db.select().from(liveSchedules).all().filter(s => s.status !== "cancelled");
  const times = new Set(rows.map(s => s.liveTime));
  for (const time of times) {
    const group = rows.filter(s => s.liveTime === time);
    if (!group.some((a, i) => group.slice(i + 1).some(b => overlaps(a, b)))) continue;
    const facts = group.map(s => ({ ...s, status: undefined, createdAt: undefined,
      time: new Date(s.liveTime).toISOString(), text: byId.get(s.dynamicId)?.text,
      publishedAt: byId.get(s.dynamicId)?.createdAt }));
    const announcements = posts.filter(p => /更改|改为|改成|主题|调整/.test(p.text)
      && p.createdAt <= time && p.createdAt >= time - 7 * 86400000
      && (p.uid === 703007996 || group.some(s => memberUids(s).includes(p.uid))))
      .map(p => ({ uid: p.uid, text: p.text, publishedAt: new Date(p.createdAt).toISOString() }));
    const evidence = { candidates: facts, announcements };
    try {
      const result = await cached<{ keepIds: number[]; reason: string }>(["conflict-v2", evidence],
        () => judgeSchedule("合并同一时刻的直播候选。同一成员只能参与一场直播；双播/团播占用所有参与成员，但不相交成员的单播必须都保留。比较标题信息完整程度、来源正文和发布时间，明确更改主题的最新公告优先，不能无条件优先日程表。选择合适的原始条目展示，不虚构标题。返回 {keepIds:number[],reason:string}，未选条目必须与某个已选条目共享成员。", evidence),
        r => Array.isArray(r?.keepIds) && validSelection(group, r.keepIds) && typeof r.reason === "string");
      for (const s of group) db.update(liveSchedules).set({
        status: result.keepIds.includes(s.id) ? (s.liveTime > now ? "upcoming" : "ended") : "superseded",
      }).where(eq(liveSchedules.id, s.id)).run();
      console.log(`[reconcile] ${new Date(time).toISOString()} 保留 ${result.keepIds}: ${result.reason}`);
    } catch (e) { console.warn(`[reconcile] 冲突裁决失败，留待重试: ${e}`); }
  }
  // 取消或时间变更后，以前被覆盖的候选不应永久消失。
  const final = db.select().from(liveSchedules).all();
  for (const s of final.filter(s => s.status === "superseded")) {
    if (!final.some(other => other.id !== s.id && other.status !== "cancelled" && other.status !== "superseded" && overlaps(s, other))) {
      db.update(liveSchedules).set({ status: s.liveTime > now ? "upcoming" : "ended" }).where(eq(liveSchedules.id, s.id)).run();
    }
  }
}

if (import.meta.main) {
  const { closeBrowser } = await import("./bilibili");
  await reconcileSchedules().finally(closeBrowser);
}
