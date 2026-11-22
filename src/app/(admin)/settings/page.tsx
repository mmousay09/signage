import { SettingsForm } from "@/features/settings/SettingsForm";
import { getAdminContext } from "@/lib/admin";

export default async function SettingsPage() {
  const { supabase, org } = await getAdminContext();
  const { data } = await supabase
    .from("organizations")
    .select("name, contact_phone, fallback_headline")
    .eq("id", org.id)
    .single();
  return (
    <SettingsForm
      orgId={org.id}
      name={(data?.name as string | undefined) ?? org.name}
      phone={(data?.contact_phone as string | null | undefined) ?? ""}
      headline={(data?.fallback_headline as string | undefined) ?? "هذه الشاشة متاحة للإيجار"}
    />
  );
}
