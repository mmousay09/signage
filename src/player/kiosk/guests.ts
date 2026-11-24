import { getPlayerClient } from "@/lib/supabase/player";
import type { KioskLanguage } from "@/player/offline/store";
export { parseBadgeCode } from "@/lib/badge";

const QUEUE_KEY = "signage-guest-queue";
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** أخطاء نهائية: إعادة الإرسال لن تنجح، فيُحذف الطلب من الانتظار */
const FINAL_ERRORS = new Set(["42501", "P0001", "23514", "22001"]);

export interface GuestInput {
  full_name: string;
  organization: string;
  job_title: string;
  phone: string;
  email: string;
}

interface QueuedGuest extends GuestInput {
  contract: string;
  code: string;
  language: KioskLanguage;
  registered_at: string;
}

export function newBadgeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export const badgeUrl = (code: string) => `${window.location.origin}/b/${code}`;

function readQueue(): QueuedGuest[] {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedGuest[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedGuest[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-500)));
  } catch {
    // التخزين ممتلئ: يبقى التسجيل الحالي في الذاكرة حتى إعادة المحاولة
  }
}

async function send(guest: QueuedGuest): Promise<"sent" | "final" | "retry"> {
  const { error } = await getPlayerClient().rpc("register_guest", {
    p_contract: guest.contract,
    p_code: guest.code,
    p_full_name: guest.full_name,
    p_organization: guest.organization,
    p_job_title: guest.job_title,
    p_phone: guest.phone,
    p_email: guest.email,
    p_language: guest.language,
    p_registered_at: guest.registered_at,
  });
  if (!error) return "sent";
  return error.code && FINAL_ERRORS.has(error.code) ? "final" : "retry";
}

/** يحفظ التسجيل أولًا ثم يرسله، فلا يضيع إن انقطع الإنترنت */
export async function registerGuest(contract: string, language: KioskLanguage, input: GuestInput) {
  const guest: QueuedGuest = {
    ...input,
    contract,
    language,
    code: newBadgeCode(),
    registered_at: new Date().toISOString(),
  };
  writeQueue([...readQueue(), guest]);
  const result = await Promise.race([
    send(guest),
    new Promise<"retry">((resolve) => setTimeout(() => resolve("retry"), 6_000)),
  ]);
  if (result !== "retry") writeQueue(readQueue().filter((item) => item.code !== guest.code));
  return { code: guest.code, status: result };
}

let flushing = false;

export async function flushGuestQueue() {
  if (flushing) return;
  flushing = true;
  try {
    for (const guest of readQueue()) {
      const result = await send(guest);
      if (result === "retry") break;
      writeQueue(readQueue().filter((item) => item.code !== guest.code));
    }
  } finally {
    flushing = false;
  }
}

// ===== تسجيل الحضور =====

const CHECKIN_QUEUE_KEY = "signage-checkin-queue";

export type CheckInStatus = "checked_in" | "already" | "not_found" | "other_event" | "queued" | "closed";

export interface CheckInResult {
  status: CheckInStatus;
  name?: string;
}

interface QueuedCheckIn {
  contract: string;
  code: string;
  at: string;
}

function readCheckIns(): QueuedCheckIn[] {
  try {
    return JSON.parse(window.localStorage.getItem(CHECKIN_QUEUE_KEY) ?? "[]") as QueuedCheckIn[];
  } catch {
    return [];
  }
}

function writeCheckIns(queue: QueuedCheckIn[]) {
  try {
    window.localStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify(queue.slice(-1000)));
  } catch {
    // التخزين ممتلئ
  }
}

async function sendCheckIn(item: QueuedCheckIn): Promise<CheckInResult | "retry"> {
  const { data, error } = await getPlayerClient().rpc("check_in_guest", {
    p_contract: item.contract,
    p_code: item.code,
    p_at: item.at,
  });
  if (error) return error.code && FINAL_ERRORS.has(error.code) ? { status: "closed" } : "retry";
  const result = data as { status: CheckInStatus; full_name?: string };
  return { status: result.status, name: result.full_name };
}

/** دون إنترنت يُحفظ المسح بوقته ويُرسل لاحقًا، فلا يُرَدّ ضيف عند الباب */
export async function checkInGuest(contract: string, code: string): Promise<CheckInResult> {
  // الضيف المسجل على هذه الشاشة ولم يُرسل تسجيله بعد: يُعرف اسمه محليًا
  const local = readQueue().find((guest) => guest.code === code && guest.contract === contract);
  const item: QueuedCheckIn = { contract, code, at: new Date().toISOString() };
  const result = local
    ? "retry"
    : await Promise.race([
        sendCheckIn(item).catch(() => "retry" as const),
        new Promise<"retry">((resolve) => setTimeout(() => resolve("retry"), 6_000)),
      ]);
  if (result !== "retry") return result;
  if (!readCheckIns().some((entry) => entry.code === code)) writeCheckIns([...readCheckIns(), item]);
  return { status: "queued", name: local?.full_name };
}

let flushingCheckIns = false;

export async function flushCheckInQueue() {
  if (flushingCheckIns) return;
  flushingCheckIns = true;
  try {
    // التسجيلات أولًا، حتى يجد الخادم الضيف قبل تسجيل حضوره
    await flushGuestQueue();
    const pendingGuests = new Set(readQueue().map((guest) => guest.code));
    for (const item of readCheckIns()) {
      if (pendingGuests.has(item.code)) continue;
      const result = await sendCheckIn(item);
      if (result === "retry") break;
      writeCheckIns(readCheckIns().filter((entry) => entry.code !== item.code));
    }
  } finally {
    flushingCheckIns = false;
  }
}
