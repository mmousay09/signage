"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("link_error")) {
      setError("انتهت صلاحية رابط الدخول. اطلب رابطًا جديدًا وافتحه في المتصفح نفسه.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    const { error: sendError } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (sendError) {
      setError("تعذر إرسال رابط الدخول. انتظر قليلًا ثم حاول مرة أخرى.");
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <main className="auth">
        <h1>افتح بريدك</h1>
        <p className="page-note">
          أرسلنا رابط الدخول إلى <bdi dir="ltr">{sentTo}</bdi>. افتحه في هذا المتصفح نفسه.
        </p>
      </main>
    );
  }

  return (
    <main className="auth">
      <h1>لوحة الشاشات</h1>
      <form className="form" onSubmit={submit}>
        <label>
          البريد الإلكتروني
          <input name="email" type="email" dir="ltr" autoComplete="email" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>
          {busy ? "جارٍ الإرسال" : "أرسل رابط الدخول"}
        </button>
      </form>
    </main>
  );
}
