import { describe, expect, test } from "bun:test";
import { overlaps, validSelection, type Candidate } from "./reconcile";

const make = (id: number, uids: number[], liveTime = 1000): Candidate => ({
  id, uid: uids[0], participants: uids.map(uid => ({ uid })), liveTime, liveType: uids.length === 1 ? "single" : "dual",
});

describe("成员与时刻冲突约束", () => {
  test("同时间不同成员单播互不冲突", () => {
    expect(overlaps(make(1, [1]), make(2, [2]))).toBe(false);
    expect(validSelection([make(1, [1]), make(2, [2])], [1, 2])).toBe(true);
    expect(validSelection([make(1, [1]), make(2, [2])], [1])).toBe(false);
  });
  test("预约和日程表同成员同时间只能选一条", () => {
    const rows = [make(1, [1]), make(2, [1])];
    expect(validSelection(rows, [1])).toBe(true);
    expect(validSelection(rows, [1, 2])).toBe(false);
    expect(validSelection(rows, [9])).toBe(false);
  });
  test("多人直播占用所有参与成员，保留不相交单播", () => {
    const rows = [make(1, [1, 2]), make(2, [1]), make(3, [2]), make(4, [3])];
    expect(validSelection(rows, [1, 4])).toBe(true);
    expect(validSelection(rows, [2, 3, 4])).toBe(true);
    expect(validSelection(rows, [1, 2, 4])).toBe(false);
  });
  test("同成员不同时间可以共存", () => {
    expect(overlaps(make(1, [1]), make(2, [1], 2000))).toBe(false);
  });
});
