"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export interface ScheduleRow {
  id: string;
  announcement_id: string;
  recurrence: "once" | "daily" | "weekly";
  run_on: string | null;
  local_time: string;
  weekdays: number[] | null;
  all_screens: boolean;
  is_enabled: boolean;
  title: string;
  body: string;
  screen_ids: string[];
}

export interface BroadcastRow {
  id: string;
  body: string;
  play_at: string | null;
  created_at: string;
}

export interface DeliveryRow {
  broadcast_id: string;
  screen_id: string;
  status: "pending" | "received" | "ready" | "played" | "failed" | "missed";
  drift_ms: number | null;
  error: string | null;
}

interface Screen {
  id: string;
  name: string;
}

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const STATUS_LABEL: Record<DeliveryRow["status"], string> = {
  pending: "لم يصل بعد",
  received: "وصل",
  ready: "وصل",
  played: "عُرض",
  failed: "فشل",
  missed: "فات موعده",
};

const ERROR_LABEL: Record<string, string> = {
  audio_blocked: "بدون صوت، المس الشاشة مرة لتفعيله",
  no_voice: "عُرض نصًا، الجهاز بلا صوت عربي",
  failed: "عُرض نصًا، تعذر النطق",
  late: "وصل متأخرًا",
};

function describeSchedule(row: ScheduleRow) {
  const time = row.local_time.slice(0, 5);
  if (row.recurrence === "daily") return `يوميًا الساعة ${time}`;
  if (row.recurrence === "weekly") {
    return `${(row.weekdays ?? []).map((day) => WEEKDAYS[day]).join("، ")} الساعة ${time}`;
  }
  return `مرة واحدة ${row.run_on ?? ""} الساعة ${time}`;
}

function driftText(ms: number | null) {
  if (ms === null) return null;
  const seconds = Math.abs(ms) / 1000;
  return Math.abs(ms) < 50 ? "في الموعد تمامًا" : `${ms > 0 ? "تأخر" : "سبق"} ${seconds.toFixed(2)} ثانية`;
}

function ScreenPicker({ screens, name }: { screens: Screen[]; name: string }) {
  const [all, setAll] = useState(true);
  return (
    <fieldset className="check-list">
      <legend>الشاشات</legend>
      <label>
        <input type="checkbox" name={`${name}-all`} checked={all} onChange={(event) => setAll(event.target.checked)} />
        كل الشاشات
      </label>
      {!all &&
        screens.map((screen) => (
          <label key={screen.id}>
            <input type="checkbox" name={name} value={screen.id} />
            {screen.name}
          </label>
        ))}
    </fieldset>
  );
}

