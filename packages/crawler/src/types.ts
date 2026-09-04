import type { DynamicType, ForwardInfo, RichTextNode, ReserveInfo, ScheduleEntryInfo } from "@asoul-timeline/shared";

export interface RawDynamic {
  id: string;
  uid: number;
  biliType: string;
  text: string;
  richText: RichTextNode[];
  images: string[];
  raw: string;
  authorName: string;
  authorFace: string | null;
  authorUrl: string | null;
  dynamicUrl: string;
  videoCover: string | null;
  videoTitle: string | null;
  forward: ForwardInfo | null;
  reserve: ReserveInfo | null;
  scheduleEntries: ScheduleEntryInfo[] | null;
  createdAt: number;
}

export interface ClassifyResult {
  type: DynamicType;
  text: string;
  liveTime: number | null;
  liveTitle: string | null;
}