import { notFound } from "next/navigation";
import { loadMedia } from "@/features/content/loadMedia";
import { PlaylistEditor } from "@/features/content/PlaylistEditor";
import type { NamedOption, PlaylistItem } from "@/features/content/types";
import { getAdminContext } from "@/lib/admin";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const [{ data: playlist }, { data: items }, assets] = await Promise.all([
    supabase.from("playlists").select("id, name").eq("org_id", org.id).eq("id", id).maybeSingle(),
    supabase.from("playlist_items").select("*").eq("playlist_id", id).order("position"),
    loadMedia(supabase, org.id),
  ]);
  if (!playlist) notFound();
  return (
    <PlaylistEditor
      orgId={org.id}
      playlist={playlist as NamedOption}
      items={(items ?? []) as PlaylistItem[]}
      assets={assets}
    />
  );
}
