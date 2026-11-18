"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getAssetUrl, type PlayerManifest } from "@/player/offline/store";

const VIDEO_GRACE_MS = 15_000;
const VIDEO_FALLBACK_MS = 5 * 60_000;
const DEFAULT_ITEM_MS = 8_000;

export function ContentStage({ manifest }: { manifest: PlayerManifest }) {
  const latest = useRef(manifest);
  const [playback, setPlayback] = useState({ manifest, index: 0, tick: 0 });
  const [media, setMedia] = useState<{ itemId: string; url: string | null } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // النسخة الجديدة تبدأ عند نهاية العنصر الحالي، لا في منتصفه
  const advance = () =>
    setPlayback((current) => {
      const next = latest.current;
      if (next.version !== current.manifest.version) return { manifest: next, index: 0, tick: current.tick + 1 };
      const count = current.manifest.program.items.length;
      return { ...current, index: (current.index + 1) % count, tick: current.tick + 1 };
    });
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const { items, layout } = playback.manifest.program;
  const item = items[playback.index % items.length];

  useEffect(() => {
    latest.current = manifest;
    if (playback.manifest.program.items.length === 0) advanceRef.current();
  }, [manifest, playback.manifest.program.items.length]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!item?.asset) {
      setMedia(null);
      return;
    }
    void getAssetUrl(item.asset.id).then((url) => {
      objectUrl = url;
      if (active) setMedia({ itemId: item.id, url });
      else if (url) URL.revokeObjectURL(url);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item?.id, item?.asset]);

  const ready = !item?.asset || media?.itemId === item.id;
  const missing = Boolean(item?.asset && ready && !media?.url);

  useEffect(() => {
    if (!item || !ready) return;
    const duration = missing
      ? 1_000
      : item.kind === "video"
        ? (item.asset?.duration_ms ?? VIDEO_FALLBACK_MS) + VIDEO_GRACE_MS
        : (item.duration_ms ?? DEFAULT_ITEM_MS);
    const timer = setTimeout(() => advanceRef.current(), duration);
    return () => clearTimeout(timer);
  }, [item, ready, missing, playback.tick]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || item?.kind !== "video" || !media?.url) return;
    video.currentTime = 0;
    video.muted = false;
    video.play().catch(() => {
      // إذا منع المتصفح الصوت يستمر الفيديو دون صوت
      video.muted = true;
      video.play().catch(() => advanceRef.current());
    });
  }, [item?.kind, media?.url, playback.tick]);

  return (
    <div
      className="stage"
      data-avatar={layout.position}
      style={{ "--avatar-size": `${layout.percent}%` } as CSSProperties}
    >
      {layout.position !== "none" && (
        <aside className="avatar-zone">
          <span>{playback.manifest.organization}</span>
        </aside>
      )}
      <section className="content-zone">
        {item?.kind === "text" && (
          <div className="text-slide" key={`${item.id}-${playback.tick}`}>
            <p>{item.body}</p>
          </div>
        )}
        {item?.kind === "image" && media?.url && media.itemId === item.id && (
          // الصورة محفوظة محليًا كملف، فلا يفيدها محسّن الصور
          // eslint-disable-next-line @next/next/no-img-element
          <img className="media-slide" key={item.id} src={media.url} alt="" />
        )}
        {item?.kind === "video" && media?.url && media.itemId === item.id && (
          <video
            ref={videoRef}
            className="media-slide"
            key={item.id}
            src={media.url}
            playsInline
            preload="auto"
            onEnded={() => advanceRef.current()}
            onError={() => advanceRef.current()}
          />
        )}
      </section>
    </div>
  );
}
