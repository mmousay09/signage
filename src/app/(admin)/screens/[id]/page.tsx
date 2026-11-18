import { notFound } from "next/navigation";
import { ScreenEditor } from "@/features/screens/ScreenEditor";
import type { ScreenRow } from "@/features/screens/types";
import { getAdminContext } from "@/lib/admin";

export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const { data } = await supabase
    .from("v_screen_status")
    .select("*")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  return <ScreenEditor screen={data as ScreenRow} />;
}
