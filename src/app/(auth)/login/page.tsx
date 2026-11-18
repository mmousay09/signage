"use client";

import { createClient as createAuthClient } from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import { safeNextPath } from "@/lib/screen-links";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNextPath(params.get("next"));
    if (next) window.localStorage.setItem("signage-next", next);
    if (params.has("link_error")) {
      setError("انتهت صلاحية رابط الدخول. اطلب رابطًا جديدًا.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    const auth = createAuthClient(supabaseUrl, supabaseKey, {
      auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
    }).auth;
    const { error: sendError } = await auth.signInWithOtp({
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
          أرسلنا رابط الدخول إلى <bdi dir="ltr">{sentTo}</bdi>. إن لم تجده، راجع مجلد الرسائل غير المرغوبة.
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
