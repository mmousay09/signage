"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (signInError) {
      setError("البريد أو كلمة المرور غير صحيحة.");
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth">
      <h1>لوحة الشاشات</h1>
      <form className="form" onSubmit={submit}>
        <label>
          البريد الإلكتروني
          <input name="email" type="email" dir="ltr" autoComplete="email" required />
        </label>
        <label>
          كلمة المرور
          <input name="password" type="password" dir="ltr" autoComplete="current-password" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>
          {busy ? "جارٍ الدخول" : "دخول"}
        </button>
      </form>
    </main>
  );
}
