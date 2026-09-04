import { createSignal, onMount, For, Show } from "solid-js";
import { apiUrl } from "../api";

interface LiveMember {
  uid: number;
  name: string;
  roomId: number;
  liveStatus: number;
  title: string;
  online: number;
  cover: string;
  liveTime: number;
}

const COLORS: Record<number, string> = {
  672328094: "#E799B0",
  672353429: "#DB7D74",
  672342685: "#576690",
};

function fmtOnline(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

export default function LiveStatus() {
  const [members, setMembers] = createSignal<LiveMember[]>([]);

  onMount(async () => {
    const res = await fetch(apiUrl("/api/live-status"));
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
    }
    setInterval(async () => {
      const r = await fetch(apiUrl("/api/live-status"));
      if (r.ok) {
        const d = await r.json();
        setMembers(d.members ?? []);
      }
    }, 30000);
  });

  return (
    <div class="ls-grid">
      <For each={members()}>
        {(m) => {
          const live = m.liveStatus === 1;
          const color = COLORS[m.uid] ?? "#888";
          const url = `https://live.bilibili.com/${m.roomId}`;
          return (
            <a
              href={url}
              target="_blank"
              class={`ls-card ${live ? "ls-live" : ""}`}
              style={{ "--color": color }}
            >
              <div class="ls-avatar-wrap">
                <Show when={m.cover} fallback={<div class="ls-avatar-fb" style={{ background: color }}>{m.name[0]}</div>}>
                  <img src={m.cover} class="ls-avatar" alt={m.name} referrerpolicy="no-referrer" />
                </Show>
                <Show when={live}>
                  <div class="ls-badge">LIVE</div>
                </Show>
              </div>
              <div class="ls-body">
                <div class="ls-name" style={{ color: live ? color : "#999" }}>{m.name}</div>
                <Show when={live && m.title}>
                  <div class="ls-title">{m.title}</div>
                </Show>
                <Show when={live && m.online > 0}>
                  <div class="ls-online">{fmtOnline(m.online)} 人观看</div>
                </Show>
                <Show when={!live}>
                  <div class="ls-offline">{m.liveStatus === 2 ? "回放中" : "未开播"}</div>
                </Show>
              </div>
            </a>
          );
        }}
      </For>
    </div>
  );
}