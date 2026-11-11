import { expect, test } from "bun:test";
import { createApp } from "./routes";

test("API hides superseded entries, preserves cancellations and exposes the same timeline decisions", async () => {
  const entries = [
    { id: 1, dynamicId: "a", status: "upcoming", title: "新主题", liveTime: 1000, participants: [{ uid: 1 }] },
    { id: 2, dynamicId: "b", status: "superseded", title: "旧主题", liveTime: 1000, participants: [{ uid: 1 }] },
    { id: 3, dynamicId: "c", status: "cancelled", title: "突击", liveTime: 2000, participants: [{ uid: 2 }] },
    { id: 4, dynamicId: "d", status: "cancelled", title: "突击重复", liveTime: 2000, participants: [{ uid: 2 }] },
  ];
  let selected: unknown;
  const query: any = {
    from(table: any) { selected = table; return query; },
    where() { return query; }, leftJoin() { return query; },
    orderBy() { return query; }, limit() { return query; },
    async all() {
      const { dynamics } = await import("@asoul-timeline/db");
      return selected === dynamics ? [{ id: "b", raw: "private", createdAt: 100 }] : entries;
    },
  };
  const app = createApp({ select: () => query });
  const calendar = await (await app.request("/api/calendar?month=2026-11")).json();
  expect(calendar.schedules.map((s: any) => s.id)).toEqual([1, 3]);
  const timeline = await (await app.request("/api/timeline")).json();
  expect(timeline.items[0].resolvedSchedules).toEqual([]);
  expect(timeline.items[0].raw).toBeUndefined();
});
