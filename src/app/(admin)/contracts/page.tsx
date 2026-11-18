import { ContractList, type ContractSummary } from "@/features/contracts/ContractList";
import { getAdminContext } from "@/lib/admin";

export default async function ContractsPage() {
  const { supabase, org } = await getAdminContext();
  const [{ data: contracts }, { data: clients }] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, client_id, title, starts_at, ends_at, status")
      .eq("org_id", org.id)
      .order("starts_at", { ascending: false }),
    supabase.from("clients").select("id, name").eq("org_id", org.id).order("name"),
  ]);
  const clientRows = (clients ?? []) as { id: string; name: string }[];
  const names = new Map(clientRows.map((client) => [client.id, client.name]));
  const rows = ((contracts ?? []) as (Omit<ContractSummary, "client_name"> & { client_id: string })[]).map(
    (contract) => ({ ...contract, client_name: names.get(contract.client_id) ?? "" }),
  );
  return <ContractList orgId={org.id} contracts={rows} clients={clientRows} />;
}
