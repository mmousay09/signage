import { getPlayerClient } from "@/lib/supabase/player";
import type { KioskLanguage } from "@/player/offline/store";

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
