"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    const { error: rpcError } = await createClient().rpc("create_organization", { p_name: name });
    if (rpcError) {
      setError(
        rpcError.message.includes("organization_already_exists")
          ? "الشركة مسجلة بحساب آخر. اطلب من مالك الحساب إضافتك."
          : "تعذر حفظ الشركة. تأكد من الاتصال وحاول مرة أخرى.",
      );
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth">
      <h1>ما اسم شركتك؟</h1>
      <form className="form" onSubmit={submit}>
        <label>
          اسم الشركة
          <input name="name" required maxLength={120} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>
          {busy ? "جارٍ الحفظ" : "حفظ الشركة"}
        </button>
      </form>
    </main>
  );
}
