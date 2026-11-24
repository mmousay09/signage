"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { QrCode } from "@/components/ui/QrCode";
import { QrScanner } from "@/features/screens/QrScanner";
import { answerQuestion, canListen, listen } from "@/player/kiosk/assistant";
import {
  badgeUrl,
  checkInGuest,
  flushCheckInQueue,
  parseBadgeCode,
  registerGuest,
  type CheckInResult,
  type GuestInput,
} from "@/player/kiosk/guests";
import { speak, stopSpeaking } from "@/player/audio/speech";
import {
  dayKey,
  dirFor,
  formatDay,
  formatTime,
  LANGUAGE_LABEL,
  localized,
  localizedAnswer,
  textFor,
  type KioskText,
} from "@/player/kiosk/i18n";
import {
  getAssetUrl,
  type AgendaEntry,
  type KioskLanguage,
  type ManifestAsset,
  type ManifestAssistant,
  type ManifestKiosk,
} from "@/player/offline/store";

/** بعد هذه المدة دون لمس تعود الشاشة إلى العرض واللغة الأولى */
const IDLE_MS = 60_000;

type View = "home" | "program" | "register" | "badge" | "assistant" | "checkin";

interface Badge {
  code: string;
  name: string;
  organization: string;
  offline: boolean;
}

