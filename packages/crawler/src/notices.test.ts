import { expect, test } from "bun:test";
import { validNotice } from "./notices";

test("变更只可更新已有候选，时间使用北京时间且直播间必须为已知成员", () => {
  const text = "今晚20:00的3D团播更改为团体电台直播，提前至19:00";
  const candidates = [{ id: 1, liveTime: Date.parse("2026-11-20T20:00:00+08:00") }];
  const change = { id: 1, kind: "change" as const, title: "团体电台直播", time: "2026-11-20 19:00:00", roomOwnerUid: 672328094 };
  const decision = { summary: "提前至19点", evidence: "提前至19:00", changes: [change] };
  expect(validNotice(decision, candidates, text)).toBe(true);
  expect(validNotice({ ...decision, changes: [{ ...change, id: 99 }] }, candidates, text)).toBe(false);
  expect(validNotice({ ...decision, changes: [{ ...change, time: "2027-11-20 19:00:00" }] }, candidates, text)).toBe(false);
  expect(validNotice({ ...decision, evidence: "未出现的内容" }, candidates, text)).toBe(false);
  expect(validNotice({ ...decision, changes: [{ ...change, roomOwnerUid: 1 }] }, candidates, text)).toBe(false);
});
