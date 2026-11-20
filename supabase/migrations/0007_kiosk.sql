-- الوضع التفاعلي (الجزء 1): قائمة جانبية، لغات، شعار، وبرنامج الجلسات لكل عقد
begin;

alter table public.contracts
  add column interactive   boolean not null default false,
  add column languages     text[]  not null default '{ar}',
  add column logo_asset_id uuid,
  add constraint contracts_languages_check
    check (cardinality(languages) between 1 and 3 and languages <@ array['ar','fr','en']::text[]),
  add constraint contracts_logo_fk
    foreign key (org_id, logo_asset_id) references public.media_assets(org_id, id) on delete set null (logo_asset_id);

-- ترجمة الجلسة: {"fr": {"title": "...", "speaker": "...", "place": "..."}, "en": {...}}
alter table public.agenda_items
  add column translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object');

create function public.kiosk_json(p_contract uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not c.interactive then null else jsonb_build_object(
    'languages', to_jsonb(c.languages),
    'logo', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'path', a.storage_path, 'mime', a.mime_type, 'size', a.size_bytes, 'duration_ms', null) end,
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'speaker', g.speaker, 'place', g.place,
        'starts_at', g.starts_at, 'ends_at', g.ends_at, 'translations', g.translations)
        order by g.starts_at, g.id)
      from public.agenda_items g where g.contract_id = c.id), '[]'::jsonb)) end
  from public.contracts c
  left join public.media_assets a on a.id = c.logo_asset_id and a.kind = 'image'
    and (a.contract_id is null or a.contract_id = c.id)
  where c.id = p_contract;
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
           'program', public.program_json(cs.playlist_id, coalesce(cs.layout_id, s.layout_id)),
           'kiosk', public.kiosk_json(c.id))
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

revoke all on function public.kiosk_json(uuid) from public, anon, authenticated;

commit;
