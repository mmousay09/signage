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
    register: "التسجيل",
    registerHint: "ضيف جديد",
    registerTitle: "تسجيل ضيف جديد",
    fullName: "الاسم الكامل",
    organization: "الجهة",
    jobTitle: "الصفة",
    phone: "رقم الهاتف",
    email: "البريد الإلكتروني",
    optional: "اختياري",
    submit: "سجّلني",
    saving: "جارٍ التسجيل",
    badgeReady: "بطاقتك جاهزة",
    badgeHint: "امسح الرمز بهاتفك لحفظ بطاقتك، واعرضها عند الدخول.",
    badgeOffline: "حُفظ تسجيلك، وتعمل البطاقة على هاتفك بعد عودة الاتصال.",
    badgeCode: "رمز البطاقة",
    done: "تم",
    closed: "التسجيل مغلق حاليًا. يرجى مراجعة مكتب الاستقبال.",
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
    register: "Inscription",
    registerHint: "Nouvel invité",
    registerTitle: "Inscription d'un invité",
    fullName: "Nom complet",
    organization: "Organisme",
    jobTitle: "Fonction",
    phone: "Téléphone",
    email: "E-mail",
    optional: "facultatif",
    submit: "M'inscrire",
    saving: "Inscription en cours",
    badgeReady: "Votre badge est prêt",
    badgeHint: "Scannez le code avec votre téléphone pour garder votre badge et présentez-le à l'entrée.",
    badgeOffline: "Votre inscription est enregistrée. Le badge sera disponible sur votre téléphone dès le retour de la connexion.",
    badgeCode: "Code du badge",
    done: "Terminé",
    closed: "Les inscriptions sont fermées. Merci de vous adresser à l'accueil.",
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
    register: "Register",
    registerHint: "New guest",
    registerTitle: "Guest registration",
    fullName: "Full name",
    organization: "Organization",
    jobTitle: "Job title",
    phone: "Phone number",
    email: "Email",
    optional: "optional",
    submit: "Register me",
    saving: "Registering",
    badgeReady: "Your badge is ready",
    badgeHint: "Scan the code with your phone to keep your badge, and show it at the entrance.",
    badgeOffline: "Your registration is saved. The badge will open on your phone once the connection is back.",
    badgeCode: "Badge code",
    done: "Done",
    closed: "Registration is closed. Please visit the reception desk.",
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
