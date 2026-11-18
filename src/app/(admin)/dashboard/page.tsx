import { ScreenBoard } from "@/features/screens/ScreenBoard";
import type { ScreenRow } from "@/features/screens/types";
import { getAdminContext } from "@/lib/admin";

export default async function DashboardPage() {
  const { supabase, org } = await getAdminContext();
  const { data } = await supabase
    .from("v_screen_status")
    .select("*")
    .eq("org_id", org.id)
    .order("name");
  return <ScreenBoard orgId={org.id} initialScreens={(data ?? []) as ScreenRow[]} />;
}
