import { createSignal, onMount, For, Show } from "solid-js";
import type { Dynamic, RichTextNode, ScheduleParticipant, ReserveInfo, ScheduleEntryInfo } from "@asoul-timeline/shared";
import { apiUrl } from "../api";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function fmtFullTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

const LIVE_TYPE_LABELS: Record<string, string> = {
  single: "单播", dual: "双播", group: "团播",
};

// 应援色
const ACCOUNT_COLORS: Record<number, string> = {
  672328094: "#E799B0",
  672353429: "#DB7D74",
  672342685: "#576690",
  703007996: "#FC966E",
};

// 单人动态用个人应援色；多人动态（participants > 1 或转发/Official）用团体色
function themeColorFor(item: Dynamic): string {
  if (item.uid === 703007996) return ACCOUNT_COLORS[703007996];
  return ACCOUNT_COLORS[item.uid] ?? "#ff6b9d";
}

// 直播条目按参与人数决定颜色
function themeColorForParticipants(participants: ScheduleParticipant[]): string {
  if (!participants || participants.length <= 1) {
    const uid = participants?.[0]?.uid ?? 703007996;
    return ACCOUNT_COLORS[uid] ?? "#ff6b9d";
  }
  return ACCOUNT_COLORS[703007996];
}

/* 统一的"直播预告"卡片：左边标签，右边成员头像ID+时间标题 */
function LivePreviewCard(props: {
  participants: ScheduleParticipant[];
  title: string;
  timeText: string;
  href: string;
  liveType?: string | null;
  group?: boolean;
}) {
  const color = () => themeColorForParticipants(props.participants);
  return (
    <a
      href={props.href}
      target="_blank"
      class="live-preview-card"
      onClick={(e) => e.stopPropagation()}
      classList={{ "lpc-group": props.group }}
      style={{ "--theme-color": color() }}
    >
      <div class="lpc-label">直播预告</div>
      <div class="lpc-body">
        <div class="lpc-title">{props.title}</div>
        <div class="lpc-desc">
          <span class="lpc-time">{props.timeText}</span>
          <Show when={props.liveType}>
            <span class={`lpc-type lpc-type-${props.liveType}`}>{LIVE_TYPE_LABELS[props.liveType!] ?? props.liveType}</span>
          </Show>
        </div>
        <div class="lpc-members">
          <For each={props.participants}>
            {(p, i) => (
              <>
                <Show when={i() > 0}><span class="lpc-plus">+</span></Show>
                <Show when={p.face} fallback={<span class="lpc-avatar-fb">{p.name[0]}</span>}>
                  <img src={p.face!} class="lpc-avatar" alt={p.name} referrerpolicy="no-referrer" />
                </Show>
                <span class="lpc-name">{p.name}</span>
              </>
            )}
          </For>
        </div>
      </div>
    </a>
  );
}

function parseReserveTime(text: string): string {
  if (!text) return "";
  const m = text.match(/(\d{1,2}[-月]\d{1,2})?\s*(今天|明天)?\s*(\d{1,2}:\d{2})\s*直播/);
  if (m) {
    let prefix = m[1] ? m[1].replace("月", "-") : (m[2] ?? "");
    if (m[2]) prefix = m[2];
    return `${prefix} ${m[3]}`.trim();
  }
  return text;
}

function RichText(props: { nodes: RichTextNode[] }) {
  return (
    <span>
      <For each={props.nodes}>
        {(n) => (
          <Show
            when={n.type === "emoji" && n.url}
            fallback={<span>{n.text}</span>}
          >
            <img
              src={n.url!}
              class="emoji"
              alt={n.text}
              referrerpolicy="no-referrer"
            />
          </Show>
        )}
      </For>
    </span>
  );
}

