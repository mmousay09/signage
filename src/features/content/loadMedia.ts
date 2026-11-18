import type { createClient } from "@/lib/supabase/server";
import type { MediaAsset } from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function loadMedia(supabase: ServerClient, orgId: string): Promise<MediaAsset[]> {
  const { data } = await supabase
    .from("media_assets")
    .select("id, org_id, kind, name, storage_path, mime_type, size_bytes, duration_ms")
    .eq("org_id", orgId)
    .is("contract_id", null)
    .in("kind", ["image", "video"])
    .order("created_at", { ascending: false });
  const assets = (data ?? []) as Omit<MediaAsset, "url">[];
  if (assets.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from("media")
    .createSignedUrls(assets.map((asset) => asset.storage_path), 3600);
  const urls = new Map<string, string>();
  (signed ?? []).forEach((item: { path: string | null; signedUrl: string }) => {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  });
  return assets.map((asset) => ({ ...asset, url: urls.get(asset.storage_path) ?? null }));
}
