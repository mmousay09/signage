import {
  AnnouncementsBoard,
  type BroadcastRow,
  type DeliveryRow,
  type ScheduleRow,
} from "@/features/announcements/AnnouncementsBoard";
import { getAdminContext } from "@/lib/admin";

export default async function AnnouncementsPage() {
  const { supabase, org } = await getAdminContext();
  const [{ data: screens }, { data: schedules }, { data: announcements }, { data: broadcasts }] = await Promise.all([
    supabase.from("screens").select("id, name").eq("org_id", org.id).eq("status", "active").order("name"),
    supabase
      .from("schedules")
      .select("id, announcement_id, recurrence, run_on, local_time, weekdays, all_screens, is_enabled")
      .eq("org_id", org.id)
      .order("local_time"),
    supabase.from("announcements").select("id, title, body").eq("org_id", org.id),
    supabase
      .from("broadcasts")
      .select("id, body, play_at, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const broadcastRows = (broadcasts ?? []) as BroadcastRow[];
  const { data: deliveries } = broadcastRows.length
    ? await supabase
        .from("broadcast_deliveries")
        .select("broadcast_id, screen_id, status, drift_ms, error")
        .in("broadcast_id", broadcastRows.map((row) => row.id))
    : { data: [] };

  const scheduleRows = (schedules ?? []) as Omit<ScheduleRow, "title" | "body" | "screen_ids">[];
  const { data: targets } = scheduleRows.length
    ? await supabase
        .from("schedule_screens")
        .select("schedule_id, screen_id")
        .in("schedule_id", scheduleRows.map((row) => row.id))
    : { data: [] };

  const texts = new Map(
    ((announcements ?? []) as { id: string; title: string; body: string }[]).map((row) => [row.id, row]),
  );
  const targetRows = (targets ?? []) as { schedule_id: string; screen_id: string }[];

  return (
    <AnnouncementsBoard
      orgId={org.id}
      screens={((screens ?? []) as { id: string; name: string | null }[]).map((screen) => ({
        id: screen.id,
        name: screen.name ?? "شاشة بلا اسم",
      }))}
      schedules={scheduleRows.map((row) => ({
        ...row,
        title: texts.get(row.announcement_id)?.title ?? "",
        body: texts.get(row.announcement_id)?.body ?? "",
        screen_ids: targetRows.filter((target) => target.schedule_id === row.id).map((target) => target.screen_id),
      }))}
      broadcasts={broadcastRows}
      deliveries={(deliveries ?? []) as DeliveryRow[]}
    />
  );
}
