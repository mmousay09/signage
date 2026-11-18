"use client";

import { useEffect, useRef, useState } from "react";

const SCAN_INTERVAL_MS = 150;
const MAX_FRAME_WIDTH = 720;

export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const { default: jsQR } = await import("jsqr");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
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
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "اسمح للمتصفح باستخدام الكاميرا، ثم حاول مرة أخرى."
            : "تعذر تشغيل الكاميرا. أدخل الرمز يدويًا.",
        );
      }
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="scanner" role="dialog" aria-label="مسح رمز QR">
      <video ref={videoRef} muted playsInline />
      <div className="scanner-frame" aria-hidden="true" />
      <div className="scanner-bar">
        <p role="status">{error ?? "وجّه الكاميرا إلى رمز QR على الشاشة"}</p>
        <button onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}
