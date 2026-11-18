import type { MediaAsset } from "./types";

export function MediaThumb({ asset }: { asset: MediaAsset }) {
  if (!asset.url) return <div className="thumb" />;
  return asset.kind === "video" ? (
    <video className="thumb" src={`${asset.url}#t=0.1`} preload="metadata" muted playsInline />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="thumb" src={asset.url} alt="" loading="lazy" />
  );
}
