"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isOnline, lastSeenText, type ScreenRow } from "./types";
import { useScreenCommand } from "./useScreenCommand";

function ScreenLine({ screen, now }: { screen: ScreenRow; now: number | null }) {
  const online = isOnline(screen, now);
  const { send, busy, message } = useScreenCommand(screen, online);
  const disabled = screen.status === "disabled";
  const state = disabled ? "disabled" : online ? "online" : "offline";
  const stateText = disabled ? "موقوفة" : online ? "متصلة" : "غير متصلة";
  const detail = [screen.client_name ?? screen.contract_title]
    .filter(Boolean)
    .join("، ");

  return (
    <li className="screen-line" data-state={state}>
      <Link href={`/screens/${screen.id}`} className="screen-main">
        <strong>{screen.name ?? "شاشة بلا اسم"}</strong>
        {detail && <span>{detail}</span>}
        <span className="screen-state">
          {stateText}
          {!online && !disabled && lastSeenText(screen, now) ? `، ${lastSeenText(screen, now)}` : ""}
        </span>
        {online && screen.player_state?.now ? (
          <span className="screen-now">يعرض الآن: {screen.player_state.now.label}</span>
        ) : (
          !disabled && !screen.playlist_id && !screen.contract_title && <span>تعرض إعلان «متاحة للإيجار»</span>
        )}
        {online && screen.player_state?.audio === "blocked" && (
          <span className="screen-warning">الصوت يحتاج لمسة على الشاشة</span>
        )}
      </Link>
      {!disabled && (
        <div className="screen-actions">
          <button disabled={busy} onClick={() => send("reload")}>إعادة تحميل</button>
          <button disabled={busy} onClick={() => send("identify")}>تعريف الشاشة</button>
        </div>
      )}
      {message && <p className="screen-feedback" role="status">{message}</p>}
    </li>
  );
}

export function ScreenBoard({ orgId, initialScreens }: { orgId: string; initialScreens: ScreenRow[] }) {
  const [screens, setScreens] = useState(initialScreens);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      const { data } = await supabase
        .from("v_screen_status")
        .select("*")
        .eq("org_id", orgId)
        .order("name");
      if (data && !stopped) setScreens(data as ScreenRow[]);
      if (!stopped) setNow(Date.now());
    };
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 400);
    };

    const channel = supabase
      .channel(`dashboard:${orgId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "screens", filter: `org_id=eq.${orgId}` },
        scheduleRefresh,
      );
    void supabase.realtime.setAuth().then(() => {
      if (!stopped) channel.subscribe();
    });

    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    const poll = setInterval(refresh, 30_000);

    return () => {
      stopped = true;
      clearTimeout(debounce);
      clearInterval(clock);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  const active = screens.filter((screen) => screen.status === "active");
  const onlineCount = active.filter((screen) => isOnline(screen, now)).length;
  // الشاشات مجمعة حسب الموقع، والتي بلا موقع في الآخر
  const byLocation = new Map<string, ScreenRow[]>();
  screens.forEach((screen) => {
    const key = screen.location?.trim() || "بدون موقع";
    byLocation.set(key, [...(byLocation.get(key) ?? []), screen]);
  });
  const groups = [...byLocation].sort(([a], [b]) =>
    a === "بدون موقع" ? 1 : b === "بدون موقع" ? -1 : a.localeCompare(b, "ar"),
  );

  return (
    <main className="board">
      <h1>
        {screens.length === 0
          ? "لا توجد شاشات مربوطة"
          : `${onlineCount} من ${active.length} ${active.length === 1 ? "شاشة متصلة" : "شاشات متصلة"}`}
      </h1>

      {screens.length === 0 ? (
        <p className="board-empty">افتح رابط المشغّل على شاشة أندرويد، ثم اربطها برمزها.</p>
      ) : (
        groups.map(([location, members]) => (
          <section key={location} className="screen-group" aria-label={location}>
            {groups.length > 1 && (
              <h2>
                {location}
                <small>
                  {`${members.filter((screen) => isOnline(screen, now)).length} من ${members.length} متصلة`}
                </small>
              </h2>
            )}
            <ul className="screen-list">
              {members.map((screen) => (
                <ScreenLine key={screen.id} screen={screen} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="thumb-bar">
        <Link className="button-scan" href="/screens/new?scan=1">مسح QR</Link>
        <Link className="button-primary" href="/screens/new">ربط شاشة</Link>
      </div>
    </main>
  );
}
