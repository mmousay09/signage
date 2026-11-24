import { PinForm } from "@/features/settings/PinForm";
import { PronunciationList, type Pronunciation } from "@/features/settings/PronunciationList";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { getAdminContext } from "@/lib/admin";

export default async function SettingsPage() {
  const { supabase, org } = await getAdminContext();
  const [{ data }, { data: words }] = await Promise.all([
    supabase.from("organizations").select("name, contact_phone, fallback_headline, screen_pin_hash").eq("id", org.id).single(),
    supabase.from("pronunciations").select("id, term, spoken").eq("org_id", org.id).order("term"),
  ]);
  return (
    <>
    <SettingsForm
      orgId={org.id}
      name={(data?.name as string | undefined) ?? org.name}
      phone={(data?.contact_phone as string | null | undefined) ?? ""}
      headline={(data?.fallback_headline as string | undefined) ?? "هذه الشاشة متاحة للإيجار"}
    />
    <div className="page settings-extra">
      <PronunciationList orgId={org.id} rows={(words ?? []) as Pronunciation[]} />
      <PinForm orgId={org.id} hasPin={Boolean(data?.screen_pin_hash)} />
    </div>
    </>
  );
}
