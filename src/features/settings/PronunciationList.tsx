"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export interface Pronunciation {
  id: string;
  term: string;
  spoken: string;
}

export function PronunciationList({ orgId, rows }: { orgId: string; rows: Pronunciation[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function done(error: { code?: string } | null, text: string) {
    if (!error) await createClient().rpc("request_org_resync", { p_org: orgId });
    setBusy(false);
    setMessage(
      error ? (error.code === "23505" ? "هذه الكلمة موجودة في القاموس." : "لم يُحفظ التغيير. حاول مرة أخرى.") : text,
    );
    if (!error) router.refresh();
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("pronunciations")
      .insert({ org_id: orgId, term: String(form.get("term")).trim(), spoken: String(form.get("spoken")).trim() });
    if (!error) formElement.reset();
    await done(error, "أُضيفت الكلمة وأُرسلت إلى الشاشات");
  }

  async function remove(id: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().from("pronunciations").delete().eq("id", id);
    await done(error, "حُذفت الكلمة");
  }

  return (
    <section className="assign-section">
      <h2>قاموس النطق</h2>
      <p className="page-note">
        اكتب الكلمة كما تظهر، ثم كيف تُنطق. تستبدلها الشاشة قبل الكلام في الإعلانات والنداءات والمساعد، مثل «NEPAD» تُنطق «نيباد» أو «م.» تُنطق «المهندس».
      </p>
      {rows.length > 0 && (
        <ul className="schedule-list">
          {rows.map((row) => (
            <li key={row.id}>
              <strong>{row.term}</strong>
              <span>تُنطق: {row.spoken}</span>
              <div className="schedule-actions">
                <button type="button" className="danger" disabled={busy} onClick={() => void remove(row.id)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="form" onSubmit={add}>
        <label>
          الكلمة كما تُكتب
          <input name="term" required maxLength={80} />
        </label>
        <label>
          كيف تُنطق
          <input name="spoken" required maxLength={160} />
        </label>
        <button className="button-quiet-blue" disabled={busy}>إضافة إلى القاموس</button>
      </form>
      {message && <p className="page-note" role="status">{message}</p>}
    </section>
  );
}
