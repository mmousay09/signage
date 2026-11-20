import type { AgendaEntry, KioskLanguage } from "@/player/offline/store";

export const LANGUAGE_LABEL: Record<KioskLanguage, string> = { ar: "ع", fr: "FR", en: "EN" };

const TEXT = {
  ar: {
    language: "اللغة",
    home: "الرئيسية",
    homeHint: "العرض",
    program: "البرنامج",
    programHint: "جلسات اليوم",
    todayProgram: "برنامج اليوم",
    upcomingProgram: "البرنامج القادم",
    now: "الآن",
    next: "التالي",
    ended: "انتهى برنامج الفعالية",
    back: "رجوع",
  },
  fr: {
    language: "Langue",
    home: "Accueil",
    homeHint: "Affichage",
    program: "Programme",
    programHint: "Sessions du jour",
    todayProgram: "Programme du jour",
    upcomingProgram: "Programme à venir",
    now: "En cours",
    next: "Ensuite",
    ended: "Le programme est terminé",
    back: "Retour",
  },
  en: {
    language: "Language",
    home: "Home",
    homeHint: "Display",
    program: "Program",
    programHint: "Today's sessions",
    todayProgram: "Today's program",
    upcomingProgram: "Upcoming program",
    now: "Now",
    next: "Next",
    ended: "The program has ended",
    back: "Back",
  },
} satisfies Record<KioskLanguage, Record<string, string>>;

export type KioskText = (typeof TEXT)["ar"];

export const textFor = (language: KioskLanguage): KioskText => TEXT[language];

export const dirFor = (language: KioskLanguage) => (language === "ar" ? "rtl" : "ltr");

const LOCALE: Record<KioskLanguage, string> = { ar: "ar-LY-u-nu-latn", fr: "fr-FR", en: "en-GB" };

export const TIME_ZONE = "Africa/Tripoli";

export function formatTime(ms: number, language: KioskLanguage) {
  return new Intl.DateTimeFormat(LOCALE[language], {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}

export function formatDay(ms: number, language: KioskLanguage) {
  return new Intl.DateTimeFormat(LOCALE[language], {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(ms);
}

export function dayKey(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(ms);
}

export function localized(entry: AgendaEntry, language: KioskLanguage) {
  const translated = language === "ar" ? undefined : entry.translations?.[language];
  return {
    title: translated?.title || entry.title,
    speaker: translated?.speaker || entry.speaker,
    place: translated?.place || entry.place,
  };
}
