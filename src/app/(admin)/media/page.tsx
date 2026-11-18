import { loadMedia } from "@/features/content/loadMedia";
import { MediaLibrary } from "@/features/content/MediaLibrary";
import { getAdminContext } from "@/lib/admin";

export default async function MediaPage() {
  const { supabase, org } = await getAdminContext();
  return <MediaLibrary orgId={org.id} assets={await loadMedia(supabase, org.id)} />;
}
