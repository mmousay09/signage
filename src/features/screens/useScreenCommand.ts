"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { ScreenCommand, ScreenRow } from "./types";

export function useScreenCommand(screen: ScreenRow, online: boolean) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(command: ScreenCommand) {
    setBusy(true);
    const { error } = await createClient()
      .from("screen_commands")
      .insert({ org_id: screen.org_id, screen_id: screen.id, command });
    setBusy(false);
    if (error) setMessage("لم يُرسل الأمر. تأكد من الاتصال.");
    else setMessage(online ? "أُرسل الأمر" : "سيُنفذ الأمر عند عودة الشاشة خلال ساعة");
    setTimeout(() => setMessage(null), 5_000);
  }

  return { send, busy, message };
}
