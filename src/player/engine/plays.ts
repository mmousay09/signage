import type { SupabaseClient } from "@supabase/supabase-js";

// إثبات العرض: يُجمع عدد مرات ومدة عرض كل مادة لكل ساعة، ويُرسل مع النبض.
// يُحفظ محليًا أولًا فلا يضيع شيء أثناء انقطاع الإنترنت.

const KEY = "signage-play-stats";
const MAX_ROWS = 2_000;

interface PlayRow {
  contract: string;
  key: string;
  label: string;
  hour: string;
  plays: number;
  ms: number;
}

function read(): Record<string, PlayRow> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, PlayRow>;
  } catch {
    return {};
  }
}

function write(rows: Record<string, PlayRow>) {
  try {
    const entries = Object.entries(rows);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_ROWS))));
  } catch {
    // التخزين ممتلئ: تضيع إحصاءة واحدة ولا يتوقف العرض
  }
}

export function recordPlay(contract: string, key: string, label: string, ms: number, at = Date.now()) {
  if (ms < 1_000) return;
  const hour = new Date(Math.floor(at / 3_600_000) * 3_600_000).toISOString();
  const id = `${contract}|${key}|${hour}`;
  const rows = read();
  const row = rows[id] ?? { contract, key, label, hour, plays: 0, ms: 0 };
  row.plays += 1;
  row.ms += Math.round(ms);
  row.label = label;
  rows[id] = row;
  write(rows);
}

let sending = false;

export async function flushPlays(supabase: SupabaseClient) {
  if (sending) return;
  const rows = read();
  const ids = Object.keys(rows).slice(0, 400);
  if (!ids.length) return;
  sending = true;
  try {
    const { error } = await supabase.rpc("report_plays", { p_rows: ids.map((id) => rows[id]) });
    if (error) return;
    // ما سُجّل أثناء الإرسال يبقى للمرة القادمة
    const latest = read();
    ids.forEach((id) => {
      const sent = rows[id];
      const current = latest[id];
      if (!current) return;
      current.plays -= sent.plays;
      current.ms -= sent.ms;
      if (current.plays <= 0 && current.ms <= 0) delete latest[id];
    });
    write(latest);
  } finally {
    sending = false;
  }
}
