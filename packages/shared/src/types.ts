export type DynamicType = "normal" | "live_reserve" | "live_notice";

export type LiveStatus = "upcoming" | "live" | "ended";

export interface RichTextNode {
  type: "text" | "emoji" | "at" | "web" | "topic";
  text: string;
  url?: string | null;
  uid?: number | null;
}

export interface ReserveInfo {
  title: string;
  liveTimeText: string;
  reserveCount: string;
  state: number;
  rid: number;
}

export interface Account {
  uid: number;
  name: string;
  avatar: string | null;
  createdAt: number;
}

export interface ForwardInfo {
  authorName: string;
  authorFace: string | null;
  authorUrl: string | null;
  text: string;
  richText: RichTextNode[];
  images: string[];
  videoCover: string | null;
  videoTitle: string | null;
}

export interface Dynamic {
  id: string;
  uid: number;
  type: DynamicType;
  biliType: string;
  text: string;
  richText: RichTextNode[];
  raw: string;
  images: string[];
  authorName: string;
  authorFace: string | null;
  authorUrl: string | null;
  dynamicUrl: string;
  videoCover: string | null;
  videoTitle: string | null;
  forward: ForwardInfo | null;
  reserve: ReserveInfo | null;
  scheduleEntries: ScheduleEntryInfo[] | null;
  liveTime: number | null;
  liveTitle: string | null;
  createdAt: number;
  fetchedAt: number;
}

export type LiveType = "single" | "dual" | "group";

export interface ScheduleParticipant {
  uid: number;
  name: string;
  face: string | null;
}

export interface ScheduleEntryInfo {
  title: string;
  liveTime: number;
  liveType: LiveType | null;
  participants: ScheduleParticipant[];
  liveRoomUrl: string | null;
}

export interface LiveSchedule {
  id: number;
  dynamicId: string;
  uid: number;
  rid: number;
  title: string;
  liveTime: number;
  status: LiveStatus;
  createdAt: number;
  authorName: string | null;
  authorFace: string | null;
  dynamicUrl: string | null;
  liveType: LiveType | null;
  participants: ScheduleParticipant[] | null;
  liveRoomUrl: string | null;
  source: string | null;
}

export interface TimelineResponse {
  items: Dynamic[];
  nextCursor: string | null;
}

export interface CalendarResponse {
  schedules: LiveSchedule[];
}