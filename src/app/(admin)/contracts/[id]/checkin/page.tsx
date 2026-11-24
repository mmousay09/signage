import { notFound } from "next/navigation";
import { CheckInDesk } from "@/features/contracts/CheckInDesk";
import { getAdminContext } from "@/lib/admin";

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, title")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();
  const [{ count: total }, { count: attended }] = await Promise.all([
    supabase.from("guests").select("id", { count: "exact", head: true }).eq("contract_id", id),
    supabase.from("guests").select("id", { count: "exact", head: true }).eq("contract_id", id).not("checked_in_at", "is", null),
  ]);
  return (
    <CheckInDesk
      contractId={id}
      title={contract.title as string}
      total={total ?? 0}
      attended={attended ?? 0}
    />
  );
}