function useCachedImage(asset: ManifestAsset | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const logoId = asset?.id;
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

function askLabel(language: KioskLanguage, name: string) {
  return language === "ar" ? `اسأل ${name}` : language === "fr" ? `Demander à ${name}` : `Ask ${name}`;
}

/** شخصية المساعد: صورته إن رفعها المالك، وإلا وجه مرسوم. الفم والموجات تتحرك أثناء الكلام */
function AssistantAvatar({ image, name, state }: { image: string | null; name: string; state: "idle" | "listening" | "thinking" | "speaking" }) {
  return (
    <div className="kiosk-avatar" data-state={state} aria-hidden="true">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} />
      ) : (
        <svg viewBox="0 0 120 120">
          <circle className="avatar-face" cx="60" cy="60" r="56" />
          <g className="avatar-eyes">
            <ellipse cx="42" cy="52" rx="6" ry="8" />
            <ellipse cx="78" cy="52" rx="6" ry="8" />
          </g>
          <ellipse className="avatar-mouth" cx="60" cy="82" rx="16" ry="6" />
        </svg>
      )}
      <span className="kiosk-avatar-waves">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function AssistantView({
  assistant,
  contractId,
  language,
  text,
}: {
  assistant: ManifestAssistant;
  contractId: string;
  language: KioskLanguage;
  text: KioskText;
}) {
  const avatar = useCachedImage(assistant.avatar);
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [reply, setReply] = useState<{ question: string; answer: string; language: KioskLanguage } | null>(null);
  const [draft, setDraft] = useState("");
  const [voiceInput, setVoiceInput] = useState(false);
  const cancelListening = useRef<(() => void) | null>(null);
  const turn = useRef(0);

  // يُعرف بعد التحميل في المتصفح، فلا يختلف ما يُرسم أولًا
  useEffect(() => setVoiceInput(canListen()), []);
  useEffect(
    () => () => {
      cancelListening.current?.();
      stopSpeaking();
    },
    [],
  );

  const say = async (value: string, voice: KioskLanguage, current: number) => {
    setState("speaking");
    await speak(value, voice);
    if (turn.current === current) setState("idle");
  };

  const show = async (question: string, answer: string, answerLanguage: KioskLanguage, current: number) => {
    setReply({ question, answer, language: answerLanguage });
    await say(answer, answerLanguage, current);
  };

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question) return;
    const current = ++turn.current;
    stopSpeaking();
    setDraft("");
    setState("thinking");
    setReply({ question, answer: "", language });
    const result = await answerQuestion({
      contract: contractId,
      question,
      answers: assistant.answers,
      language,
      ai: Boolean(assistant.ai),
      noAnswer: (answerLanguage) => textFor(answerLanguage).noAnswer,
    });
    if (turn.current !== current) return;
    await show(question, result.answer, result.language, current);
  }

  function startListening() {
    if (state === "listening") {
      cancelListening.current?.();
      return;
    }
    const current = ++turn.current;
    stopSpeaking();
    setState("listening");
    const session = listen(language);
    cancelListening.current = session.cancel;
    void session.result.then((heard) => {
      cancelListening.current = null;
      if (turn.current !== current) return;
      if (heard) void ask(heard);
      else setState("idle");
    });
  }

  const status =
    state === "listening" ? text.listening : state === "thinking" ? text.thinking : text.greeting.replace("{name}", assistant.name);

  return (
    <section className="kiosk-assistant" dir={dirFor(language)}>
      <header>
        <AssistantAvatar image={avatar} name={assistant.name} state={state} />
        <div>
          <h1 aria-live="polite">{status}</h1>
          <p>{voiceInput ? text.speakQuestion : text.askPlaceholder}</p>
        </div>
      </header>

      <form
        className="kiosk-ask"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        {voiceInput && (
          <button
            type="button"
            className="kiosk-mic"
            aria-pressed={state === "listening"}
            aria-label={text.speakQuestion}
            onClick={startListening}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
            </svg>
          </button>
        )}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={text.askPlaceholder}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" disabled={!draft.trim() || state === "thinking"}>
          {text.ask}
        </button>
      </form>

      {reply && (
        <div className="kiosk-answer" aria-live="polite" dir={dirFor(reply.language)}>
          <strong>{reply.question}</strong>
          {reply.answer ? (
            <>
              <p>{reply.answer}</p>
              <button
                type="button"
                onClick={() => void say(reply.answer, reply.language, ++turn.current)}
                disabled={state === "speaking"}
              >
                {text.listenAgain}
              </button>
            </>
          ) : (
            <p className="kiosk-thinking">
              <i />
              <i />
              <i />
            </p>
          )}
        </div>
      )}

      {assistant.answers.length > 0 && (
        <>
          <p className="kiosk-questions-title">{text.orChoose}</p>
          <ul className="kiosk-questions">
            {assistant.answers.map((entry) => {
              const item = localizedAnswer(entry, language);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={reply?.question === item.question}
                    onClick={() => {
                      const current = ++turn.current;
                      stopSpeaking();
                      void show(item.question, item.answer, item.answerLanguage, current);
                    }}
                  >
                    {item.question}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** الزائر يعرض رمز بطاقته أمام كاميرا الشاشة، أو يكتب الرمز */
function CheckInView({
  contractId,
  language,
  text,
}: {
  contractId: string;
  language: KioskLanguage;
  text: KioskText;
}) {
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [cameraFailed, setCameraFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const next = () => {
    clearTimeout(resetTimer.current);
    setResult(null);
    setCode("");
    setAttempt((value) => value + 1);
  };

  async function submit(raw: string) {
    if (busy || result) return;
    const parsed = parseBadgeCode(raw);
    setBusy(true);
    const outcome: CheckInResult = parsed ? await checkInGuest(contractId, parsed) : { status: "not_found" };
    setBusy(false);
    setResult(outcome);
    const name = outcome.name ?? "";
    if ((outcome.status === "checked_in" || outcome.status === "already") && name) {
      void speak(text.checkinWelcome.replace("{name}", name).split("،")[0], language);
    }
    resetTimer.current = setTimeout(next, outcome.status === "checked_in" || outcome.status === "already" ? 5_000 : 7_000);
  }

  const success = result && (result.status === "checked_in" || result.status === "already" || result.status === "queued");
  const message = !result
    ? null
    : result.status === "checked_in"
      ? text.checkinWelcome.replace("{name}", result.name ?? "")
      : result.status === "already"
        ? text.checkinAlready.replace("{name}", result.name ?? "")
        : result.status === "queued"
          ? text.checkinQueued
          : result.status === "other_event"
            ? text.checkinOtherEvent
            : result.status === "closed"
              ? text.closed
              : text.checkinNotFound;

  return (
    <section className="kiosk-checkin" dir={dirFor(language)}>
      <h1>{text.checkinTitle}</h1>
      {result ? (
        <div className="kiosk-checkin-result" data-ok={Boolean(success)} role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {success ? <path d="M5 12.5 10 17.5 19.5 7" /> : <path d="M7 7l10 10M17 7 7 17" />}
          </svg>
          <p>{message}</p>
          <button type="button" onClick={next}>{text.checkinNext}</button>
        </div>
      ) : (
        <>
          {!cameraFailed && (
            <QrScanner
              key={attempt}
              facing="user"
              className="kiosk-scanner"
              labels={{ prompt: text.checkinScan, denied: text.checkinNoCamera, failed: text.checkinNoCamera, close: text.done }}
              onResult={(value) => void submit(value)}
              onError={() => setCameraFailed(true)}
            />
          )}
          {cameraFailed && <p className="kiosk-empty">{text.checkinNoCamera}</p>}
          <form
            className="kiosk-ask"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(code);
            }}
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={text.checkinManual}
              aria-label={text.checkinManual}
              maxLength={12}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
            />
            <button type="submit" disabled={busy || code.replace(/\s/g, "").length < 8}>
              {text.checkinConfirm}
            </button>
          </form>
        </>
      )}
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
  const logo = useCachedImage(kiosk.logo);
  const text = textFor(language);
  const hasProgram = kiosk.agenda.length > 0;
  const canRegister = Boolean(kiosk.registration);
  const canCheckIn = Boolean(kiosk.checkin);
  const assistant =
    kiosk.assistant && (kiosk.assistant.answers.length > 0 || kiosk.assistant.ai) ? kiosk.assistant : null;
  const [badge, setBadge] = useState<Badge | null>(null);

  // التسجيلات المحفوظة دون إنترنت تُرسل عند عودة الاتصال
  // والحضور المسجل دون إنترنت كذلك
  useEffect(() => {
    if (!canRegister && !canCheckIn) return;
    if (canRegister) void import("qrcode").catch(() => undefined); // يُحمَّل مسبقًا لتظهر البطاقة دون إنترنت
    if (canCheckIn) void import("jsqr").catch(() => undefined);
    const flush = () => void flushCheckInQueue();
    flush();
    const timer = setInterval(flush, 30_000);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [canRegister, canCheckIn]);

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
        ) : view === "assistant" && assistant ? (
          <AssistantView assistant={assistant} contractId={contractId} language={activeLanguage} text={text} />
        ) : view === "checkin" && canCheckIn ? (
          <CheckInView contractId={contractId} language={activeLanguage} text={text} />
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
          {canCheckIn && (
            <button type="button" aria-pressed={view === "checkin"} onClick={() => setView("checkin")}>
              <svg className="kiosk-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                <path d="M8 12.5 11 15.5 16.5 9" />
              </svg>
              <strong>{text.checkin}</strong>
              <small>{text.checkinHint}</small>
            </button>
          )}
          {assistant && (
            <button type="button" aria-pressed={view === "assistant"} onClick={() => setView("assistant")}>
              <svg className="kiosk-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4h0A2 2 0 0 1 4 14z" />
                <path d="M10 8.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.5M12 13.2v.1" />
              </svg>
              <strong>{askLabel(activeLanguage, assistant.name)}</strong>
              <small>{text.askHint}</small>
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
