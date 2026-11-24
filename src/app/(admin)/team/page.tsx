import { TeamManager, type Invite, type Member, type Role } from "@/features/team/TeamManager";
import { getAdminContext } from "@/lib/admin";

export default async function TeamPage() {
  const { supabase, org, role } = await getAdminContext();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.rpc("list_team", { p_org: org.id }),
    supabase
      .from("team_invites")
      .select("id, role, created_at, expires_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  return (
    <TeamManager
      orgId={org.id}
      orgName={org.name}
      myRole={role as Role}
      members={(members ?? []) as Member[]}
      invites={(invites ?? []) as Invite[]}
    />
  );
}
