// تحكم عن بعد في الشاشة: مستوى الصوت، ما يُعرض الآن، ولقطة من الشاشة.

let volume = 100;
let nowPlaying: { kind: string; label: string } | null = null;

interface DeviceBridge {
  setVolume?(level: number): void;
  setPinHash?(hash: string): void;
  captureScreen?(): string;
}

const bridge = () => (window as unknown as { SignageAndroid?: DeviceBridge }).SignageAndroid;

export function setVolume(level: number | undefined) {
  volume = Math.min(100, Math.max(0, Math.round(level ?? 100)));
  document.querySelectorAll("video").forEach((video) => {
    video.volume = volume / 100;
  });
  bridge()?.setVolume?.(volume);
}

export const getVolume = () => volume;

export function setPinHash(hash: string | null | undefined) {
  bridge()?.setPinHash?.(hash ?? "");
}

export function setNowPlaying(value: { kind: string; label: string } | null) {
  nowPlaying = value;
}

export const getNowPlaying = () => nowPlaying;

function cover(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, w: number, h: number) {
  const scale = Math.max(w / width, h / height);
  const dw = width * scale;
  const dh = height * scale;
  context.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** لقطة مما يظهر الآن: من تطبيق أندرويد إن وُجد، وإلا تُرسم من عناصر الصفحة */
export async function captureSnapshot(): Promise<string | null> {
  const native = bridge()?.captureScreen?.();
  if (native && native.startsWith("data:image/jpeg;base64,")) return native;

  const root = document.querySelector<HTMLElement>(".player");
  if (!root) return null;
  const portrait = root.clientHeight >= root.clientWidth;
  const w = portrait ? 405 : 720;
  const h = portrait ? 720 : 405;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const style = getComputedStyle(root);
  context.fillStyle = style.backgroundColor || "#0e2a5c";
  context.fillRect(0, 0, w, h);

  const box = root.getBoundingClientRect();
  const scaleX = w / box.width;
  const scaleY = h / box.height;
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  };

  // الصور والفيديو بمواقعها، ثم النصوص الظاهرة
  root.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video").forEach((media) => {
    if (!visible(media)) return;
    const rect = media.getBoundingClientRect();
    const x = (rect.left - box.left) * scaleX;
    const y = (rect.top - box.top) * scaleY;
    const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
    const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
    if (!mw || !mh) return;
    context.save();
    context.beginPath();
    context.rect(x, y, rect.width * scaleX, rect.height * scaleY);
    context.clip();
    context.translate(x, y);
    try {
      cover(context, media, mw, mh, rect.width * scaleX, rect.height * scaleY);
    } catch {
      // مصدر لا يسمح بالرسم
    }
    context.restore();
  });

  root.querySelectorAll<HTMLElement>("h1, p, strong").forEach((element) => {
    if (!visible(element) || !element.innerText.trim()) return;
    const rect = element.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(element).fontSize) * scaleY;
    context.fillStyle = getComputedStyle(element).color;
    context.font = `600 ${size}px "Readex Pro", sans-serif`;
    context.textAlign = "center";
    context.direction = "rtl";
    context.fillText(
      element.innerText.trim().slice(0, 60),
      (rect.left - box.left + rect.width / 2) * scaleX,
      (rect.top - box.top + rect.height / 2) * scaleY + size / 3,
      rect.width * scaleX,
    );
  });

  return canvas.toDataURL("image/jpeg", 0.72);
}
