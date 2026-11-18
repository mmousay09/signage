-- المرحلة 2: برنامج عرض لكل شاشة، وبيان محتوى يعمل منه المشغّل دون إنترنت
begin;

alter table public.screens
  add column playlist_id uuid,
  add column layout_id uuid,
  add constraint screens_playlist_fk
    foreign key (org_id, playlist_id) references public.playlists(org_id, id) on delete set null (playlist_id),
  add constraint screens_layout_fk
    foreign key (org_id, layout_id) references public.layouts(org_id, id) on delete set null (layout_id);

grant update (playlist_id, layout_id) on public.screens to authenticated;

create or replace view public.v_screen_status with (security_invoker = true) as
select s.id, s.org_id, s.name, s.location, s.status, s.last_seen_at, s.app_version,
       s.cached_bytes, s.free_bytes,
       coalesce(s.last_seen_at > now() - interval '90 seconds', false) as is_online,
       c.id as contract_id, c.title as contract_title, c.ends_at as contract_ends_at,
       cl.name as client_name,
       s.player_state,
       s.playlist_id,
       s.layout_id
from public.screens s
left join public.contract_screens cs on cs.screen_id = s.id and cs.is_blocking and now() <@ cs.period
left join public.contracts c on c.id = cs.contract_id
left join public.clients cl on cl.id = c.client_id;

-- تقسيمات جاهزة لكل شركة
create function public.seed_default_layouts(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.layouts (org_id, name, avatar_position, avatar_percent)
  select p_org, v.name, v.position::public.avatar_position, v.percent
  from (values
    ('المحتوى بملء الشاشة', 'none', 0),
    ('المحاكي أعلى الشاشة 40%', 'top', 40),
    ('المحاكي أعلى الشاشة 30%', 'top', 30),
    ('المحاكي أسفل الشاشة 40%', 'bottom', 40)
  ) as v(name, position, percent)
  where not exists (select 1 from public.layouts l where l.org_id = p_org);
$$;

create function public.seed_layouts_for_new_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_layouts(new.id);
  return null;
end $$;

create trigger seed_layouts_for_new_org after insert on public.organizations
  for each row execute function public.seed_layouts_for_new_org();

select public.seed_default_layouts(id) from public.organizations;

-- ما يجب أن تعرضه الشاشة الآن. يتغير version فقط عند تغير المحتوى.
create function public.get_player_manifest() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.screens;
  o public.organizations;
  v_playlist uuid;
  v_layout uuid;
  v_program jsonb;
begin
  select * into s from public.screens where auth_user_id = auth.uid() and status = 'active';
  if not found then return jsonb_build_object('version', null); end if;
  select * into o from public.organizations where id = s.org_id;

  v_playlist := coalesce(s.playlist_id, o.fallback_playlist_id);
  v_layout := coalesce(s.layout_id, o.fallback_layout_id);

  select jsonb_build_object(
    'layout', coalesce(
      (select jsonb_build_object('position', l.avatar_position, 'percent', l.avatar_percent)
       from public.layouts l where l.id = v_layout),
      jsonb_build_object('position', 'none', 'percent', 0)),
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'body', i.body, 'duration_ms', i.duration_ms,
        'asset', case when a.id is null then null else jsonb_build_object(
          'id', a.id, 'path', a.storage_path, 'mime', a.mime_type,
          'size', a.size_bytes, 'duration_ms', a.duration_ms) end)
      order by i.position) filter (where i.id is not null), '[]'::jsonb))
  into v_program
  from (select 1) one
  left join public.playlist_items i on i.playlist_id = v_playlist and i.is_enabled
  left join public.media_assets a on a.id = i.asset_id;

  return jsonb_build_object(
    'version', md5(v_program::text || coalesce(o.name, '')),
    'organization', o.name,
    'program', v_program);
end $$;

create function public.reorder_playlist(p_playlist uuid, p_items uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.playlists where id = p_playlist;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.playlist_items i
     set position = o.ordinality
    from unnest(p_items) with ordinality as o(id, ordinality)
   where i.id = o.id and i.playlist_id = p_playlist;
end $$;

create function public.request_playlist_resync(p_playlist uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_fallback uuid; v_count integer;
begin
  select p.org_id, o.fallback_playlist_id into v_org, v_fallback
  from public.playlists p join public.organizations o on o.id = p.org_id
  where p.id = p_playlist;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.screen_commands (org_id, screen_id, command)
  select s.org_id, s.id, 'resync' from public.screens s
  where s.org_id = v_org and s.status = 'active'
    and (s.playlist_id = p_playlist or (s.playlist_id is null and v_fallback = p_playlist));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.seed_default_layouts(uuid), public.seed_layouts_for_new_org(),
  public.get_player_manifest(), public.reorder_playlist(uuid, uuid[]),
  public.request_playlist_resync(uuid) from public, anon, authenticated;
grant execute on function public.get_player_manifest(), public.reorder_playlist(uuid, uuid[]),
  public.request_playlist_resync(uuid) to authenticated;

commit;
