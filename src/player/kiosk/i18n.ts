import type { AgendaEntry, AssistantAnswer, KioskLanguage } from "@/player/offline/store";

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
    askHint: "أسئلة شائعة",
    greeting: "مرحبًا، أنا {name}",
    chooseQuestion: "اختر سؤالك وسأجيبك",
    listenAgain: "أعد الاستماع",
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
    checkin: "تسجيل الحضور",
    checkinHint: "امسح بطاقتك",
    checkinTitle: "تسجيل الحضور",
    checkinScan: "اعرض رمز بطاقتك أمام الكاميرا",
    checkinManual: "أو اكتب رمز البطاقة",
    checkinConfirm: "تأكيد",
    checkinWelcome: "أهلًا {name}، سُجّل حضورك",
    checkinAlready: "{name}، حضورك مسجّل من قبل",
    checkinQueued: "سُجّل حضورك، ويُرسل عند عودة الاتصال",
    checkinNotFound: "لم نجد هذه البطاقة. تأكد من الرمز أو راجع الاستقبال.",
    checkinOtherEvent: "هذه البطاقة لفعالية أخرى.",
    checkinNoCamera: "الكاميرا غير متاحة. اكتب رمز البطاقة.",
    checkinNext: "الضيف التالي",
    askPlaceholder: "اكتب سؤالك هنا",
    ask: "اسأل",
    speakQuestion: "اضغط وتكلم",
    listening: "أسمعك…",
    thinking: "لحظة…",
    noAnswer: "لا أعرف الإجابة عن هذا السؤال. يمكنك سؤال مكتب الاستقبال.",
    orChoose: "أو اختر من الأسئلة",
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
    askHint: "Questions fréquentes",
    greeting: "Bonjour, je suis {name}",
    chooseQuestion: "Choisissez votre question",
    listenAgain: "Réécouter",
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
    checkin: "Présence",
    checkinHint: "Scannez votre badge",
    checkinTitle: "Enregistrement de présence",
    checkinScan: "Présentez le code de votre badge devant la caméra",
    checkinManual: "ou saisissez le code du badge",
    checkinConfirm: "Valider",
    checkinWelcome: "Bienvenue {name}, votre présence est enregistrée",
    checkinAlready: "{name}, votre présence est déjà enregistrée",
    checkinQueued: "Présence enregistrée, envoi dès le retour de la connexion",
    checkinNotFound: "Badge introuvable. Vérifiez le code ou adressez-vous à l'accueil.",
    checkinOtherEvent: "Ce badge concerne un autre événement.",
    checkinNoCamera: "Caméra indisponible. Saisissez le code du badge.",
    checkinNext: "Invité suivant",
    askPlaceholder: "Écrivez votre question",
    ask: "Demander",
    speakQuestion: "Appuyez et parlez",
    listening: "Je vous écoute…",
    thinking: "Un instant…",
    noAnswer: "Je ne connais pas la réponse. Vous pouvez demander à l'accueil.",
    orChoose: "ou choisissez une question",
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
    askHint: "Common questions",
    greeting: "Hello, I'm {name}",
    chooseQuestion: "Choose your question",
    listenAgain: "Listen again",
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
    checkin: "Check in",
    checkinHint: "Scan your badge",
    checkinTitle: "Check in",
    checkinScan: "Hold your badge code up to the camera",
    checkinManual: "or type the badge code",
    checkinConfirm: "Confirm",
    checkinWelcome: "Welcome {name}, you're checked in",
    checkinAlready: "{name}, you're already checked in",
    checkinQueued: "You're checked in. It will sync once the connection is back.",
    checkinNotFound: "We couldn't find this badge. Check the code or visit the reception desk.",
    checkinOtherEvent: "This badge is for another event.",
    checkinNoCamera: "The camera isn't available. Type the badge code.",
    checkinNext: "Next guest",
    askPlaceholder: "Type your question",
    ask: "Ask",
    speakQuestion: "Tap and speak",
    listening: "Listening…",
    thinking: "One moment…",
    noAnswer: "I don't know the answer to that. You can ask the reception desk.",
    orChoose: "or choose a question",
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

export function localizedAnswer(entry: AssistantAnswer, language: KioskLanguage) {
  const translated = language === "ar" ? undefined : entry.translations?.[language];
  return {
    question: translated?.question || entry.question,
    answer: translated?.answer || entry.answer,
    // يُنطق الجواب بلغة نصه الفعلية
    answerLanguage: (translated?.answer ? language : "ar") as KioskLanguage,
  };
}
