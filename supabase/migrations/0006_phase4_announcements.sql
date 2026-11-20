-- المرحلة 4: إعلانات مجدولة تعمل دون إنترنت، ونداء عاجل متزامن مع تقرير لكل شاشة
begin;

-- إعلانات الشركة نفسها لا تحتاج عقدًا
alter table public.schedules alter column contract_id drop not null;

drop policy if exists screen_read on public.schedules;
create policy screen_read on public.schedules for select to authenticated
  using ((contract_id is null and org_id = public.current_screen_org()) or public.screen_has_contract(contract_id));

-- الإعلانات المجدولة التي تخص الشاشة، وتصل إليها مسبقًا مع البيان
create function public.screen_schedules_json(p_screen uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sc.id,
           'recurrence', sc.recurrence,
           'run_on', sc.run_on,
           'local_time', to_char(sc.local_time, 'HH24:MI:SS'),
           'weekdays', to_jsonb(sc.weekdays),
           'timezone', sc.timezone,
           'starts_at', c.starts_at,
           'ends_at', c.ends_at,
           'title', a.title,
           'body', a.body)
         order by sc.local_time, sc.id), '[]'::jsonb)
  from public.schedules sc
  join public.announcements a on a.id = sc.announcement_id
  join public.screens s on s.id = p_screen and s.org_id = sc.org_id
  left join public.contracts c on c.id = sc.contract_id
  where sc.is_enabled
    and (sc.recurrence <> 'once' or sc.run_on >= (now() at time zone sc.timezone)::date - 1)
    and (sc.contract_id is null
         or (c.status = 'confirmed' and c.ends_at > now()
             and exists (select 1 from public.contract_screens cs
                         where cs.contract_id = c.id and cs.screen_id = s.id)))
    and (sc.all_screens or exists (select 1 from public.schedule_screens ss
                                   where ss.schedule_id = sc.id and ss.screen_id = s.id));
$$;

create or replace function public.get_player_manifest() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.screens;
  o public.organizations;
  v_idle_playlist uuid;
  v_idle jsonb;
  v_contracts jsonb;
  v_current jsonb;
  v_stable jsonb;
begin
  select * into s from public.screens where auth_user_id = auth.uid() and status = 'active';
  if not found then return jsonb_build_object('version', null); end if;
  select * into o from public.organizations where id = s.org_id;

  v_idle_playlist := coalesce(s.playlist_id, o.fallback_playlist_id);
  if v_idle_playlist is not null then
    v_idle := public.program_json(v_idle_playlist, coalesce(s.layout_id, o.fallback_layout_id));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'title', c.title, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
           'program', public.program_json(cs.playlist_id, coalesce(cs.layout_id, s.layout_id)))
           order by c.starts_at), '[]'::jsonb)
    into v_contracts
  from public.contract_screens cs
  join public.contracts c on c.id = cs.contract_id
  where cs.screen_id = s.id and cs.is_blocking and upper(cs.period) > now();

  select e -> 'program' into v_current
  from jsonb_array_elements(v_contracts) e
  where (e ->> 'starts_at')::timestamptz <= now() and (e ->> 'ends_at')::timestamptz > now()
  limit 1;

  v_stable := jsonb_build_object(
    'organization', o.name,
    'contact_phone', o.contact_phone,
    'fallback_headline', o.fallback_headline,
    'idle', v_idle,
    'contracts', v_contracts,
    'schedules', public.screen_schedules_json(s.id));

  return v_stable || jsonb_build_object(
    'version', md5(v_stable::text),
    'program', coalesce(v_current, v_idle,
      jsonb_build_object('layout', jsonb_build_object('position', 'none', 'percent', 0), 'items', '[]'::jsonb)));
end $$;

-- يرسل أمر تحديث المحتوى لكل شاشات الشركة العاملة
create function public.request_org_resync(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.is_org_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.screen_commands (org_id, screen_id, command)
  select s.org_id, s.id, 'resync' from public.screens s where s.org_id = p_org and s.status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- النداءات التي لم تصل للشاشة وهي غير متصلة: تُعرض إن كانت حديثة، وإلا تُسجَّل فائتة
create function public.pending_broadcasts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'body', b.body, 'play_at', b.play_at) order by b.play_at), '[]'::jsonb)
  from public.broadcast_deliveries d
  join public.broadcasts b on b.id = d.broadcast_id
  where d.screen_id = public.current_screen_id()
    and d.status in ('pending', 'received') and b.status = 'sent'
    and b.play_at > now() - interval '1 hour';
$$;

-- النداء بعد إرساله يُرسل لحظة التشغيل الموحدة للشاشات المحددة
create function public.send_urgent_broadcast(p_org uuid, p_body text, p_screen_ids uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_created jsonb; v_play_at timestamptz;
begin
  if not public.is_org_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'body_required'; end if;
  v_created := public.create_broadcast(p_org, btrim(p_body), null,
    coalesce(p_screen_ids, (select array_agg(id) from public.screens where org_id = p_org and status = 'active')));
  v_play_at := public.dispatch_broadcast((v_created ->> 'id')::uuid, null, 4000);
  return v_created || jsonb_build_object('play_at', v_play_at);
end $$;

revoke all on function public.screen_schedules_json(uuid), public.request_org_resync(uuid),
  public.pending_broadcasts(), public.send_urgent_broadcast(uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.request_org_resync(uuid), public.pending_broadcasts(),
  public.send_urgent_broadcast(uuid, text, uuid[])
  to authenticated;

commit;
