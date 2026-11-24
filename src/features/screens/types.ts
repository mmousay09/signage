export interface ScreenRow {
  id: string;
  org_id: string;
  name: string | null;
  location: string | null;
  status: "pending" | "active" | "disabled";
  last_seen_at: string | null;
  app_version: string | null;
  is_online: boolean;
  contract_title: string | null;
  client_name: string | null;
  playlist_id: string | null;
  layout_id: string | null;
  cached_bytes: number | null;
  free_bytes: number | null;
  player_state: {
    content?: { status?: string; ready?: number; total?: number; error?: string };
    now?: { kind: string; label: string } | null;
    volume?: number;
    audio?: "ready" | "blocked" | "unknown";
    wake_lock?: boolean;
    display?: string;
    fullscreen?: boolean;
  } | null;
}

export type ScreenCommand = "reload" | "identify" | "resync";

const ONLINE_WINDOW_MS = 90_000;

export function isOnline(screen: ScreenRow, now: number | null) {
  if (screen.status !== "active") return false;
  if (now === null) return screen.is_online;
  return Boolean(screen.last_seen_at && now - Date.parse(screen.last_seen_at) < ONLINE_WINDOW_MS);
}

export function lastSeenText(screen: ScreenRow, now: number | null) {
  if (!screen.last_seen_at) return "لم تتصل بعد";
  if (now === null) return "";
  const minutes = Math.round((Date.parse(screen.last_seen_at) - now) / 60_000);
  const format = new Intl.RelativeTimeFormat("ar-LY", { numeric: "auto" });
  if (minutes > -60) return `آخر اتصال ${format.format(Math.min(minutes, 0), "minute")}`;
  if (minutes > -1440) return `آخر اتصال ${format.format(Math.round(minutes / 60), "hour")}`;
  return `آخر اتصال ${format.format(Math.round(minutes / 1440), "day")}`;
}
