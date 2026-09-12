import { eq, and, gte, lt } from "drizzle-orm";
import { dynamics, liveSchedules, accounts } from "@asoul-timeline/db";
import { createDb } from "@asoul-timeline/db/local";
import type { ScheduleParticipant } from "@asoul-timeline/shared";
import type { RawDynamic, ClassifyResult } from "./types";
import { MEMBER_MAP } from "./members";

function roomUrlForUid(uid: number): string | null {
  const m = MEMBER_MAP.find((m) => m.uid === uid);
  return m ? `https://live.bilibili.com/${m.roomId}` : null;
}

const db = createDb();

export async function saveDynamic(
  raw: RawDynamic,
  result: ClassifyResult,
): Promise<void> {
  db.insert(dynamics)
    .values({
      id: raw.id,
      uid: raw.uid,
      type: result.type,
      biliType: raw.biliType,
      text: result.text,
      richText: raw.richText,
      raw: raw.raw,
      images: raw.images,
      authorName: raw.authorName,
      authorFace: raw.authorFace,
      authorUrl: raw.authorUrl,
      dynamicUrl: raw.dynamicUrl,
      videoCover: raw.videoCover,
      videoTitle: raw.videoTitle,
      forward: raw.forward,
      reserve: raw.reserve,
      topic: raw.topic,
      scheduleEntries: raw.scheduleEntries,
      liveTime: result.liveTime,
      liveTitle: result.liveTitle,
      createdAt: raw.createdAt,
      fetchedAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();

  if (result.liveTime && raw.reserve) {
    // 日程表优先：如果同时间已有 schedule 条目，跳过 reserve 插入
    const existing = db.select({ id: liveSchedules.id })
      .from(liveSchedules)
      .where(and(
        eq(liveSchedules.liveTime, result.liveTime),
        eq(liveSchedules.source, "schedule"),
      ))
      .get();

    if (!existing) {
      db.insert(liveSchedules)
        .values({
          dynamicId: raw.id,
          uid: raw.uid,
          rid: raw.reserve.rid,
          title: result.liveTitle ?? "直播",
          liveTime: result.liveTime,
          status: "upcoming",
          createdAt: Date.now(),
          liveType: "single",
          participants: [{ uid: raw.uid, name: raw.authorName, face: raw.authorFace }],
          liveRoomUrl: roomUrlForUid(raw.uid),
          source: "reserve",
        })
        .onConflictDoNothing({ target: liveSchedules.rid })
        .run();
    }
  }
}

export interface ScheduleEntry {
  dynamicId: string;
  uid: number;
  rid: number;
  title: string;
  liveTime: number;
  liveType: "single" | "dual" | "group";
  participants: ScheduleParticipant[];
  liveRoomUrl: string | null;
}

export async function saveScheduleEntries(entries: ScheduleEntry[]): Promise<void> {
  // 日程表优先：先删除与日程条目时间冲突的 reserve 条目
  for (const entry of entries) {
    db.delete(liveSchedules)
      .where(
        and(
          eq(liveSchedules.liveTime, entry.liveTime),
          eq(liveSchedules.source, "reserve"),
        ),
      )
      .run();
  }

  for (const entry of entries) {
    // 用 rid 去重，日程表条目用 rid = -hash(liveTime+title) 保持唯一
    db.insert(liveSchedules)
      .values({
        dynamicId: entry.dynamicId,
        uid: entry.uid,
        rid: entry.rid,
        title: entry.title,
        liveTime: entry.liveTime,
        status: "upcoming",
        createdAt: Date.now(),
        liveType: entry.liveType,
        participants: entry.participants,
        liveRoomUrl: entry.liveRoomUrl,
        source: "schedule",
      })
      .onConflictDoNothing({ target: liveSchedules.rid })
      .run();
  }
}

export async function ensureAccount(
  uid: number,
  name: string,
  avatar: string | null,
): Promise<void> {
  db.insert(accounts)
    .values({ uid, name, avatar, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: accounts.uid,
      set: { name, avatar },
    })
    .run();
}