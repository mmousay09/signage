import { notFound } from "next/navigation";
import { ContractDetail, type ContractDetails } from "@/features/contracts/ContractDetail";
import type { AgendaRow, GuestRow, KioskConfig } from "@/features/contracts/KioskSettings";
import { getAdminContext } from "@/lib/admin";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, org_id, client_id, title, starts_at, ends_at, status, interactive, languages, logo_asset_id, registration_enabled")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();

  const [{ data: client }, { data: playlist }, { data: screens }, { data: links }, { data: images }, { data: agenda }, { data: guests }] =
    await Promise.all([
    supabase.from("clients").select("name, phone").eq("id", contract.client_id).maybeSingle(),
    supabase.from("playlists").select("id").eq("contract_id", id).order("created_at").limit(1).maybeSingle(),
    supabase.from("screens").select("id, name").eq("org_id", org.id).eq("status", "active").order("name"),
    supabase.from("contract_screens").select("screen_id").eq("contract_id", id),
    supabase
      .from("media_assets")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("kind", "image")
      .or(`contract_id.is.null,contract_id.eq.${id}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("agenda_items")
      .select("id, title, speaker, place, starts_at, ends_at, translations")
      .eq("contract_id", id)
      .order("starts_at"),
    supabase
      .from("guests")
      .select("id, badge_code, full_name, organization, job_title, phone, email, created_at, checked_in_at")
      .eq("contract_id", id)
      .order("created_at", { ascending: false }),
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
      kiosk={{
        interactive: Boolean(contract.interactive),
        registration_enabled: Boolean(contract.registration_enabled),
        languages: (contract.languages as KioskConfig["languages"] | null) ?? ["ar"],
        logo_asset_id: (contract.logo_asset_id as string | null) ?? null,
      }}
      images={(images ?? []) as { id: string; name: string }[]}
      agenda={(agenda ?? []) as AgendaRow[]}
      guests={(guests ?? []) as GuestRow[]}
    />
  );
}
