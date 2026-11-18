import { PlaylistList } from "@/features/content/PlaylistList";
import type { NamedOption } from "@/features/content/types";
import { getAdminContext } from "@/lib/admin";

export default async function PlaylistsPage() {
  const { supabase, org } = await getAdminContext();
  const { data } = await supabase
    .from("playlists")
    .select("id, name")
    .eq("org_id", org.id)
    .is("contract_id", null)
    .order("created_at", { ascending: false });
  return <PlaylistList orgId={org.id} playlists={(data ?? []) as NamedOption[]} />;
}
