import { notFound } from "next/navigation";
import type { NamedOption } from "@/features/content/types";
import { RemoteControl, type RemoteSettings } from "@/features/screens/RemoteControl";
import { ScreenEditor } from "@/features/screens/ScreenEditor";
import type { ScreenRow } from "@/features/screens/types";
import { getAdminContext } from "@/lib/admin";

export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getAdminContext();
  const [{ data }, { data: playlists }, { data: layouts }, { data: settings }, { data: snapshot }] = await Promise.all([
    supabase.from("v_screen_status").select("*").eq("org_id", org.id).eq("id", id).maybeSingle(),
    supabase.from("playlists").select("id, name").eq("org_id", org.id).is("contract_id", null).order("name"),
    supabase.from("layouts").select("id, name").eq("org_id", org.id).order("created_at"),
    supabase.from("screens").select("rotation, volume, alert_offline").eq("id", id).maybeSingle(),
    supabase.from("screen_snapshots").select("image, taken_at").eq("screen_id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const screen = data as ScreenRow;
  const online = Boolean(screen.last_seen_at && Date.now() - Date.parse(screen.last_seen_at) < 90_000);
  return (
    <>
      <ScreenEditor
        screen={screen}
        playlists={(playlists ?? []) as NamedOption[]}
        layouts={(layouts ?? []) as NamedOption[]}
      />
      {screen.status === "active" && (
        <div className="page remote-page">
          <RemoteControl
            screenId={id}
            orgId={org.id}
            online={online}
            nowPlaying={screen.player_state?.now ?? null}
            settings={(settings as RemoteSettings | null) ?? { rotation: 0, volume: 100, alert_offline: false }}
            snapshot={(snapshot as { image: string; taken_at: string } | null) ?? null}
          />
        </div>
      )}
    </>
  );
}
