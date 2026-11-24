// المساعد: يفهم سؤال الزائر مكتوبًا أو مسموعًا، فيبحث أولًا في الأسئلة الجاهزة (يعمل دون إنترنت)،
// ثم يسأل الذكاء الاصطناعي إن فعّله المالك، وإلا يعتذر.

import { getPlayerClient } from "@/lib/supabase/player";
import { localizedAnswer } from "@/player/kiosk/i18n";
import type { AssistantAnswer, KioskLanguage } from "@/player/offline/store";

const MATCH_THRESHOLD = 0.5;

// كلمات ليبية وعامية شائعة تُردّ إلى الفصحى قبل المقارنة
const SYNONYMS: Record<string, string> = {
  وين: "اين",
  فين: "اين",
  شن: "ماذا",
  شنو: "ماذا",
  شنهو: "ماذا",
  شنهي: "ماذا",
  شني: "ماذا",
  امتى: "متي",
  وقتاش: "متي",
  قداش: "كم",
  بكم: "كم",
  كيفاش: "كيف",
  حمام: "دوره مياه",
  حمامات: "دوره مياه",
  توالييت: "دوره مياه",
  ويفي: "انترنت",
  wifi: "انترنت",
  نت: "انترنت",
  اكل: "طعام",
  الماكله: "طعام",
  ماكله: "طعام",
  غدا: "غداء",
  where: "اين",
  toilet: "دوره مياه",
  toilets: "دوره مياه",
  restroom: "دوره مياه",
  bathroom: "دوره مياه",
  internet: "انترنت",
};

const STOP_WORDS = new Set([
  "في", "من", "على", "علي", "عن", "الى", "الي", "هل", "يا", "انا", "انت", "هو", "هي", "هذا", "هذه",
  "لو", "ممكن", "اريد", "نبي", "نبغي", "بالله", "عفوا", "من فضلك",
  "the", "a", "an", "is", "are", "there", "any", "have", "has", "what", "how", "your", "my", "me", "of", "to", "in", "on", "at", "for", "please", "can", "i", "you", "do", "does",
  "le", "la", "les", "un", "une", "des", "de", "du", "est", "sont", "à", "au", "aux", "en", "je", "vous", "il",
]);

export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "") // التشكيل والتطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // حركات الحروف اللاتينية
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string) {
  let value = SYNONYMS[word] ?? word;
  // أدوات التعريف والعطف الملتصقة
  for (const prefix of ["وال", "بال", "فال", "كال", "لل", "ال"]) {
    if (value.startsWith(prefix) && value.length - prefix.length >= 3) {
      value = value.slice(prefix.length);
      break;
    }
  }
  if (value.length > 4 && /^[وب]/.test(value)) value = value.slice(1);
  return SYNONYMS[value] ?? value;
}

export function tokens(text: string) {
  return normalize(text)
    .split(" ")
    .filter((word) => word && !STOP_WORDS.has(word))
    .flatMap((word) => stem(word).split(" "))
    .filter(Boolean);
}

function editDistanceAtMostOne(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const sameWord = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a) || editDistanceAtMostOne(a, b)));

function trigrams(text: string) {
  const value = ` ${normalize(text).replace(/\s/g, "  ")} `;
  const grams = new Set<string>();
  for (let index = 0; index < value.length - 2; index++) grams.add(value.slice(index, index + 3));
  return grams;
}

/** تشابه بين 0 و1: الكلمات المشتركة أولًا، ومقاطع الحروف احتياطًا للأخطاء الإملائية */
export function similarity(query: string, candidate: string) {
  const a = tokens(query);
  const b = tokens(candidate);
  let wordScore = 0;
  if (a.length && b.length) {
    const used = new Set<number>();
    let matches = 0;
    for (const word of a) {
      const index = b.findIndex((other, position) => !used.has(position) && sameWord(word, other));
      if (index >= 0) {
        used.add(index);
        matches++;
      }
    }
    wordScore = (2 * matches) / (a.length + b.length);
  }
  const ga = trigrams(query);
  const gb = trigrams(candidate);
  let shared = 0;
  ga.forEach((gram) => {
    if (gb.has(gram)) shared++;
  });
  const gramScore = ga.size + gb.size ? (2 * shared) / (ga.size + gb.size) : 0;
  return Math.max(wordScore, gramScore * 0.85);
}

