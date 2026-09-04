import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { ForwardInfo } from "@asoul-timeline/shared";
import type { RichTextNode } from "@asoul-timeline/shared";
import type { ReserveInfo, LiveType, ScheduleParticipant } from "@asoul-timeline/shared";

export interface ScheduleEntryInfo {
  title: string;
  liveTime: number;
  liveType: LiveType | null;
  participants: ScheduleParticipant[];
  liveRoomUrl: string | null;
}

export type { ForwardInfo, RichTextNode, ReserveInfo, LiveType, ScheduleParticipant };

export const accounts = sqliteTable("accounts", {
  uid: integer("uid").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  createdAt: integer("created_at").notNull(),
});

export const dynamics = sqliteTable("dynamics", {
  id: text("id").primaryKey(),
  uid: integer("uid")
    .notNull()
    .references(() => accounts.uid),
  type: text("type", {
    enum: ["normal", "live_reserve", "live_notice"],
  }).notNull(),
  biliType: text("bili_type").notNull(),
  text: text("text").notNull(),
  richText: text("rich_text", { mode: "json" }).$type<RichTextNode[]>().notNull(),
  raw: text("raw").notNull(),
  images: text("images", { mode: "json" }).$type<string[]>().notNull(),
  authorName: text("author_name").notNull(),
  authorFace: text("author_face"),
  authorUrl: text("author_url"),
  dynamicUrl: text("dynamic_url").notNull(),
  videoCover: text("video_cover"),
  videoTitle: text("video_title"),
  forward: text("forward", { mode: "json" }).$type<ForwardInfo | null>(),
  reserve: text("reserve", { mode: "json" }).$type<ReserveInfo | null>(),
  scheduleEntries: text("schedule_entries", { mode: "json" }).$type<ScheduleEntryInfo[] | null>(),
  liveTime: integer("live_time"),
  liveTitle: text("live_title"),
  createdAt: integer("created_at").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});

export const liveSchedules = sqliteTable("live_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dynamicId: text("dynamic_id")
    .notNull()
    .references(() => dynamics.id),
  uid: integer("uid").notNull(),
  rid: integer("rid").notNull().unique(),
  title: text("title").notNull(),
  liveTime: integer("live_time").notNull(),
  status: text("status", {
    enum: ["upcoming", "live", "ended"],
  }).notNull(),
  createdAt: integer("created_at").notNull(),
  liveType: text("live_type", { enum: ["single", "dual", "group"] }),
  participants: text("participants", { mode: "json" }).$type<ScheduleParticipant[] | null>(),
  liveRoomUrl: text("live_room_url"),
  source: text("source", { enum: ["schedule", "reserve"] }),
});

export const liveStatus = sqliteTable("live_status", {
  uid: integer("uid").primaryKey(),
  name: text("name").notNull(),
  liveStatus: integer("live_status").notNull().default(0),
  title: text("title").notNull().default(""),
  online: integer("online").notNull().default(0),
  cover: text("cover").notNull().default(""),
  roomId: integer("room_id").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});
