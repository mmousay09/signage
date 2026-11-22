import { ExpiringContracts, type ExpiringRow } from "@/features/contracts/ExpiringContracts";
import { ScreenBoard } from "@/features/screens/ScreenBoard";
import type { ScreenRow } from "@/features/screens/types";
import { getAdminContext } from "@/lib/admin";

export default async function DashboardPage() {
  const { supabase, org } = await getAdminContext();
  const now = new Date();
  const [{ data }, { data: expiring }] = await Promise.all([
    supabase.from("v_screen_status").select("*").eq("org_id", org.id).order("name"),
    supabase
      .from("contracts")
      .select("id, title, ends_at, clients(name, phone)")
      .eq("org_id", org.id)
      .eq("status", "confirmed")
      .gt("ends_at", now.toISOString())
      .lte("ends_at", new Date(now.getTime() + 3 * 86_400_000).toISOString())
      .order("ends_at"),
  ]);
  const rows: ExpiringRow[] = ((expiring ?? []) as unknown as {
    id: string;
    title: string;
    ends_at: string;
    clients: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
  }[]).map((row) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    return { id: row.id, title: row.title, ends_at: row.ends_at, client_name: client?.name ?? null, client_phone: client?.phone ?? null };
  });
  return (
    <>
      <ExpiringContracts rows={rows} organization={org.name} />
      <ScreenBoard orgId={org.id} initialScreens={(data ?? []) as ScreenRow[]} />
    </>
  );
}
