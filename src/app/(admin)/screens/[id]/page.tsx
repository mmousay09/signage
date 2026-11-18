import { notFound } from "next/navigation";
import type { NamedOption } from "@/features/content/types";
import { ScreenEditor } from "@/features/screens/ScreenEditor";
import type { ScreenRow } from "@/features/screens/types";
import { getAdminContext } from "@/lib/admin";

export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const [{ data }, { data: playlists }, { data: layouts }] = await Promise.all([
    supabase.from("v_screen_status").select("*").eq("org_id", org.id).eq("id", id).maybeSingle(),
    supabase.from("playlists").select("id, name").eq("org_id", org.id).is("contract_id", null).order("name"),
    supabase.from("layouts").select("id, name").eq("org_id", org.id).order("created_at"),
  ]);
  if (!data) notFound();
  return (
    <ScreenEditor
      screen={data as ScreenRow}
      playlists={(playlists ?? []) as NamedOption[]}
      layouts={(layouts ?? []) as NamedOption[]}
    />
  );
}
