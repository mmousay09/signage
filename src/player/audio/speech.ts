// صوت المتصفح للتجربة؛ في المرحلة 5 يحل محله صوت ElevenLabs المحفوظ
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

export async function hasArabicVoice() {
  return (await loadVoices()).some((voice) => voice.lang.toLowerCase().startsWith("ar"));
}

// تنتهي دائمًا، حتى لو لم يبدأ الكلام أو علق المتصفح
export async function speak(text: string): Promise<"spoken" | "no_voice" | "failed"> {
  if (!("speechSynthesis" in window)) return "no_voice";
  const voices = await loadVoices();
  const voice =
    voices.find((item) => item.lang.toLowerCase().startsWith("ar") && item.localService) ??
    voices.find((item) => item.lang.toLowerCase().startsWith("ar"));
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
    }, Math.max(10_000, text.length * 180));
    utterance.onend = () => finish("spoken");
    utterance.onerror = () => finish("failed");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}
