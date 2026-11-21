"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { QrCode } from "@/components/ui/QrCode";
import { badgeUrl, flushGuestQueue, registerGuest, type GuestInput } from "@/player/kiosk/guests";
import {
  dayKey,
  dirFor,
  formatDay,
  formatTime,
  LANGUAGE_LABEL,
  localized,
  textFor,
  type KioskText,
} from "@/player/kiosk/i18n";
import { getAssetUrl, type AgendaEntry, type KioskLanguage, type ManifestKiosk } from "@/player/offline/store";

/** بعد هذه المدة دون لمس تعود الشاشة إلى العرض واللغة الأولى */
const IDLE_MS = 60_000;

type View = "home" | "program" | "register" | "badge";

interface Badge {
  code: string;
  name: string;
  organization: string;
  offline: boolean;
}

function useLogo(kiosk: ManifestKiosk) {
  const [url, setUrl] = useState<string | null>(null);
  const logoId = kiosk.logo?.id;
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!logoId) {
      setUrl(null);
      return;
    }
    void getAssetUrl(logoId).then((value) => {
      objectUrl = value;
      if (active) setUrl(value);
      else if (value) URL.revokeObjectURL(value);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logoId]);
  return url;
}

function ProgramView({
  agenda,
  now,
  language,
  text,
}: {
  agenda: AgendaEntry[];
  now: number;
  language: KioskLanguage;
  text: KioskText;
}) {
  const today = dayKey(now);
  const endOf = (entry: AgendaEntry) => Date.parse(entry.ends_at ?? entry.starts_at) || Date.parse(entry.starts_at);
  let day = today;
  let entries = agenda.filter((entry) => dayKey(Date.parse(entry.starts_at)) === today);
  if (!entries.length) {
    const upcoming = agenda.find((entry) => Date.parse(entry.starts_at) > now);
    if (upcoming) {
      day = dayKey(Date.parse(upcoming.starts_at));
      entries = agenda.filter((entry) => dayKey(Date.parse(entry.starts_at)) === day);
    }
  }
  const current = entries.find((entry) => Date.parse(entry.starts_at) <= now && now < endOf(entry));
  const next = entries.find((entry) => Date.parse(entry.starts_at) > now);

  if (!entries.length) {
    return (
      <section className="kiosk-program" dir={dirFor(language)}>
        <h1>{text.program}</h1>
        <p className="kiosk-empty">{text.ended}</p>
      </section>
    );
  }

  return (
    <section className="kiosk-program" dir={dirFor(language)}>
      <h1>{day === today ? text.todayProgram : text.upcomingProgram}</h1>
      <p className="kiosk-day">{formatDay(Date.parse(entries[0].starts_at), language)}</p>
      <ol>
        {entries.map((entry) => {
          const label = localized(entry, language);
          const state = entry === current ? "now" : entry === next ? "next" : endOf(entry) <= now ? "past" : "later";
          return (
            <li key={entry.id} data-state={state}>
              <time dir="ltr">
                {formatTime(Date.parse(entry.starts_at), language)}
                {entry.ends_at && <> – {formatTime(Date.parse(entry.ends_at), language)}</>}
              </time>
              <div>
                {(state === "now" || state === "next") && (
                  <span className="kiosk-badge">{state === "now" ? text.now : text.next}</span>
                )}
                <strong>{label.title}</strong>
                {(label.speaker || label.place) && (
                  <span>{[label.speaker, label.place].filter(Boolean).join(" · ")}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RegisterView({
  contractId,
  language,
  text,
  onDone,
}: {
  contractId: string;
  language: KioskLanguage;
  text: KioskText;
  onDone: (badge: Badge) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      (["full_name", "organization", "job_title", "phone", "email"] as const).map((field) => [
        field,
        String(form.get(field) ?? "").trim(),
      ]),
    ) as unknown as GuestInput;
    setSaving(true);
    const result = await registerGuest(contractId, language, input);
    setSaving(false);
    if (result.status === "final") {
      setClosed(true);
      return;
    }
    onDone({
      code: result.code,
      name: input.full_name,
      organization: input.organization,
      offline: result.status === "retry",
    });
  }

  const field = (name: keyof GuestInput, label: string, options: { required?: boolean; type?: string; ltr?: boolean } = {}) => (
    <label>
      <span>
        {label}
        {!options.required && <small> ({text.optional})</small>}
      </span>
      <input
        name={name}
        type={options.type ?? "text"}
        required={options.required}
        minLength={options.required ? 2 : undefined}
        maxLength={name === "phone" ? 30 : name === "email" ? 160 : 120}
        dir={options.ltr ? "ltr" : undefined}
        autoComplete="off"
        inputMode={options.type === "tel" ? "tel" : options.type === "email" ? "email" : undefined}
      />
    </label>
  );

  return (
    <section className="kiosk-register" dir={dirFor(language)}>
      <h1>{text.registerTitle}</h1>
      {closed ? (
        <p className="kiosk-empty">{text.closed}</p>
      ) : (
        <form onSubmit={submit}>
          {field("full_name", text.fullName, { required: true })}
          {field("organization", text.organization)}
          {field("job_title", text.jobTitle)}
          {field("phone", text.phone, { type: "tel", ltr: true })}
          {field("email", text.email, { type: "email", ltr: true })}
          <button disabled={saving}>{saving ? text.saving : text.submit}</button>
        </form>
      )}
    </section>
  );
}

function BadgeView({
  badge,
  event,
  language,
  text,
  onClose,
}: {
  badge: Badge;
  event: string;
  language: KioskLanguage;
  text: KioskText;
  onClose: () => void;
}) {
  return (
    <section className="kiosk-badge-view" dir={dirFor(language)}>
      <h1>{text.badgeReady}</h1>
      <div className="kiosk-badge-card">
        <small>{event}</small>
        <strong>{badge.name}</strong>
        {badge.organization && <span>{badge.organization}</span>}
        <QrCode value={badgeUrl(badge.code)} label={`${text.badgeCode} ${badge.code}`} className="kiosk-badge-qr" />
        <span className="kiosk-badge-code" dir="ltr">
          {badge.code.slice(0, 4)} {badge.code.slice(4)}
        </span>
      </div>
      <p>{badge.offline ? text.badgeOffline : text.badgeHint}</p>
      <button type="button" onClick={onClose}>{text.done}</button>
    </section>
  );
}

export function KioskShell({
  kiosk,
  contractId,
  title,
  organization,
  now,
  children,
}: {
  kiosk: ManifestKiosk;
  contractId: string;
  title: string;
  organization: string;
  now: number;
  children: ReactNode;
}) {
  const languages = kiosk.languages.length ? kiosk.languages : (["ar"] as KioskLanguage[]);
  const [language, setLanguage] = useState<KioskLanguage>(languages[0]);
  const [view, setView] = useState<View>("home");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const logo = useLogo(kiosk);
  const text = textFor(language);
  const hasProgram = kiosk.agenda.length > 0;
  const canRegister = Boolean(kiosk.registration);
  const [badge, setBadge] = useState<Badge | null>(null);

  // التسجيلات المحفوظة دون إنترنت تُرسل عند عودة الاتصال
  useEffect(() => {
    if (!canRegister) return;
    void import("qrcode").catch(() => undefined); // يُحمَّل مسبقًا لتظهر البطاقة دون إنترنت
    void flushGuestQueue();
    const timer = setInterval(() => void flushGuestQueue(), 30_000);
    const online = () => void flushGuestQueue();
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [canRegister]);

  const resetIdle = () => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setView("home");
      setBadge(null);
      setLanguage(languages[0]);
    }, IDLE_MS);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const activeLanguage = languages.includes(language) ? language : languages[0];

  return (
    <div className="kiosk" lang={activeLanguage} onPointerDown={resetIdle} onKeyDown={resetIdle}>
      <section className="kiosk-main">
        {view === "program" && hasProgram ? (
          <ProgramView agenda={kiosk.agenda} now={now} language={activeLanguage} text={text} />
        ) : view === "register" && canRegister ? (
          <RegisterView
            contractId={contractId}
            language={activeLanguage}
            text={text}
            onDone={(next) => {
              setBadge(next);
              setView("badge");
            }}
          />
        ) : view === "badge" && badge ? (
          <BadgeView
            badge={badge}
            event={title}
            language={activeLanguage}
            text={text}
            onClose={() => {
              setBadge(null);
              setView("home");
            }}
          />
        ) : (
          children
        )}
      </section>

      <nav className="kiosk-panel" dir={dirFor(activeLanguage)} aria-label={text.program}>
        <div className="kiosk-brand">
          {logo ? (
            // الشعار محفوظ محليًا كملف
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={title} />
          ) : (
            <strong>{title}</strong>
          )}
        </div>

        <div className="kiosk-clock">
          <time dir="ltr">{formatTime(now, activeLanguage)}</time>
          <small>{formatDay(now, activeLanguage)}</small>
        </div>

        {languages.length > 1 && (
          <div className="kiosk-languages" role="group" aria-label={text.language}>
            {languages.map((item) => (
              <button
                key={item}
                type="button"
                lang={item}
                aria-pressed={item === activeLanguage}
                onClick={() => setLanguage(item)}
              >
                {LANGUAGE_LABEL[item]}
              </button>
            ))}
          </div>
        )}

        <div className="kiosk-menu">
          {canRegister && (
            <button
              type="button"
              className="kiosk-primary"
              aria-pressed={view === "register" || view === "badge"}
              onClick={() => setView("register")}
            >
              <svg className="kiosk-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10" cy="8" r="4" />
                <path d="M3 20c.8-3.6 3.6-6 7-6 1.5 0 2.9.5 4 1.3M18 14v6M15 17h6" />
              </svg>
              <strong>{text.register}</strong>
              <small>{text.registerHint}</small>
            </button>
          )}
          <button type="button" aria-pressed={view === "home"} onClick={() => setView("home")}>
            <svg className="kiosk-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
            <strong>{text.home}</strong>
            <small>{text.homeHint}</small>
          </button>
          {hasProgram && (
            <button type="button" aria-pressed={view === "program"} onClick={() => setView("program")}>
              <svg className="kiosk-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
                <path d="M3.5 10h17M8 3v4M16 3v4" />
              </svg>
              <strong>{text.program}</strong>
              <small>{text.programHint}</small>
            </button>
          )}
        </div>

        <small className="kiosk-footer">{organization}</small>
      </nav>
    </div>
  );
}