export default function Timeline() {
  const [items, setItems] = createSignal<Dynamic[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [pageCount, setPageCount] = createSignal(1);
  const MAX_PAGES = 5;
  const [lightbox, setLightbox] = createSignal<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: "20" });
    if (cursor()) params.set("cursor", cursor()!);
    const res = await fetch(apiUrl(`/api/timeline?${params}`));
    const data = await res.json();
    setItems((prev) => [...prev, ...(data.items ?? [])]);
    setCursor(data.nextCursor);
    setPageCount((p) => p + 1);
    setLoading(false);
  }

  onMount(load);

  return (
    <div>
      <div class="timeline">
        <For each={items()}>
          {(item) => {
            const themeColor = themeColorFor(item);
            return (
            <div class="card" style={{ "--theme-color": themeColor }}>
              <div class="card-line" />
              <div class="card-dot" />
              <div class="card-inner" onClick={(e) => {
                if ((e.target as HTMLElement).closest("a") || (e.target as HTMLElement).closest("img")) return;
                window.open(item.dynamicUrl, "_blank");
              }}>
                <div class="card-header">
                  <a href={item.authorUrl ?? "#"} target="_blank" class="avatar-link">
                    <Show when={item.authorFace} fallback={<div class="avatar-fallback">{item.authorName[0]}</div>}>
                      <img src={item.authorFace} class="avatar" alt={item.authorName} referrerpolicy="no-referrer" />
                    </Show>
                  </a>
                  <a href={item.authorUrl ?? "#"} target="_blank" class="author-name">
                    {item.authorName}
                  </a>
                  <span class="time" title={fmtFullTime(item.createdAt)}>{fmtTime(item.createdAt)}</span>
                  <span class={`type-tag type-${item.biliType === "DYNAMIC_TYPE_AV" ? "video" : item.type}`}>
                    {item.biliType === "DYNAMIC_TYPE_AV" ? "视频" : item.type === "live_reserve" ? "直播预约" : "动态"}
                  </span>
                </div>

                <Show when={item.reserve}>
                  {(rsv: ReserveInfo) => (
                    <LivePreviewCard
                      participants={[{ uid: item.uid, name: item.authorName, face: item.authorFace }]}
                      title={rsv().title.replace(/^直播预约：/, "")}
                      timeText={parseReserveTime(rsv().liveTimeText)}
                      href={item.dynamicUrl}
                    />
                  )}
                </Show>

                <Show when={item.scheduleEntries && item.scheduleEntries.length > 0}>
                  <div class="schedule-list">
                    <For each={item.scheduleEntries}>
                      {(entry: ScheduleEntryInfo) => (
                        <LivePreviewCard
                          participants={entry.participants}
                          title={entry.title}
                          timeText={`${new Date(entry.liveTime).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })} ${new Date(entry.liveTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`}
                          href={item.dynamicUrl}
                          liveType={entry.liveType}
                          group={entry.liveType === "group"}
                        />
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={item.text || item.richText.length > 0}>
                  <p class="text">
                    <RichText nodes={item.richText.length ? item.richText : [{ type: "text", text: item.text }]} />
                  </p>
                </Show>

                <Show when={item.videoCover}>
                  <div class="video-cover" onClick={(e) => { e.stopPropagation(); setLightbox(item.videoCover!); }}>
                    <img src={item.videoCover} alt={item.videoTitle ?? ""} loading="lazy" referrerpolicy="no-referrer" />
                    <Show when={item.videoTitle}>
                      <p class="video-title">{item.videoTitle}</p>
                    </Show>
                  </div>
                </Show>

                <Show when={item.images.length > 0}>
                  <div class={`imgs imgs-${Math.min(item.images.length, 3)}`}>
                    <For each={item.images}>
                      {(img) => (
                        <img
                          src={img}
                          class="img-thumb"
                          loading="lazy"
                          referrerpolicy="no-referrer"
                          onClick={(e) => { e.stopPropagation(); setLightbox(img); }}
                        />
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={item.forward}>
                  {(fwd) => (
                    <div class="forward">
                      <div class="forward-header">
                        <Show when={fwd().authorFace}>
                          <img src={fwd().authorFace!} class="fwd-avatar" alt={fwd().authorName} referrerpolicy="no-referrer" />
                        </Show>
                        <a href={fwd().authorUrl ?? "#"} target="_blank" class="fwd-author">
                          @{fwd().authorName}
                        </a>
                      </div>
                      <Show when={fwd().text || fwd().richText.length > 0}>
                        <p class="fwd-text">
                          <RichText nodes={fwd().richText.length ? fwd().richText : [{ type: "text", text: fwd().text }]} />
                        </p>
                      </Show>
                      <Show when={fwd().videoCover}>
                        <div class="video-cover" onClick={(e) => { e.stopPropagation(); setLightbox(fwd().videoCover!); }}>
                          <img src={fwd().videoCover!} alt={fwd().videoTitle ?? ""} loading="lazy" referrerpolicy="no-referrer" />
                        </div>
                      </Show>
                      <Show when={fwd().images.length > 0}>
                        <div class={`imgs imgs-${Math.min(fwd().images.length, 3)}`}>
                          <For each={fwd().images}>
                            {(img) => (
                              <img
                                src={img}
                                class="img-thumb"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                                onClick={(e) => { e.stopPropagation(); setLightbox(img); }}
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>

                <Show when={item.liveTitle}>
                  <div class="live-info">
                    <span class="live-badge">直播</span>
                    {item.liveTitle}
                    <Show when={item.liveTime}>
                      <time class="live-time">{fmtFullTime(item.liveTime!)}</time>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>
          );
          }}
        </For>
      </div>

      <Show when={loading()}>
        <p class="load-more">加载中…</p>
      </Show>
      <Show when={cursor() && !loading() && pageCount() < MAX_PAGES}>
        <button class="load-more" onClick={load}>加载更多</button>
      </Show>

      <Show when={lightbox()}>
        <div class="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox()!} class="lightbox-img" referrerpolicy="no-referrer" />
        </div>
      </Show>
    </div>
  );
}