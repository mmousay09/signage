"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/ui/QrCode";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

type Language = "ar" | "fr" | "en";

interface BadgeData {
  code: string;
  full_name: string;
  organization: string | null;
  job_title: string | null;
  language: Language;
  checked_in: boolean;
  event: string;
  starts_at: string;
  ends_at: string;
  host: string;
}

const TEXT = {
  ar: {
    title: "بطاقة الضيف",
    show: "اعرض هذه البطاقة عند الدخول. احفظ الصفحة أو صوّرها للرجوع إليها.",
    checkedIn: "تم تسجيل حضورك",
    code: "رمز البطاقة",
    missing: "لم نجد هذه البطاقة. إن سجلت قبل قليل والشاشة دون إنترنت، أعد فتح الرابط بعد دقائق.",
    loading: "جارٍ فتح البطاقة",
  },
  fr: {
    title: "Badge invité",
    show: "Présentez ce badge à l'entrée. Enregistrez la page ou faites une capture d'écran.",
    checkedIn: "Votre présence est enregistrée",
    code: "Code du badge",
    missing: "Badge introuvable. Si vous venez de vous inscrire, rouvrez le lien dans quelques minutes.",
    loading: "Ouverture du badge",
  },
  en: {
    title: "Guest badge",
    show: "Show this badge at the entrance. Save the page or take a screenshot.",
    checkedIn: "You are checked in",
    code: "Badge code",
    missing: "Badge not found. If you just registered, open the link again in a few minutes.",
    loading: "Opening your badge",
  },
} satisfies Record<Language, Record<string, string>>;

const LOCALE: Record<Language, string> = { ar: "ar-LY-u-nu-latn", fr: "fr-FR", en: "en-GB" };

export function GuestBadge({ code }: { code: string }) {
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/b/${code}`);
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    void client.rpc("get_badge", { p_code: code }).then(({ data, error }) => {
      if (error || !data) return setState("missing");
      setBadge(data as BadgeData);
      setState("ready");
    });
  }, [code]);

  const language = badge?.language ?? "ar";
  const text = TEXT[language];
  const dates =
    badge &&
    new Intl.DateTimeFormat(LOCALE[language], { timeZone: "Africa/Tripoli", dateStyle: "long" }).formatRange(
      new Date(badge.starts_at),
      new Date(badge.ends_at),
    );

  return (
    <main className="guest-badge" dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
      {state === "loading" && <p className="page-note">{text.loading}</p>}
      {state === "missing" && <p className="form-error">{text.missing}</p>}
      {badge && (
        <article className="guest-badge-card">
          <header>
            <small>{badge.host}</small>
            <h1>{badge.event}</h1>
            <span>{dates}</span>
          </header>
          <strong>{badge.full_name}</strong>
          {(badge.job_title || badge.organization) && (
            <p>{[badge.job_title, badge.organization].filter(Boolean).join(" · ")}</p>
          )}
          {url && <QrCode value={url} label={`${text.code} ${badge.code}`} className="guest-badge-qr" />}
          <span className="guest-badge-code" dir="ltr">
            {badge.code.slice(0, 4)} {badge.code.slice(4)}
          </span>
          {badge.checked_in && <span className="status-pill" data-state="active">{text.checkedIn}</span>}
        </article>
      )}
      {badge && <p className="page-note">{text.show}</p>}
    </main>
  );
}
