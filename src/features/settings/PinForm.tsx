"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// يحمي إعدادات تطبيق الشاشة من العبث: خمس لمسات في الزاوية تطلب هذا الرمز
export function PinForm({ orgId, hasPin }: { orgId: string; hasPin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(pin: string | null) {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ screen_pin_hash: pin ? await sha256(pin) : null })
      .eq("id", orgId);
    if (!error) await supabase.rpc("request_org_resync", { p_org: orgId });
    setBusy(false);
    setMessage(error ? "لم يُحفظ الرمز." : pin ? "حُفظ الرمز وأُرسل إلى الشاشات" : "أُزيل الرمز");
    if (!error) router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const pin = String(new FormData(form).get("pin")).trim();
    form.reset();
    void save(pin);
  }

  return (
    <section className="assign-section">
      <h2>رمز حماية الشاشات</h2>
      <p className="page-note">
        في تطبيق أندرويد، تفتح خمس لمسات سريعة في الزاوية العلوية إعدادات الشاشة. مع هذا الرمز لا يفتحها إلا من يعرفه.
        {hasPin ? " الرمز مفعّل الآن." : " لا يوجد رمز الآن."}
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          {hasPin ? "رمز جديد" : "الرمز"} (من 4 إلى 8 أرقام)
          <input
            name="pin"
            required
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            maxLength={8}
            dir="ltr"
            autoComplete="off"
          />
        </label>
        <button className="button-quiet-blue" disabled={busy}>حفظ الرمز</button>
      </form>
      {hasPin && (
        <button type="button" className="button-quiet" disabled={busy} onClick={() => void save(null)}>
          إزالة الرمز
        </button>
      )}
      {message && <p className="page-note" role="status">{message}</p>}
    </section>
  );
}
