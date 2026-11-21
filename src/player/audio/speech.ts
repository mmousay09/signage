// صوت الجهاز: تطبيق أندرويد الخاص بالمنظومة إن وُجد، وإلا صوت المتصفح.
// في المرحلة 5 يحل محله صوت ElevenLabs المحفوظ.

type SpeechLanguage = "ar" | "fr" | "en";
type SpeechResult = "spoken" | "no_voice" | "failed";

interface AndroidBridge {
  speak(id: string, text: string, language: string): boolean;
  stopSpeaking(): void;
}

declare global {
  interface Window {
    SignageAndroid?: AndroidBridge;
    __signageSpeechDone?: (id: string, ok: boolean) => void;
  }
}

let dictionary: { term: string; spoken: string }[] = [];

/** يُضبط من البيان: الكلمات الأطول أولًا حتى لا تُستبدل أجزاء منها */
export function setPronunciations(list: { term: string; spoken: string }[] | undefined) {
  dictionary = [...(list ?? [])].sort((a, b) => b.term.length - a.term.length);
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function applyPronunciations(text: string) {
  return dictionary.reduce(
    (result, entry) =>
      result.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(entry.term)}(?=$|[^\\p{L}\\p{N}])`, "giu"), `$1${entry.spoken}`),
    text,
  );
}

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  voicesReady ??= new Promise((resolve) => {
    const current = window.speechSynthesis.getVoices();
    if (current.length) return resolve(current);
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1_500);
  });
  return voicesReady;
}

const guardMs = (text: string) => Math.max(10_000, text.length * 180);

function speakAndroid(bridge: AndroidBridge, text: string, language: SpeechLanguage): Promise<SpeechResult> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const previous = window.__signageSpeechDone;
    let settled = false;
    const finish = (result: SpeechResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve(result);
    };
    const guard = setTimeout(() => {
      bridge.stopSpeaking();
      finish("failed");
    }, guardMs(text));
    window.__signageSpeechDone = (doneId, ok) => {
      if (doneId === id) finish(ok ? "spoken" : "failed");
      else previous?.(doneId, ok);
    };
    if (!bridge.speak(id, text, language)) finish("no_voice");
  });
}

// تنتهي دائمًا، حتى لو لم يبدأ الكلام أو علق المتصفح
export async function speak(rawText: string, language: SpeechLanguage = "ar"): Promise<SpeechResult> {
  const text = language === "ar" ? applyPronunciations(rawText) : rawText;
  if (window.SignageAndroid) return speakAndroid(window.SignageAndroid, text, language);
  if (!("speechSynthesis" in window)) return "no_voice";
  const voices = await loadVoices();
  const matches = voices.filter((item) => item.lang.toLowerCase().startsWith(language));
  const voice = matches.find((item) => item.localService) ?? matches[0];
  if (!voice) return "no_voice";

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95;
    let settled = false;
    const finish = (result: "spoken" | "failed") => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve(result);
    };
    const guard = setTimeout(() => {
      window.speechSynthesis.cancel();
      finish("failed");
    }, guardMs(text));
    utterance.onend = () => finish("spoken");
    utterance.onerror = () => finish("failed");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  window.SignageAndroid?.stopSpeaking();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
