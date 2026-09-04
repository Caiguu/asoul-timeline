import { createSignal, onMount, createMemo, For, Show } from "solid-js";
import type { LiveSchedule, ScheduleParticipant } from "@asoul-timeline/shared";
import { apiUrl } from "../api";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ACCOUNT_COLORS: Record<number, string> = {
  703007996: "#FC966E",
  672328094: "#E799B0",
  672353429: "#DB7D74",
  672342685: "#576690",
};
const ACCOUNT_AVATARS: Record<number, string> = {};

const LIVE_TYPE_LABELS: Record<string, string> = {
  single: "单播",
  dual: "双播",
  group: "团播",
};

function colorForUid(uid: number): string {
  return ACCOUNT_COLORS[uid] ?? "#888";
}

function primaryUid(s: LiveSchedule): number {
  if (s.liveType === "group" || s.liveType === "dual") return 703007996;
  if (s.participants && s.participants.length > 0) return s.participants[0].uid;
  return s.uid;
}

function allUids(s: LiveSchedule): number[] {
  if (s.participants && s.participants.length > 0) return s.participants.map((p) => p.uid);
  return [s.uid];
}

function fmtMonthLabel(y: number, m: number): string {
  return `${y}年${m + 1}月`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function fmtFull(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

interface DayCell {
  date: Date;
  inMonth: boolean;
  schedules: LiveSchedule[];
}

function buildMonthGrid(year: number, month: number, schedules: LiveSchedule[]): DayCell[] {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: DayCell[] = [];

  // 上月填充
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevDays - i);
    cells.push({ date: d, inMonth: false, schedules: schedulesForDay(schedules, d) });
  }
  // 本月
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    cells.push({ date: d, inMonth: true, schedules: schedulesForDay(schedules, d) });
  }
  // 下月填充到 42 格
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({ date: d, inMonth: false, schedules: schedulesForDay(schedules, d) });
  }
  return cells;
}

function schedulesForDay(schedules: LiveSchedule[], date: Date): LiveSchedule[] {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return schedules.filter((s) => {
    const sd = new Date(s.liveTime);
    return sd.getFullYear() === y && sd.getMonth() === m && sd.getDate() === d;
  });
}

function Participants(props: { s: LiveSchedule }) {
  const link = () => props.s.liveRoomUrl ?? props.s.dynamicUrl ?? "#";
  const participants = (): ScheduleParticipant[] => {
    if (props.s.participants && props.s.participants.length > 0) {
      return props.s.participants.map((p) => ({
        ...p,
        face: p.face ?? (props.s.authorFace && props.s.uid === p.uid ? props.s.authorFace : null) ?? ACCOUNT_AVATARS[p.uid] ?? null,
      }));
    }
    return [{ uid: props.s.uid, name: props.s.authorName ?? "", face: props.s.authorFace }];
  };
  return (
    <a href={link()} target="_blank" class="sced-author">
      <For each={participants()}>
        {(p, i) => (
          <>
            <Show when={i() > 0}><span class="sced-plus">+</span></Show>
            <Show when={p.face} fallback={<span class="sced-avatar-fallback" style={{ background: colorForUid(p.uid) }}>{p.name[0]}</span>}>
              <img src={p.face!} class="sced-avatar" alt={p.name} referrerpolicy="no-referrer" />
            </Show>
            <span class="sced-author-name">{p.name}</span>
          </>
        )}
      </For>
    </a>
  );
}

function ScheduleItem(props: { s: LiveSchedule }) {
  const title = () => props.s.title.replace(/^直播预约：/, "");
  const dotColor = () => colorForUid(primaryUid(props.s));
  const link = () => props.s.liveRoomUrl ?? props.s.dynamicUrl ?? "#";

  return (
    <a href={link()} target="_blank" class="sced-item" style={{ "--dot-color": dotColor() }}>
      <div class="sced-dot" style={{ "--dot-color": dotColor() }} />
      <div class="sced-body">
        <div class="sced-time-row">
          <span class="sced-time">{fmtTime(props.s.liveTime)}</span>
          <Show when={props.s.liveType}>
            <span class={`sced-type sced-type-${props.s.liveType}`}>{LIVE_TYPE_LABELS[props.s.liveType!]}</span>
          </Show>
        </div>
        <div class="sced-title">{title()}</div>
        <Participants s={props.s} />
      </div>
    </a>
  );
}

