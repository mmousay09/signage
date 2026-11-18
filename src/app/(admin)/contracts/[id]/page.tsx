import { notFound } from "next/navigation";
import { ContractDetail, type ContractDetails } from "@/features/contracts/ContractDetail";
import { getAdminContext } from "@/lib/admin";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, org_id, client_id, title, starts_at, ends_at, status")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();

  const [{ data: client }, { data: playlist }, { data: screens }, { data: links }] = await Promise.all([
    supabase.from("clients").select("name, phone").eq("id", contract.client_id).maybeSingle(),
    supabase.from("playlists").select("id").eq("contract_id", id).order("created_at").limit(1).maybeSingle(),
    supabase.from("screens").select("id, name").eq("org_id", org.id).eq("status", "active").order("name"),
    supabase.from("contract_screens").select("screen_id").eq("contract_id", id),
  ]);

  return (
    <ContractDetail
      contract={{
        ...(contract as Omit<ContractDetails, "client_name" | "client_phone">),
        client_name: (client?.name as string | undefined) ?? "",
        client_phone: (client?.phone as string | null | undefined) ?? null,
      }}
      playlistId={(playlist?.id as string | undefined) ?? null}
      screens={(screens ?? []) as { id: string; name: string | null }[]}
      assigned={((links ?? []) as { screen_id: string }[]).map((link) => link.screen_id)}
    />
  );
}
