"use client";

import { useEffect, useState } from "react";

const QUIET_ZONE = 4;

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [matrix, setMatrix] = useState<{ size: number; path: string } | null>(null);

  useEffect(() => {
    let active = true;
    void import("qrcode")
      .then(({ create }) => {
        const { size, data } = create(value, { errorCorrectionLevel: "M" }).modules;
        let path = "";
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
          }
        }
        if (active) setMatrix({ size, path });
      })
      .catch(() => undefined); // قد لا تتوفر المكتبة دون إنترنت، وتبقى الأرقام والمحتوى
    return () => {
      active = false;
    };
  }, [value]);

  if (!matrix) return <div className={className} aria-hidden="true" />;
  const full = matrix.size + QUIET_ZONE * 2;

  return (
    <svg
      className={className}
      role="img"
      aria-label={label}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${full} ${full}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={full} height={full} fill="#fff" />
      <path d={matrix.path} fill="#0e2a5c" />
    </svg>
  );
}