export default function CalendarMonth() {
  const now = new Date();
  const [viewYear, setViewYear] = createSignal(now.getFullYear());
  const [viewMonth, setViewMonth] = createSignal(now.getMonth());
  const [monthSchedules, setMonthSchedules] = createSignal<LiveSchedule[]>([]);
  const [upcoming, setUpcoming] = createSignal<LiveSchedule[]>([]);
  const [selectedDate, setSelectedDate] = createSignal<Date | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [showPicker, setShowPicker] = createSignal(false);
  const [pickerYear, setPickerYear] = createSignal(now.getFullYear());
  const [pickerMonth, setPickerMonth] = createSignal(now.getMonth());

  async function loadMonth() {
    setLoading(true);
    const y = viewYear();
    const m = viewMonth();
    const monthStr = `${y}-${String(m + 1).padStart(2, "0")}`;
    const res = await fetch(apiUrl(`/api/calendar?month=${monthStr}`));
    const data = await res.json();
    setMonthSchedules(data.schedules ?? []);
    setLoading(false);
  }

  async function loadUpcoming() {
    const res = await fetch(apiUrl("/api/calendar/upcoming"));
    const data = await res.json();
    setUpcoming(data.schedules ?? []);
  }

  async function copyICS() {
    const url = "https://asoul-timeline.pages.dev/calendar/asoul_schedule.ics";
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  }

  onMount(() => {
    loadMonth();
    loadUpcoming();
  });

  const grid = createMemo(() => buildMonthGrid(viewYear(), viewMonth(), monthSchedules()));
  const selectedDaySchedules = createMemo(() => {
    const d = selectedDate();
    if (!d) return [];
    return schedulesForDay(monthSchedules(), d);
  });

  function prevMonth() {
    let m = viewMonth() - 1;
    let y = viewYear();
    if (m < 0) { m = 11; y--; }
    setViewMonth(m); setViewYear(y);
    setSelectedDate(null);
    loadMonth();
  }
  function nextMonth() {
    let m = viewMonth() + 1;
    let y = viewYear();
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y);
    setSelectedDate(null);
    loadMonth();
  }
  function pickMonth() {
    setViewYear(pickerYear());
    setViewMonth(pickerMonth());
    setSelectedDate(null);
    setShowPicker(false);
    loadMonth();
  }

  return (
    <div class="cal">
      {/* ICS 下载按钮 */}
      <div class="cal-header">
        <h1>直播日历</h1>
        <button onClick={copyICS} class="cal-ics-btn" title="复制订阅链接，可导入苹果/Google日历">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          复制订阅链接
        </button>
      </div>

      {/* 月份导航 */}
      <div class="cal-nav">
        <button class="cal-nav-btn" onClick={prevMonth}>&lt;</button>
        <div class="cal-nav-title" onClick={() => setShowPicker(!showPicker())}>
          {fmtMonthLabel(viewYear(), viewMonth())}
          <span class="cal-nav-arrow">{showPicker() ? "▲" : "▼"}</span>
        </div>
        <button class="cal-nav-btn" onClick={nextMonth}>&gt;</button>
      </div>

      {/* 月份选择器 */}
      <Show when={showPicker()}>
        <div class="cal-picker">
          <div class="cal-picker-years">
            <button onClick={() => setPickerYear(pickerYear() - 1)}>&lt;</button>
            <span>{pickerYear()}年</span>
            <button onClick={() => setPickerYear(pickerYear() + 1)}>&gt;</button>
          </div>
          <div class="cal-picker-months">
            <For each={Array.from({ length: 12 }, (_, i) => i)}>
              {(m) => (
                <button
                  classList={{
                    "cal-pm": true,
                    "cal-pm-active": m === pickerMonth() && pickerYear() === viewYear(),
                    "cal-pm-current": m === now.getMonth() && pickerYear() === now.getFullYear(),
                  }}
                  onClick={() => setPickerMonth(m)}
                >
                  {m + 1}月
                </button>
              )}
            </For>
          </div>
          <button class="cal-picker-ok" onClick={pickMonth}>确定</button>
        </div>
      </Show>

      {/* 月视图 */}
      <div class="cal-grid" classList={{ "cal-loading": loading() }}>
        <For each={WEEKDAYS}>
          {(w) => <div class="cal-weekday">{w}</div>}
        </For>
        <For each={grid()}>
          {(cell) => {
            const isToday = cell.date.toDateString() === now.toDateString();
            const uids = [...new Set(cell.schedules.map((s) => primaryUid(s)))];
            return (
              <div
                class="cal-cell"
                classList={{
                  "cal-cell-out": !cell.inMonth,
                  "cal-cell-today": isToday,
                }}
                data-selected={selectedDate() && cell.date.toDateString() === selectedDate()?.toDateString() || undefined}
                onClick={() => setSelectedDate(cell.date)}
              >
                <span class="cal-date">{cell.date.getDate()}</span>
                <Show when={cell.schedules.length > 0}>
                  <div class="cal-dots">
                    <For each={uids.slice(0, 4)}>
                      {(uid) => <span class="cal-dot" style={{ background: colorForUid(uid) }} />}
                    </For>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* 日视图 */}
      <Show when={selectedDate()}>
        <div class="cal-day-view">
          <div class="cal-section-title">
            {selectedDate()!.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
            <span class="cal-section-count">{selectedDaySchedules().length}场直播</span>
          </div>
          <Show when={selectedDaySchedules().length > 0} fallback={<p class="cal-empty">当天暂无直播</p>}>
            <div class="sced-list">
              <For each={selectedDaySchedules()}>
                {(s) => <ScheduleItem s={s} />}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* 近期直播 */}
      <div class="cal-upcoming">
        <div class="cal-section-title">
          近期直播
          <span class="cal-section-count">{upcoming().length}场</span>
        </div>
        <Show when={upcoming().length > 0} fallback={<p class="cal-empty">近期暂无直播安排</p>}>
          <div class="sced-list">
            <For each={upcoming()}>
              {(s) => (
                <div class="sced-item-group">
                  <div class="sced-date-label">{fmtDate(s.liveTime)}</div>
                  <ScheduleItem s={s} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* 图例 */}
      <div class="cal-legend">
        <For each={Object.entries(ACCOUNT_COLORS)}>
          {([uid, color]) => {
            const names: Record<number, string> = {
              703007996: "A-SOUL",
              672328094: "嘉然",
              672353429: "贝拉",
              672342685: "乃琳",
            };
            return (
              <span class="cal-legend-item">
                <span class="cal-dot" style={{ background: color }} />
                {names[Number(uid)] ?? uid}
              </span>
            );
          }}
        </For>
      </div>
    </div>
  );
}