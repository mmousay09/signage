"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { QrScanner } from "@/features/screens/QrScanner";
import { createClient } from "@/lib/supabase/browser";
import { parseBadgeCode } from "@/lib/badge";

type Status = "checked_in" | "already" | "not_found" | "other_event" | "error";

interface Entry {
  code: string;
  status: Status;
  name?: string;
  at: number;
}

const MESSAGE: Record<Status, string> = {
  checked_in: "سُجّل حضوره",
  already: "حضوره مسجّل من قبل",
  not_found: "بطاقة غير موجودة",
  other_event: "بطاقة لفعالية أخرى",
  error: "تعذر الاتصال، حاول مرة أخرى",
};

/** الاستقبال يمسح بطاقات الضيوف بكاميرا الهاتف */
export function CheckInDesk({
  contractId,
  title,
  total,
  attended,
}: {
  contractId: string;
  title: string;
  total: number;
  attended: number;
}) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(attended);
  const [log, setLog] = useState<Entry[]>([]);
  const latest = log[0];

  async function check(raw: string) {
    const code = parseBadgeCode(raw);
    setScanning(false);
    if (!code) {
      setLog((items) => [{ code: raw.slice(0, 12), status: "not_found" as Status, at: Date.now() }, ...items].slice(0, 30));
      return;
    }
    setBusy(true);
    const { data, error } = await createClient().rpc("check_in_guest", { p_contract: contractId, p_code: code });
    setBusy(false);
    const result = data as { status: Status; full_name?: string } | null;
    const status: Status = error || !result ? "error" : result.status;
    if (status === "checked_in") setCount((value) => value + 1);
    if (navigator.vibrate) navigator.vibrate(status === "checked_in" ? 80 : [60, 60, 60]);
    setLog((items) => [{ code, status, name: result?.full_name, at: Date.now() }, ...items].slice(0, 30));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("code") as HTMLInputElement;
    void check(field.value);
    field.value = "";
  }

  return (
    <main className="page checkin-desk">
      <Link href={`/contracts/${contractId}`}>رجوع إلى العقد</Link>
      <h1>تسجيل الحضور</h1>
      <p className="page-note">
        {`${title}: حضر ${count} من ${total}.`}
      </p>

      {latest && (
        <div className="checkin-latest" data-ok={latest.status === "checked_in" || latest.status === "already"} role="status">
          <strong>{latest.name ?? latest.code}</strong>
          <span>{MESSAGE[latest.status]}</span>
        </div>
      )}

      <button type="button" className="button-scan" disabled={busy} onClick={() => setScanning(true)}>
        {busy ? "جارٍ التحقق" : latest ? "امسح البطاقة التالية" : "امسح بطاقة ضيف"}
      </button>

      <form className="form" onSubmit={submit}>
        <label>
          أو اكتب رمز البطاقة
          <input name="code" dir="ltr" maxLength={12} autoComplete="off" autoCapitalize="characters" placeholder="ABCD 2345" />
        </label>
        <button className="button-quiet-blue" disabled={busy}>تسجيل الحضور</button>
      </form>

      {log.length > 1 && (
        <>
          <h2>آخر عمليات المسح</h2>
          <ul className="schedule-list">
            {log.slice(1).map((entry) => (
              <li key={entry.at}>
                <strong>{entry.name ?? entry.code}</strong>
                <span>{MESSAGE[entry.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {scanning && (
        <QrScanner
          labels={{
            prompt: "وجّه الكاميرا إلى رمز بطاقة الضيف",
            denied: "اسمح للمتصفح باستخدام الكاميرا، ثم حاول مرة أخرى.",
            failed: "تعذر تشغيل الكاميرا. اكتب رمز البطاقة.",
            close: "إغلاق",
          }}
          onResult={(value) => void check(value)}
          onClose={() => setScanning(false)}
        />
      )}
    </main>
  );
}
