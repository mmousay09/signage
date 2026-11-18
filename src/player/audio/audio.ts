export type AudioState = "ready" | "blocked" | "unknown";

let lastResult: AudioState = "unknown";
let context: AudioContext | null = null;

function chimeElement() {
  return document.getElementById("player-chime") as HTMLAudioElement | null;
}

export function getAudioState(): AudioState {
  if (lastResult !== "unknown") return lastResult;
  try {
    context ??= new AudioContext();
    return context.state === "running" ? "ready" : "blocked";
  } catch {
    return "unknown";
  }
}

export async function playChime(): Promise<AudioState> {
  const element = chimeElement();
  if (!element) return "unknown";
  try {
    element.muted = false;
    element.currentTime = 0;
    await element.play();
    lastResult = "ready";
  } catch {
    lastResult = "blocked";
  }
  return lastResult;
}

// تُستدعى عند لمس الشاشة، فاللمسة تمنح المتصفح إذن تشغيل الصوت
export async function unlockAudio(): Promise<AudioState> {
  const element = chimeElement();
  try {
    context ??= new AudioContext();
    await context.resume();
    if (element) {
      element.muted = true;
      await element.play();
      element.pause();
      element.currentTime = 0;
      element.muted = false;
    }
    lastResult = "ready";
  } catch {
    if (element) element.muted = false;
    lastResult = "blocked";
  }
  return lastResult;
}
