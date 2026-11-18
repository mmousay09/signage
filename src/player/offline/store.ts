import type { SupabaseClient } from "@supabase/supabase-js";

export interface ManifestAsset {
  id: string;
  path: string;
  mime: string;
  size: number;
  duration_ms: number | null;
}

export interface ManifestItem {
  id: string;
  kind: "image" | "video" | "text" | "agenda";
  body: string | null;
  duration_ms: number | null;
  asset: ManifestAsset | null;
}

export interface ManifestProgram {
  layout: { position: "top" | "bottom" | "none"; percent: number };
  items: ManifestItem[];
}

export interface ManifestContract {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  program: ManifestProgram;
}

export interface PlayerManifest {
  version: string;
  organization: string;
  contact_phone?: string | null;
  fallback_headline?: string;
  idle?: ManifestProgram | null;
  contracts?: ManifestContract[];
  program: ManifestProgram;
}

const MEDIA_CACHE = "signage-media-v1";
const MANIFEST_KEY = "/__signage/manifest";
const assetKey = (id: string) => `/__signage/asset/${id}`;

export async function loadActiveManifest(): Promise<PlayerManifest | null> {
  const cache = await caches.open(MEDIA_CACHE);
  const response = await cache.match(MANIFEST_KEY);
  return response ? ((await response.json()) as PlayerManifest) : null;
}

export async function getAssetUrl(id: string): Promise<string | null> {
  const cache = await caches.open(MEDIA_CACHE);
  const response = await cache.match(assetKey(id));
  return response ? URL.createObjectURL(await response.blob()) : null;
}

export async function clearStoredContent() {
  await caches.delete(MEDIA_CACHE);
}

// يُنزَّل كل شيء أولًا، ثم يصبح البيان نشطًا مرة واحدة، فلا تعرض الشاشة نسخة ناقصة
export async function installManifest(
  supabase: SupabaseClient,
  manifest: PlayerManifest,
  onProgress: (ready: number, total: number) => void,
) {
  const cache = await caches.open(MEDIA_CACHE);
  const assets = new Map<string, ManifestAsset>();
  [manifest.program, manifest.idle, ...(manifest.contracts ?? []).map((contract) => contract.program)].forEach(
    (program) =>
      program?.items.forEach((item) => {
        if (item.asset) assets.set(item.asset.id, item.asset);
      }),
  );

  let ready = 0;
  onProgress(ready, assets.size);
  for (const asset of assets.values()) {
    if (!(await cache.match(assetKey(asset.id)))) {
      const { data, error } = await supabase.storage.from("media").download(asset.path);
      if (error || !data) throw error ?? new Error("download_failed");
      if (data.size !== asset.size) throw new Error("size_mismatch");
      await cache.put(
        assetKey(asset.id),
        new Response(data, { headers: { "Content-Type": asset.mime, "Content-Length": String(asset.size) } }),
      );
    }
    ready += 1;
    onProgress(ready, assets.size);
  }

  await cache.put(
    MANIFEST_KEY,
    new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } }),
  );

  const keep = new Set([...assets.keys()].map((id) => new URL(assetKey(id), self.location.origin).href));
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((request) => new URL(request.url).pathname.startsWith("/__signage/asset/") && !keep.has(request.url))
      .map((request) => cache.delete(request)),
  );
}

export async function getStorageStats() {
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { used: Math.round(usage), free: Math.max(0, Math.round(quota - usage)) };
  } catch {
    return { used: null, free: null };
  }
}

export async function registerPlayerWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    void navigator.storage?.persist?.();
    await navigator.serviceWorker.register("/sw.js", { scope: "/play" });
    const registration = await navigator.serviceWorker.ready;
    const send = () => {
      const urls = new Set<string>();
      performance.getEntriesByType("resource").forEach((entry) => urls.add(entry.name));
      document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((script) => urls.add(script.src));
      document
        .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]')
        .forEach((link) => urls.add(link.href));
      registration.active?.postMessage({
        type: "cache-urls",
        urls: [...urls].filter((url) => {
          const parsed = new URL(url);
          return parsed.origin === window.location.origin && parsed.pathname.startsWith("/_next/static/");
        }),
      });
    };
    // تُعاد المحاولة لأن بعض ملفات الصفحة تكتمل بعد تسجيل العامل
    send();
    window.setTimeout(send, 3_000);
    window.setTimeout(send, 20_000);
  } catch {
    // العرض يستمر حتى لو تعذر تسجيل التخزين
  }
}
