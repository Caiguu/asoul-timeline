import { liveStatus } from "@asoul-timeline/db";

export async function getLiveStatus(db: any): Promise<any[]> {
  const rows = await db.select().from(liveStatus).all();
  return (rows as any[]).map((r: any) => ({
    uid: r.uid,
    name: r.name,
    roomId: r.roomId,
    liveStatus: r.liveStatus,
    title: r.title,
    online: r.online,
    cover: r.cover,
  }));
}