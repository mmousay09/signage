import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getAdminContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login");

  const { data: member } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/setup");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", member.org_id)
    .single();
  if (!org) redirect("/setup");

  return { supabase, user, org: org as { id: string; name: string }, role: member.role as string };
});
