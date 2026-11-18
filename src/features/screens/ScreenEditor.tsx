"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isOnline, lastSeenText, type ScreenRow } from "./types";
import { useScreenCommand } from "./useScreenCommand";

const audioText = { ready: "يعمل", blocked: "يحتاج لمسة على الشاشة", unknown: "لم يُختبر بعد" };

export function ScreenEditor({ screen }: { screen: ScreenRow }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = isOnline(screen, now);
  const command = useScreenCommand(screen, online);
  const disabled = screen.status === "disabled";
  const state = screen.player_state;

  useEffect(() => setNow(Date.now()), []);

  async function update(values: Partial<Pick<ScreenRow, "name" | "location" | "status">>, done: string) {
    setBusy(true);
    const { error } = await createClient().from("screens").update(values).eq("id", screen.id);
    setBusy(false);
    setMessage(error ? "لم يُحفظ التغيير. تأكد من الاتصال." : done);
    if (!error) router.refresh();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void update(
      {
        name: String(form.get("name")).trim(),
        location: String(form.get("location")).trim() || null,
      },
      "حُفظت البيانات",
    );
  }

  return (
    <main className="page">
      <h1>{screen.name ?? "شاشة بلا اسم"}</h1>
      <dl className="facts">
        <div><dt>الحالة</dt><dd>{disabled ? "موقوفة" : online ? "متصلة" : lastSeenText(screen, now) || "غير متصلة"}</dd></div>
        <div><dt>الصوت</dt><dd>{audioText[state?.audio ?? "unknown"]}</dd></div>
        <div><dt>ملء الشاشة</dt><dd>{state?.fullscreen ? "مفعّل" : "غير مفعّل"}</dd></div>
        <div><dt>إبقاء الشاشة مضاءة</dt><dd>{state?.wake_lock ? "مفعّل" : "غير مفعّل"}</dd></div>
        <div><dt>الدقة</dt><dd dir="ltr">{state?.display ?? "غير معروفة"}</dd></div>
      </dl>

      {!disabled && (
        <div className="action-pair">
          <button disabled={command.busy} onClick={() => command.send("reload")}>إعادة تحميل</button>
          <button disabled={command.busy} onClick={() => command.send("identify")}>تعريف الشاشة</button>
        </div>
      )}
      {command.message && <p className="page-note" role="status">{command.message}</p>}

      <form className="form" onSubmit={save}>
        <label>
          اسم الشاشة
          <input name="name" required maxLength={80} defaultValue={screen.name ?? ""} />
        </label>
        <label>
          الموقع
          <input name="location" maxLength={120} defaultValue={screen.location ?? ""} />
        </label>
        <button className="button-primary" disabled={busy}>حفظ البيانات</button>
      </form>

      {message && <p className="page-note" role="status">{message}</p>}

      <button
        className="button-quiet"
        disabled={busy}
        onClick={() =>
          update(
            { status: disabled ? "active" : "disabled" },
            disabled ? "شُغّلت الشاشة" : "أُوقفت الشاشة",
          )
        }
      >
        {disabled ? "تشغيل الشاشة" : "إيقاف الشاشة"}
      </button>
    </main>
  );
}
