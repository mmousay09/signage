"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SettingsForm({
  orgId,
  name,
  phone,
  headline,
}: {
  orgId: string;
  name: string;
  phone: string;
  headline: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: String(form.get("name")).trim(),
        contact_phone: String(form.get("phone")).trim() || null,
        fallback_headline: String(form.get("headline")).trim(),
      })
      .eq("id", orgId);
    if (!error) {
      const { data: screens } = await supabase.from("screens").select("id").eq("org_id", orgId).eq("status", "active");
      const rows = ((screens ?? []) as { id: string }[]).map((screen) => ({
        org_id: orgId,
        screen_id: screen.id,
        command: "resync",
      }));
      if (rows.length) await supabase.from("screen_commands").insert(rows);
      router.refresh();
    }
    setBusy(false);
    setMessage(error ? "لم تُحفظ الإعدادات." : "حُفظت الإعدادات وأُرسلت إلى الشاشات");
  }

  return (
    <main className="page">
      <h1>الإعدادات</h1>
      <form className="form" onSubmit={save}>
        <label>
          اسم الشركة
          <input name="name" required maxLength={120} defaultValue={name} />
        </label>
        <label>
          رقم التواصل على الشاشة
          <input name="phone" type="tel" dir="ltr" maxLength={30} defaultValue={phone} />
        </label>
        <label>
          عبارة الشاشة المتاحة
          <input name="headline" required maxLength={120} defaultValue={headline} />
        </label>
        {message && <p className="page-note" role="status">{message}</p>}
        <button className="button-primary" disabled={busy}>حفظ الإعدادات</button>
      </form>
    </main>
  );
}
