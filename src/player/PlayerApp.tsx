"use client";

import { QrCode } from "@/components/ui/QrCode";
import { pairingUrl, screenUrl } from "@/lib/screen-links";
import { useEffect, useState } from "react";
import { AnnouncementLayer } from "@/player/announce/AnnouncementLayer";
import { unlockAudio } from "@/player/audio/audio";
import { resolveContent } from "@/player/engine/schedule";
import { registerPlayerWorker } from "@/player/offline/store";
import { useScreenConnection } from "@/player/sync/useScreenConnection";
import { KioskShell } from "@/player/kiosk/KioskShell";
import { ContentStage } from "@/player/zones/ContentStage";

export function PlayerApp() {
  const screen = useScreenConnection();
  const [clock, setClock] = useState(() => Date.now());
  const showsManifest =
    Boolean(screen.manifest) && (screen.phase === "starting" || screen.phase === "ready");
  const resolved =
    showsManifest && screen.manifest
      ? resolveContent(screen.manifest, clock + screen.clockOffset)
      : null;
  const hasContent = Boolean(resolved);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void registerPlayerWorker();
  }, []);

  const handleTouch = async () => {
    screen.setAudio(await unlockAudio());
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  };

  return (
    <main className="player" data-phase={screen.phase} onPointerDown={handleTouch}>
      <audio id="player-chime" src="/sounds/chime.wav" preload="auto" />

      {resolved && resolved.kind !== "available" && screen.manifest && (() => {
        const stage =
          resolved.kind === "program" ? (
            <ContentStage
              key={resolved.key}
              content={{
                version: resolved.version,
                organization: screen.manifest.organization,
                program: resolved.program,
              }}
            />
          ) : (
            <section className="available">
              <h1>{resolved.title}</h1>
            </section>
          );
        return resolved.kiosk ? (
          <KioskShell
            key={resolved.key}
            kiosk={resolved.kiosk.data}
            title={resolved.kiosk.contractTitle}
            organization={screen.manifest.organization}
            now={clock + screen.clockOffset}
          >
            {stage}
          </KioskShell>
        ) : (
          stage
        );
      })()}

      {resolved?.kind === "available" && screen.manifest && (
        <section className="available">
          <small>{screen.manifest.organization}</small>
          <h1>{screen.manifest.fallback_headline ?? "هذه الشاشة متاحة للإيجار"}</h1>
          {screen.manifest.contact_phone && (
            <p>
              للتواصل <bdi dir="ltr">{screen.manifest.contact_phone}</bdi>
            </p>
          )}
        </section>
      )}

      {screen.phase === "starting" && !hasContent && <p className="player-note">جارٍ تشغيل الشاشة</p>}

      {screen.phase === "setup-error" && (
        <section className="player-message">
          <h1>إعداد الخادم غير مكتمل</h1>
          <p>تأكد من مفاتيح Supabase ومن تفعيل Anonymous Sign-Ins.</p>
        </section>
      )}

      {screen.phase === "pairing" && (
        <section className="pairing">
          <h1>اربط هذه الشاشة</h1>
          <div className="flap-row" dir="ltr" role="img" aria-label={`رمز الربط ${screen.code ?? ""}`}>
            {(screen.code ?? "     ").split("").map((digit, index) => (
              <span
                className="flap"
                key={`${screen.code}-${index}`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                {digit}
              </span>
            ))}
          </div>
          {screen.code && (
            <QrCode
              className="player-qr"
              value={pairingUrl(window.location.origin, screen.code)}
              label="رمز QR لربط هذه الشاشة"
            />
          )}
          <p>امسح رمز QR بهاتفك، أو أدخل الأرقام في لوحة الشاشات.</p>
          <small>يتجدد الرمز تلقائيًا قبل انتهاء صلاحيته.</small>
        </section>
      )}

      {screen.phase === "ready" && !hasContent && (
        <section className="standby">
          <h1>{screen.screenName ?? "شاشة بلا اسم"}</h1>
          {screen.location && <p>{screen.location}</p>}
          <small>جاهزة، بانتظار المحتوى</small>
          {screen.screenId && (
            <QrCode
              className="player-qr player-qr-small"
              value={screenUrl(window.location.origin, screen.screenId)}
              label="رمز QR لفتح هذه الشاشة في لوحة التحكم"
            />
          )}
        </section>
      )}

      {screen.phase === "disabled" && (
        <section className="player-message">
          <h1>هذه الشاشة موقوفة</h1>
          <p>يمكن تشغيلها من لوحة الشاشات.</p>
        </section>
      )}

      {!hasContent && !screen.isConnected && screen.phase !== "setup-error" && (
        <p className="player-strip">لا يوجد اتصال بالإنترنت. ستعاد المحاولة تلقائيًا.</p>
      )}

      {!hasContent && screen.isConnected && screen.phase === "ready" && screen.audio === "blocked" && (
        <p className="player-strip">المس الشاشة مرة واحدة لتفعيل الصوت</p>
      )}

      {screen.phase === "ready" || (screen.phase === "starting" && screen.manifest) ? (
        <AnnouncementLayer schedules={screen.manifest?.schedules} clockOffset={screen.clockOffset} />
      ) : null}

      {screen.isIdentifying && (
        <section className="identify" aria-live="assertive">
          <small>هذه هي الشاشة</small>
          <h1>{screen.screenName ?? "شاشة بلا اسم"}</h1>
          {screen.screenId && (
            <QrCode
              className="player-qr"
              value={screenUrl(window.location.origin, screen.screenId)}
              label="رمز QR لفتح هذه الشاشة في لوحة التحكم"
            />
          )}
        </section>
      )}
    </main>
  );
}
