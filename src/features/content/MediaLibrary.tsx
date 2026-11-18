"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { MediaThumb } from "./MediaThumb";
import { formatSize, MAX_UPLOAD_BYTES, type MediaAsset } from "./types";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function readDetails(file: File) {
  return new Promise<{ width: number | null; height: number | null; duration_ms: number | null }>((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (width: number | null, height: number | null, seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve({
        width,
        height,
        duration_ms: seconds && Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
      });
    };
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight, video.duration);
      video.onerror = () => finish(null, null, null);
      video.src = url;
    } else {
      const image = new Image();
      image.onload = () => finish(image.naturalWidth, image.naturalHeight, null);
      image.onerror = () => finish(null, null, null);
      image.src = url;
    }
  });
}

export function MediaLibrary({ orgId, assets }: { orgId: string; assets: MediaAsset[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const problems: string[] = [];

    for (const [index, file] of files.entries()) {
      setStatus(`جارٍ رفع ${index + 1} من ${files.length}`);
      const extension = EXTENSIONS[file.type];
      if (!extension) {
        problems.push(`${file.name}: النوع غير مدعوم`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        problems.push(`${file.name}: أكبر من 50MB`);
        continue;
      }
      const details = await readDetails(file);
      const path = `${orgId}/shared/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (uploadError) {
        problems.push(`${file.name}: تعذر الرفع`);
        continue;
      }
      const { error: insertError } = await supabase.from("media_assets").insert({
        org_id: orgId,
        kind: file.type.startsWith("video/") ? "video" : "image",
        name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        ...details,
      });
      if (insertError) {
        await supabase.storage.from("media").remove([path]);
        problems.push(`${file.name}: تعذر الحفظ`);
      }
    }

    setBusy(false);
    setStatus(problems.length ? problems.join("، ") : "اكتمل الرفع");
    router.refresh();
  }

  async function remove(asset: MediaAsset) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
    if (error) {
      setStatus("هذا الملف مستخدم في قائمة عرض. احذفه من القائمة أولًا.");
    } else {
      await supabase.storage.from("media").remove([asset.storage_path]);
      setStatus("حُذف الملف");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <main className="page">
      <h1>الصور والفيديو</h1>
      <label className="button-primary upload-button" aria-disabled={busy}>
        {busy ? "جارٍ العمل" : "رفع صور أو فيديو"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          multiple
          disabled={busy}
          onChange={upload}
        />
      </label>
      <p className="page-note" role="status">
        {status ?? "الأنسب للشاشة: مقاس طولي 1080×1920، وحتى 50MB للملف."}
      </p>
      {assets.length === 0 ? (
        <p className="board-empty">لا توجد ملفات بعد. ارفع أول صورة أو فيديو.</p>
      ) : (
        <ul className="media-grid">
          {assets.map((asset) => (
            <li key={asset.id}>
              <MediaThumb asset={asset} />
              <strong>{asset.name}</strong>
              <span>{formatSize(asset.size_bytes)}</span>
              <button disabled={busy} onClick={() => remove(asset)}>حذف</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
