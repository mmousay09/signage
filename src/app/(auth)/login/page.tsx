"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: sendError } = await createClient().auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (sendError) {
      setError("تعذر إرسال الرمز. انتظر قليلًا ثم حاول مرة أخرى.");
      return;
    }
    setCodeSent(true);
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const token = String(new FormData(event.currentTarget).get("code")).replace(/\D/g, "");
    const { error: verifyError } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    if (verifyError) {
      setError("الرمز غير صحيح أو انتهت صلاحيته.");
      setBusy(false);
      return;
    }
    window.location.assign("/dashboard");
  }

  if (codeSent) {
    return (
      <main className="auth">
        <h1>أدخل رمز الدخول</h1>
        <p className="page-note">
          أرسلنا الرمز إلى <bdi dir="ltr">{email.trim()}</bdi>. إن لم تجده، راجع مجلد الرسائل غير المرغوبة.
        </p>
        <form className="form" onSubmit={verifyCode}>
          <label>
            الرمز
            <input
              className="code-input"
              name="code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength={8}
              required
              autoFocus
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button-primary" disabled={busy}>
            {busy ? "جارٍ الدخول" : "دخول"}
          </button>
        </form>
        <button className="button-quiet" onClick={() => setCodeSent(false)}>
          تغيير البريد
        </button>
      </main>
    );
  }

  return (
    <main className="auth">
      <h1>لوحة الشاشات</h1>
      <form className="form" onSubmit={sendCode}>
        <label>
          البريد الإلكتروني
          <input
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>
          {busy ? "جارٍ الإرسال" : "أرسل رمز الدخول"}
        </button>
      </form>
    </main>
  );
}