function DeliveryReport({ rows, screens }: { rows: DeliveryRow[]; screens: Screen[] }) {
  return (
    <ul className="delivery-list">
      {rows.map((row) => {
        const issue = row.error ? ERROR_LABEL[row.error] ?? row.error : null;
        return (
          <li key={row.screen_id}>
            <strong>{screens.find((screen) => screen.id === row.screen_id)?.name ?? "شاشة"}</strong>
            <span className="status-pill" data-state={row.status === "played" ? "active" : row.status === "missed" ? "" : "upcoming"}>
              {STATUS_LABEL[row.status]}
            </span>
            {row.status === "played" && <span>{driftText(row.drift_ms)}</span>}
            {issue && <span>{issue}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function AnnouncementsBoard({
  orgId,
  screens,
  schedules,
  broadcasts,
  deliveries,
}: {
  orgId: string;
  screens: Screen[];
  schedules: ScheduleRow[];
  broadcasts: BroadcastRow[];
  deliveries: DeliveryRow[];
}) {
  const router = useRouter();
  const [recurrence, setRecurrence] = useState<ScheduleRow["recurrence"]>("daily");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [liveRows, setLiveRows] = useState<DeliveryRow[]>([]);

  const watch = useCallback((broadcastId: string) => {
    setLiveId(broadcastId);
    setLiveRows([]);
  }, []);

  // متابعة النداء الأخير حتى تكتمل تقارير الشاشات أو تمر دقيقة
  useEffect(() => {
    if (!liveId) return;
    const supabase = createClient();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const { data } = await supabase
        .from("broadcast_deliveries")
        .select("broadcast_id, screen_id, status, drift_ms, error")
        .eq("broadcast_id", liveId);
      const rows = (data ?? []) as DeliveryRow[];
      setLiveRows(rows);
      const done = rows.length > 0 && rows.every((row) => ["played", "failed", "missed"].includes(row.status));
      if (done || Date.now() - started > 60_000) {
        router.refresh();
        return;
      }
      timer = setTimeout(poll, 1_500);
    };
    void poll();
    return () => clearTimeout(timer);
  }, [liveId, router]);

  async function sendBroadcast(body: string, screenIds: string[] | null) {
    setBusy("broadcast");
    setError(null);
    setMessage(null);
    const { data, error: sendError } = await createClient().rpc("send_urgent_broadcast", {
      p_org: orgId,
      p_body: body,
      p_screen_ids: screenIds,
    });
    setBusy(null);
    if (sendError || !data) {
      setError(
        sendError?.message.includes("no_target_screens")
          ? "لا توجد شاشة عاملة لإرسال النداء إليها."
          : "تعذر إرسال النداء. تحقق من الاتصال وحاول مرة أخرى.",
      );
      return false;
    }
    const result = data as { id: string; screens: number };
    setMessage(`أُرسل النداء إلى ${result.screens} ${result.screens === 1 ? "شاشة" : "شاشات"}، ويبدأ بعد 4 ثوانٍ.`);
    watch(result.id);
    return true;
  }

  async function submitBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const all = form.get("urgent-screens-all") === "on";
    const picked = form.getAll("urgent-screens").map(String);
    if (!all && picked.length === 0) {
      setError("اختر شاشة واحدة على الأقل.");
      return;
    }
    if (await sendBroadcast(String(form.get("body")).trim(), all ? null : picked)) formElement.reset();
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const all = form.get("schedule-screens-all") === "on";
    const picked = form.getAll("schedule-screens").map(String);
    const weekdays = form.getAll("weekdays").map(Number);
    if (!all && picked.length === 0) return setError("اختر شاشة واحدة على الأقل.");
    if (recurrence === "weekly" && weekdays.length === 0) return setError("اختر يومًا واحدًا على الأقل.");

    setBusy("schedule");
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const title = String(form.get("title")).trim() || "إعلان";
    const { data: announcement, error: announcementError } = await supabase
      .from("announcements")
      .insert({ org_id: orgId, title, body: String(form.get("body")).trim() })
      .select("id")
      .single();
    let failed = Boolean(announcementError || !announcement);
    if (announcement) {
      const { data: schedule, error: scheduleError } = await supabase
        .from("schedules")
        .insert({
          org_id: orgId,
          announcement_id: announcement.id,
          name: title,
          recurrence,
          local_time: String(form.get("time")),
          run_on: recurrence === "once" ? String(form.get("date")) : null,
          weekdays: recurrence === "weekly" ? weekdays : null,
          all_screens: all,
        })
        .select("id")
        .single();
      if (!all && schedule) {
        const { error: targetError } = await supabase
          .from("schedule_screens")
          .insert(picked.map((screenId) => ({ schedule_id: schedule.id, screen_id: screenId, org_id: orgId })));
        failed = Boolean(targetError);
      }
      failed ||= Boolean(scheduleError || !schedule);
      if (failed) await supabase.from("announcements").delete().eq("id", announcement.id);
    }
    if (failed) {
      setBusy(null);
      setError("تعذر حفظ الإعلان. حاول مرة أخرى.");
      return;
    }
    await supabase.rpc("request_org_resync", { p_org: orgId });
    formElement.reset();
    setRecurrence("daily");
    setBusy(null);
    setMessage("حُفظ الإعلان وأُرسل إلى الشاشات. سيعمل في موعده حتى لو انقطع الإنترنت.");
    router.refresh();
  }

  async function changeSchedule(row: ScheduleRow, action: "toggle" | "delete") {
    setBusy(row.id);
    setError(null);
    const supabase = createClient();
    const { error: changeError } =
      action === "delete"
        ? await supabase.from("announcements").delete().eq("id", row.announcement_id)
        : await supabase.from("schedules").update({ is_enabled: !row.is_enabled }).eq("id", row.id);
    if (!changeError) await supabase.rpc("request_org_resync", { p_org: orgId });
    setBusy(null);
    if (changeError) setError("تعذر حفظ التغيير.");
    router.refresh();
  }

  const screenNames = (row: ScheduleRow) =>
    row.all_screens
      ? "كل الشاشات"
      : row.screen_ids.map((id) => screens.find((screen) => screen.id === id)?.name ?? "شاشة").join("، ");

  return (
    <main className="page">
      <h1>الإعلانات</h1>

      <section className="urgent">
        <h2>نداء عاجل</h2>
        <p className="page-note">يظهر ويُنطق على الشاشات المختارة في اللحظة نفسها، بعد 4 ثوانٍ من الإرسال.</p>
        <form className="form" onSubmit={submitBroadcast}>
          <label>
            نص النداء
            <textarea name="body" required maxLength={500} rows={3} placeholder="يرجى من صاحب السيارة رقم 5-123456 التوجه إلى المدخل" />
          </label>
          <ScreenPicker screens={screens} name="urgent-screens" />
          <button className="button-urgent" disabled={busy !== null || screens.length === 0}>
            {busy === "broadcast" ? "جارٍ الإرسال" : "أرسل النداء الآن"}
          </button>
        </form>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="page-note" role="status">{message}</p>}

      {liveId && (
        <section className="assign-section">
          <h2>تقرير النداء الأخير</h2>
          {liveRows.length ? <DeliveryReport rows={liveRows} screens={screens} /> : <p className="page-note">جارٍ انتظار الشاشات</p>}
        </section>
      )}

      <section className="assign-section">
        <h2>الإعلانات المجدولة</h2>
        {schedules.length === 0 ? (
          <p className="page-note">لا توجد إعلانات مجدولة بعد.</p>
        ) : (
          <ul className="schedule-list">
            {schedules.map((row) => (
              <li key={row.id} data-enabled={row.is_enabled}>
                <strong>{row.title}</strong>
                <p>{row.body}</p>
                <span>{describeSchedule(row)}</span>
                <span>{screenNames(row)}</span>
                {!row.is_enabled && <span className="status-pill">موقوف</span>}
                <div className="schedule-actions">
                  <button type="button" disabled={busy !== null} onClick={() => void sendBroadcast(row.body, row.all_screens ? null : row.screen_ids)}>
                    جرّبه الآن
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void changeSchedule(row, "toggle")}>
                    {row.is_enabled ? "إيقاف" : "تشغيل"}
                  </button>
                  <button type="button" className="danger" disabled={busy !== null} onClick={() => void changeSchedule(row, "delete")}>
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="form" onSubmit={submitSchedule}>
          <h3>إعلان مجدول جديد</h3>
          <label>
            اسم الإعلان
            <input name="title" maxLength={80} placeholder="افتتاح القاعة" />
          </label>
          <label>
            النص الذي يُعرض ويُنطق
            <textarea name="body" required maxLength={1000} rows={3} />
          </label>
          <label>
            التكرار
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as ScheduleRow["recurrence"])}>
              <option value="daily">كل يوم</option>
              <option value="weekly">أيام محددة من الأسبوع</option>
              <option value="once">مرة واحدة</option>
            </select>
          </label>
          {recurrence === "weekly" && (
            <fieldset className="check-list check-days">
              <legend>الأيام</legend>
              {WEEKDAYS.map((day, index) => (
                <label key={day}>
                  <input type="checkbox" name="weekdays" value={index} />
                  {day}
                </label>
              ))}
            </fieldset>
          )}
          {recurrence === "once" && (
            <label>
              التاريخ
              <input name="date" type="date" dir="ltr" required />
            </label>
          )}
          <label>
            الساعة (بتوقيت ليبيا)
            <input name="time" type="time" dir="ltr" required />
          </label>
          <ScreenPicker screens={screens} name="schedule-screens" />
          <button className="button-primary" disabled={busy !== null}>
            {busy === "schedule" ? "جارٍ الحفظ" : "حفظ الإعلان"}
          </button>
        </form>
      </section>

      {broadcasts.length > 0 && (
        <section className="assign-section">
          <h2>آخر النداءات</h2>
          <ul className="schedule-list">
            {broadcasts.map((broadcast) => (
              <li key={broadcast.id}>
                <p>{broadcast.body}</p>
                <DeliveryReport rows={deliveries.filter((row) => row.broadcast_id === broadcast.id)} screens={screens} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
