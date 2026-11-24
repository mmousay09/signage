"use client";

import { useEffect, useRef, useState } from "react";

const SCAN_INTERVAL_MS = 150;
const MAX_FRAME_WIDTH = 720;

export interface ScannerLabels {
  prompt: string;
  denied: string;
  failed: string;
  close: string;
}

const DEFAULT_LABELS: ScannerLabels = {
  prompt: "وجّه الكاميرا إلى رمز QR على الشاشة",
  denied: "اسمح للمتصفح باستخدام الكاميرا، ثم حاول مرة أخرى.",
  failed: "تعذر تشغيل الكاميرا. أدخل الرمز يدويًا.",
  close: "إغلاق",
};

export function QrScanner({
  onResult,
  onClose,
  facing = "environment",
  labels = DEFAULT_LABELS,
  className = "scanner",
  onError,
}: {
  onResult: (text: string) => void;
  onClose?: () => void;
  /** الخلفية للهاتف، والأمامية لشاشة يقف أمامها الزائر */
  facing?: "environment" | "user";
  labels?: ScannerLabels;
  className?: string;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  const errorRef = useRef(onError);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resultRef.current = onResult;
    errorRef.current = onError;
  }, [onResult, onError]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const { default: jsQR } = await import("jsqr");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing } },
        });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const scan = () => {
          if (stopped || !context) return;
          if (video.videoWidth > 0) {
            const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(image.data, image.width, image.height, {
              inversionAttempts: "dontInvert",
            });
            if (found?.data) {
              resultRef.current(found.data);
              return;
            }
          }
          timer = setTimeout(scan, SCAN_INTERVAL_MS);
        };
        scan();
      } catch (cause) {
        if (stopped) return;
        setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? labels.denied : labels.failed);
        errorRef.current?.();
      }
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // الكاميرا تُشغَّل مرة واحدة لكل ظهور للماسح
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className} role={onClose ? "dialog" : undefined} aria-label={labels.prompt}>
      <video ref={videoRef} muted playsInline data-mirrored={facing === "user"} />
      <div className="scanner-frame" aria-hidden="true" />
      <div className="scanner-bar">
        <p role="status">{error ?? labels.prompt}</p>
        {onClose && <button onClick={onClose}>{labels.close}</button>}
      </div>
    </div>
  );
}
