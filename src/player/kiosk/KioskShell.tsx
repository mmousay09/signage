"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

type View = "home" | "program";

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

export function KioskShell({
  kiosk,
  title,
  organization,
  now,
  children,
}: {
  kiosk: ManifestKiosk;
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

  const resetIdle = () => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setView("home");
      setLanguage(languages[0]);
    }, IDLE_MS);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const activeLanguage = languages.includes(language) ? language : languages[0];

  return (
    <div className="kiosk" lang={activeLanguage} onPointerDown={resetIdle}>
      <section className="kiosk-main">
        {view === "program" && hasProgram ? (
          <ProgramView agenda={kiosk.agenda} now={now} language={activeLanguage} text={text} />
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
