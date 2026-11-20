import type { ManifestSchedule } from "@/player/offline/store";

export interface Announcement {
  key: string;
  title: string;
  body: string;
  /** لحظة البدء بتوقيت الخادم */
  at: number;
  report?: (status: "played" | "missed", driftMs: number | null, error?: string) => void;
}

/** الإعلان المتأخر أكثر من هذا لا يُعرض */
export const LATE_LIMIT_MS = 90_000;
/** يُجهز التشغيل الدقيق قبل موعده بهذه المدة */
const LEAD_MS = 2_000;
const FIRED_KEY = "signage-fired-announcements";

const listeners = new Set<(item: Announcement) => void>();
const seen = new Set<string>();
const waiting: Announcement[] = [];

export function wasAnnounced(key: string) {
  return seen.has(key);
}

export function emitAnnouncement(item: Announcement) {
  if (seen.has(item.key)) return;
  seen.add(item.key);
  if (listeners.size === 0) waiting.push(item);
  listeners.forEach((listener) => listener(item));
}

export function onAnnouncement(listener: (item: Announcement) => void) {
  listeners.add(listener);
  waiting.splice(0).forEach(listener);
  return () => void listeners.delete(listener);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoned(ms: number, timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second) + (ms % 1000) / 1000;
  return { date, weekday, seconds };
}

function toSeconds(time: string) {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

/** موعد اليوم إن كان قريبًا (أو فات قبل قليل)، بتوقيت الخادم */
export function nearOccurrence(schedule: ManifestSchedule, serverNow: number) {
  const local = zoned(serverNow, schedule.timezone || "Africa/Tripoli");
  const diff = toSeconds(schedule.local_time) - local.seconds;
  if (diff > LEAD_MS / 1000 || diff * 1000 < -LATE_LIMIT_MS) return null;
  if (schedule.recurrence === "once" && schedule.run_on !== local.date) return null;
  if (schedule.recurrence === "weekly" && !schedule.weekdays?.includes(local.weekday)) return null;
  const at = serverNow + diff * 1000;
  if (schedule.starts_at && at < Date.parse(schedule.starts_at)) return null;
  if (schedule.ends_at && at >= Date.parse(schedule.ends_at)) return null;
  return { key: `schedule:${schedule.id}:${local.date}`, at };
}

/** يمنع تكرار الإعلان نفسه بعد إعادة تحميل الصفحة */
export function firedBefore(key: string) {
  try {
    const list = JSON.parse(window.localStorage.getItem(FIRED_KEY) ?? "[]") as string[];
    if (list.includes(key)) return true;
    window.localStorage.setItem(FIRED_KEY, JSON.stringify([...list.slice(-199), key]));
  } catch {
    // التخزين المحلي غير متاح: يكفي منع التكرار داخل الجلسة
  }
  return false;
}

export function checkSchedules(schedules: ManifestSchedule[] | undefined, serverNow: number) {
  for (const schedule of schedules ?? []) {
    const occurrence = nearOccurrence(schedule, serverNow);
    if (!occurrence || seen.has(occurrence.key) || firedBefore(occurrence.key)) continue;
    emitAnnouncement({ key: occurrence.key, title: schedule.title, body: schedule.body, at: occurrence.at });
  }
}