/** لغة السؤال من حروفه، فمن يكتب بالعربية يُجاب بالعربية مهما كانت لغة الواجهة */
export function detectLanguage(text: string, fallback: KioskLanguage): KioskLanguage {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (fallback === "ar") return /[àâçéèêëîïôûùüÿœ]/i.test(text) ? "fr" : "en";
  return fallback;
}

export interface AssistantReply {
  source: "match" | "ai" | "none";
  answer: string;
  language: KioskLanguage;
  answerId?: string;
}

export function findAnswer(question: string, answers: AssistantAnswer[], language: KioskLanguage) {
  let best: { entry: AssistantAnswer; score: number } | null = null;
  for (const entry of answers) {
    const variants = [entry.question, ...Object.values(entry.translations ?? {}).map((item) => item?.question ?? "")];
    const score = Math.max(...variants.filter(Boolean).map((variant) => similarity(question, variant)));
    if (!best || score > best.score) best = { entry, score };
  }
  if (!best || best.score < MATCH_THRESHOLD) return null;
  const label = localizedAnswer(best.entry, language);
  return { source: "match", answer: label.answer, language: label.answerLanguage, answerId: best.entry.id } satisfies AssistantReply;
}

function logQuestion(contract: string, question: string, language: KioskLanguage, reply: AssistantReply) {
  if (reply.source === "ai") return; // الخادم سجّله
  // طلبات Supabase لا تُرسل إلا عند انتظار نتيجتها
  getPlayerClient()
    .rpc("log_assistant_question", {
      p_contract: contract,
      p_question: question,
      p_language: language,
      p_source: reply.source,
      p_answer_id: reply.answerId ?? null,
      p_answer: reply.source === "match" ? reply.answer : null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

async function askAi(contract: string, question: string, language: KioskLanguage): Promise<string | null> {
  const { data } = await getPlayerClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token || !navigator.onLine) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ contract, question, language }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { answer?: string };
    return body.answer?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function answerQuestion(options: {
  contract: string;
  question: string;
  answers: AssistantAnswer[];
  language: KioskLanguage;
  ai: boolean;
  noAnswer: (language: KioskLanguage) => string;
}): Promise<AssistantReply> {
  const question = options.question.trim().slice(0, 300);
  const language = detectLanguage(question, options.language);
  let reply: AssistantReply | null = findAnswer(question, options.answers, language);
  if (!reply && options.ai) {
    const answer = await askAi(options.contract, question, language);
    if (answer) reply = { source: "ai", answer, language };
  }
  reply ??= { source: "none", answer: options.noAnswer(language), language };
  logQuestion(options.contract, question, language, reply);
  return reply;
}

// ===== السماع =====

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
    __signageHeard?: (text: string | null) => void;
  }
}

const RECOGNITION_LOCALE: Record<KioskLanguage, string> = { ar: "ar-LY", fr: "fr-FR", en: "en-GB" };

export function canListen() {
  if (typeof window === "undefined") return false;
  return Boolean(window.SignageAndroid?.listen || window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** يعيد ما قاله الزائر، أو null إن لم يُسمع شيء */
export function listen(language: KioskLanguage): { result: Promise<string | null>; cancel: () => void } {
  const bridge = window.SignageAndroid;
  if (bridge?.listen) {
    let done: (text: string | null) => void = () => undefined;
    const result = new Promise<string | null>((resolve) => {
      const guard = setTimeout(() => finish(null), 15_000);
      const finish = (text: string | null) => {
        clearTimeout(guard);
        window.__signageHeard = undefined;
        resolve(text?.trim() || null);
      };
      done = finish;
      window.__signageHeard = finish;
      if (!bridge.listen!(RECOGNITION_LOCALE[language])) finish(null);
    });
    return {
      result,
      cancel: () => {
        bridge.stopListening?.();
        done(null);
      },
    };
  }

  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) return { result: Promise.resolve(null), cancel: () => undefined };
  const recognition = new Recognition();
  recognition.lang = RECOGNITION_LOCALE[language];
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  const result = new Promise<string | null>((resolve) => {
    let heard: string | null = null;
    recognition.onresult = (event) => {
      heard = event.results[0]?.[0]?.transcript ?? null;
    };
    recognition.onerror = () => undefined;
    recognition.onend = () => resolve(heard?.trim() || null);
    try {
      recognition.start();
    } catch {
      resolve(null);
    }
  });
  return { result, cancel: () => recognition.abort() };
}
