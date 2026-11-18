"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export function PairForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [playerUrl, setPlayerUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPlayerUrl(`${window.location.origin}/play`), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { error: rpcError } = await createClient().rpc("claim_screen", {
      p_org: orgId,
      p_code: code,
      p_name: String(form.get("name")).trim(),
      p_location: String(form.get("location")).trim() || null,
    });
    if (rpcError) {
      setError(
        rpcError.message.includes("invalid_or_expired_code")
          ? "الرمز غير صحيح أو انتهت صلاحيته. أدخل الرمز الظاهر الآن على الشاشة."
          : "تعذر ربط الشاشة. تأكد من الاتصال وحاول مرة أخرى.",
      );
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="page">
      <h1>ربط شاشة</h1>
      <p className="page-note">
        افتح هذا الرابط على الشاشة: <bdi dir="ltr">{playerUrl}</bdi>
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          الرمز الظاهر على الشاشة
          <input
            className="code-input"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{5}"
            maxLength={5}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label>
          اسم الشاشة
          <input name="name" required maxLength={80} placeholder="مدخل القاعة" />
        </label>
        <label>
          الموقع (اختياري)
          <input name="location" maxLength={120} placeholder="معرض طرابلس" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy || code.length !== 5}>
          {busy ? "جارٍ الربط" : "ربط الشاشة"}
        </button>
      </form>
    </main>
  );
}
