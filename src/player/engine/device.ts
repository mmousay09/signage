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
  // نفس نسبة الشاشة تمامًا حتى لا تتمدد النصوص، وأطول ضلع 720 نقطة
  const rootBox = root.getBoundingClientRect();
  const longest = Math.max(rootBox.width, rootBox.height) || 1;
  const w = Math.max(1, Math.round((rootBox.width / longest) * 720));
  const h = Math.max(1, Math.round((rootBox.height / longest) * 720));
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
  const area = (rect: DOMRect) => [
    (rect.left - box.left) * scaleX,
    (rect.top - box.top) * scaleY,
    rect.width * scaleX,
    rect.height * scaleY,
  ] as const;
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
  };
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*")).slice(0, 800).filter(visible);

  // الترتيب نفسه تقريبًا الذي يرسم به المتصفح: الخلفيات، ثم الصور والفيديو، ثم النصوص
  elements.forEach((element) => {
    const color = getComputedStyle(element).backgroundColor;
    if (!color || color === "transparent" || color.endsWith(", 0)")) return;
    const [x, y, ew, eh] = area(element.getBoundingClientRect());
    context.fillStyle = color;
    context.fillRect(x, y, ew, eh);
  });

  elements.forEach((element) => {
    if (!(element instanceof HTMLImageElement || element instanceof HTMLVideoElement)) return;
    const media = element;
    const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
    const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
    if (!mw || !mh) return;
    const [x, y, ew, eh] = area(media.getBoundingClientRect());
    context.save();
    context.beginPath();
    context.rect(x, y, ew, eh);
    context.clip();
    context.translate(x, y);
    try {
      if (getComputedStyle(media).objectFit === "contain") {
        const scale = Math.min(ew / mw, eh / mh);
        context.drawImage(media, (ew - mw * scale) / 2, (eh - mh * scale) / 2, mw * scale, mh * scale);
      } else {
        cover(context, media, mw, mh, ew, eh);
      }
    } catch {
      // مصدر لا يسمح بالرسم
    }
    context.restore();
  });

  // الأيقونات ورمز QR مرسومة بـ SVG: تُحوَّل إلى صور ثم تُرسم
  const svgs = elements.filter((element): element is HTMLElement & SVGSVGElement => element instanceof SVGSVGElement);
  for (const svg of svgs.slice(0, 40)) {
    const rect = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const style = getComputedStyle(svg);
    clone.style.color = style.color;
    clone.querySelectorAll("*").forEach((node) => {
      const computed = getComputedStyle(node as Element);
      (node as SVGElement).setAttribute("stroke", computed.stroke);
      (node as SVGElement).setAttribute("fill", computed.fill);
    });
    clone.setAttribute("stroke", style.stroke);
    clone.setAttribute("fill", style.fill);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const [x, y, ew, eh] = area(rect);
      context.drawImage(image, x, y, ew, eh);
    } catch {
      // أيقونة لم تُرسم لا توقف اللقطة
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  elements.forEach((element) => {
    if (element instanceof SVGElement) return;
    const own = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!own) return;
    const style = getComputedStyle(element);
    const [x, y, ew, eh] = area(element.getBoundingClientRect());
    const size = Math.max(6, parseFloat(style.fontSize) * scaleY);
    context.fillStyle = style.color;
    context.font = `${style.fontWeight} ${size}px "Readex Pro", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.direction = style.direction === "ltr" ? "ltr" : "rtl";
    // تقسيم النص على أسطر بعرض العنصر
    const lines: string[] = [];
    let line = "";
    own.split(" ").forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > ew * 1.1) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    const lineHeight = size * 1.45;
    const top = y + (eh - lineHeight * lines.length) / 2 + lineHeight / 2;
    lines.slice(0, 6).forEach((text, index) => context.fillText(text, x + ew / 2, top + index * lineHeight, ew));
  });

  return canvas.toDataURL("image/jpeg", 0.72);
}
