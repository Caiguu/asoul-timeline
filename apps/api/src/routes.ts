// 共享路由创建函数，兼容本地 bun:sqlite 和远程 libsql (Turso)
import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, desc, and, gte, lt } from "drizzle-orm";
import { accounts, dynamics, liveSchedules } from "@asoul-timeline/db";
import { getLiveStatus } from "./live-status";

export function createApp(db: any) {
  const app = new Hono();

  app.use("/api/*", cors());
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }));

  app.get("/api/accounts", async (c) => {
    const rows = await db.select().from(accounts).all();
    return c.json({ accounts: rows });
  });

  app.get("/api/timeline", async (c) => {
    const cursor = Number(c.req.query("cursor") ?? 0);
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

    const conds: any[] = [];
    if (cursor) conds.push(lt(dynamics.createdAt, cursor));

    const rows = await db
      .select()
      .from(dynamics)
      .where(and(...conds))
      .orderBy(desc(dynamics.createdAt))
      .limit(limit)
      .all();

    const items = (rows as any[]).map(({ raw, ...rest }: any) => rest);

    const nextCursor =
      items.length === limit && items.length > 0
        ? String(items[items.length - 1].createdAt)
        : null;

    return c.json({ items, nextCursor });
  });

  const scheduleFields = {
    id: liveSchedules.id,
    dynamicId: liveSchedules.dynamicId,
    uid: liveSchedules.uid,
    rid: liveSchedules.rid,
    title: liveSchedules.title,
    liveTime: liveSchedules.liveTime,
    status: liveSchedules.status,
    createdAt: liveSchedules.createdAt,
    authorName: dynamics.authorName,
    authorFace: dynamics.authorFace,
    dynamicUrl: dynamics.dynamicUrl,
    liveType: liveSchedules.liveType,
    participants: liveSchedules.participants,
    liveRoomUrl: liveSchedules.liveRoomUrl,
    source: liveSchedules.source,
  };

  app.get("/api/calendar", async (c) => {
    const month = c.req.query("month");
    const date = c.req.query("date");

    let start: number;
    let end: number;

    if (month) {
      const [y, m] = month.split("-").map(Number);
      start = new Date(y, m - 1, 1).getTime();
      end = new Date(y, m, 1).getTime();
    } else if (date) {
      const [y, m, d] = date.split("-").map(Number);
      start = new Date(y, m - 1, d).getTime();
      end = new Date(y, m - 1, d + 1).getTime();
    } else {
      return c.json({ error: "need month or date query" }, 400);
    }

    const schedules = await db
      .select(scheduleFields)
      .from(liveSchedules)
      .leftJoin(dynamics, eq(liveSchedules.dynamicId, dynamics.id))
      .where(and(gte(liveSchedules.liveTime, start), lt(liveSchedules.liveTime, end)))
      .orderBy(liveSchedules.liveTime)
      .all();

    return c.json({ schedules });
  });

  app.get("/api/calendar/upcoming", async (c) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekLater = todayStart + 7 * 24 * 60 * 60 * 1000;

    const schedules = await db
      .select(scheduleFields)
      .from(liveSchedules)
      .leftJoin(dynamics, eq(liveSchedules.dynamicId, dynamics.id))
      .where(and(gte(liveSchedules.liveTime, todayStart), lt(liveSchedules.liveTime, weekLater)))
      .orderBy(liveSchedules.liveTime)
      .all();

    return c.json({ schedules });
  });

  app.get("/api/calendar/ics", async (c) => {
    const now = Date.now();
    const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000;
    const yearLater = now + 365 * 24 * 60 * 60 * 1000;

    const rows = await db
      .select(scheduleFields)
      .from(liveSchedules)
      .leftJoin(dynamics, eq(liveSchedules.dynamicId, dynamics.id))
      .where(and(gte(liveSchedules.liveTime, threeMonthsAgo), lt(liveSchedules.liveTime, yearLater)))
      .orderBy(liveSchedules.liveTime)
      .all();

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//A-SOUL Timeline//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:A-SOUL 直播日历",
      "X-WR-CALDESC:A-SOUL女团直播日程 - 自动生成",
    ];

    for (const s of rows as any[]) {
      const start = new Date(s.liveTime);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const formatDT = (d: Date) =>
        d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

      const parts = s.participants as any[] | null;
      const authorName = s.authorName ?? parts?.[0]?.name ?? "A-SOUL";
      const participants = parts ? parts.map((p: any) => p.name).join(" + ") : authorName;
      const shortTitle = s.title.replace(/^直播预约：/, "").replace(/^【.+?】/, "").trim();
      const title = `${participants} - ${shortTitle}`;
      const url = s.liveRoomUrl ?? s.dynamicUrl ?? "";
      const desc = [
        `参与成员：${participants}`,
        url ? `直播间：${url}` : "",
        s.source === "schedule" ? "来源：日程表" : "来源：直播预约",
      ].filter(Boolean).join("\\n");

      const vevent = [
        "BEGIN:VEVENT",
        `DTSTART:${formatDT(start)}`,
        `DTEND:${formatDT(end)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${desc}`,
      ];
      if (url) vevent.push(`URL:${url}`);
      vevent.push(`UID:${s.rid}@asoul-timeline`);
      vevent.push("END:VEVENT");
      lines.push(...vevent);
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="asoul_schedule.ics"',
      },
    });
  });

  app.get("/api/dynamic/:id", async (c) => {
    const id = c.req.param("id");
    const item = await db.select().from(dynamics).where(eq(dynamics.id, id)).get();
    if (!item) return c.json({ error: "not found" }, 404);
    return c.json({ item });
  });
app.get("/api/live-status", async (c) => {
    const members = await getLiveStatus(db);
    return c.json({ members });
  });

  return app;
}
