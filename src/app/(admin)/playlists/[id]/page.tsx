import { notFound } from "next/navigation";
import { loadMedia } from "@/features/content/loadMedia";
import { PlaylistEditor } from "@/features/content/PlaylistEditor";
import type { AssignableScreen, NamedOption, PlaylistItem } from "@/features/content/types";
import { getAdminContext } from "@/lib/admin";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const { data: playlist } = await supabase
    .from("playlists")
    .select("id, name, contract_id")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!playlist) notFound();
  const contractId = playlist.contract_id as string | null;
  const [{ data: items }, { data: screens }, assets] = await Promise.all([
    supabase.from("playlist_items").select("*").eq("playlist_id", id).order("position"),
    supabase
      .from("screens")
      .select("id, name, location, playlist_id")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("name"),
    loadMedia(supabase, org.id, contractId),
  ]);
  return (
    <PlaylistEditor
      orgId={org.id}
      playlist={playlist as NamedOption}
      contractId={contractId}
      items={(items ?? []) as PlaylistItem[]}
      assets={assets}
      screens={(screens ?? []) as AssignableScreen[]}
    />
  );
}
