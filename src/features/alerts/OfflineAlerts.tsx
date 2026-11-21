"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

interface Alert {
  screen_id: string;
  screen: string;
  contract: string;
  last_seen_at: string | null;
}

const POLL_MS = 60_000;

function since(value: string | null) {
  if (!value) return "لم تتصل بعد";
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `منقطعة منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  return `منقطعة منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;
}

// يعمل ما دامت لوحة التحكم مفتوحة على الهاتف أو الكمبيوتر
export function OfflineAlerts({ orgId }: { orgId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const { data } = await supabase.rpc("screen_alerts", { p_org: orgId });
      const next = (data ?? []) as Alert[];
      const fresh = known.current ? next.filter((item) => !known.current!.has(item.screen_id)) : [];
      known.current = new Set(next.map((item) => item.screen_id));
      setAlerts(next);
      if (fresh.length && "Notification" in window && Notification.permission === "granted") {
        new Notification("شاشة مؤجرة انقطعت", {
          body: fresh.map((item) => `${item.screen} (${item.contract})`).join("، "),
          tag: "signage-offline",
        });
      }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => clearTimeout(timer);
  }, [orgId]);

  async function enable() {
    setPermission(await Notification.requestPermission());
  }

  if (!alerts.length) {
    return permission === "default" ? (
      <button type="button" className="alert-enable" onClick={() => void enable()}>
        نبّهني على هذا الجهاز إذا انقطعت شاشة مؤجرة
      </button>
    ) : null;
  }

  return (
    <section className="offline-alert" role="alert">
      <strong>{alerts.length === 1 ? "شاشة مؤجرة منقطعة الآن" : `${alerts.length} شاشات مؤجرة منقطعة الآن`}</strong>
      <ul>
        {alerts.map((item) => (
          <li key={item.screen_id}>
            {item.screen}، عقد «{item.contract}»: {since(item.last_seen_at)}
          </li>
        ))}
      </ul>
      {permission === "default" && (
        <button type="button" onClick={() => void enable()}>
          نبّهني بإشعار على هذا الجهاز
        </button>
      )}
    </section>
  );
}
