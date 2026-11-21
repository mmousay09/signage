-- الأفكار المقترحة: تنبيه الانقطاع، تقرير إثبات العرض، QR بعدّاد مسح، قاموس النطق،
-- تذكير التجديد، والمساعد التفاعلي بالأسئلة والأجوبة
begin;

-- ===== عقود: رمز QR والمساعد =====
alter table public.contracts
  add column qr_url             text check (qr_url ~ '^https?://' and length(qr_url) <= 500),
  add column qr_caption         text check (length(qr_caption) <= 60),
  add column assistant_enabled  boolean not null default false,
  add column assistant_name     text check (length(assistant_name) <= 40),
  add column assistant_asset_id uuid,
  add constraint contracts_assistant_fk
    foreign key (org_id, assistant_asset_id) references public.media_assets(org_id, id) on delete set null (assistant_asset_id);

-- ===== إثبات العرض: عدد مرات ومدة عرض كل مادة لكل ساعة =====
create table public.play_stats (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null,
  screen_id   uuid not null references public.screens(id) on delete cascade,
  item_key    text not null check (length(item_key) <= 80),
  item_label  text not null check (length(item_label) <= 160),
  hour        timestamptz not null,
  plays       integer not null default 0 check (plays >= 0),
  shown_ms    bigint  not null default 0 check (shown_ms >= 0),
  primary key (contract_id, screen_id, item_key, hour),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);

-- ===== مسح رمز QR =====
create table public.qr_scans (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null,
  screen_id   uuid references public.screens(id) on delete set null,
  scanned_at  timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);
create index on public.qr_scans (contract_id, scanned_at);

-- ===== قاموس النطق: يُستبدل المكتوب بالمنطوق قبل الكلام =====
create table public.pronunciations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  term       text not null check (length(btrim(term)) between 1 and 80),
  spoken     text not null check (length(btrim(spoken)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (org_id, term)
);

-- ===== أسئلة وأجوبة المساعد =====
create table public.assistant_answers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  contract_id  uuid not null,
  position     integer not null default 0,
  question     text not null check (length(btrim(question)) between 2 and 200),
  answer       text not null check (length(btrim(answer)) between 1 and 1500),
  translations jsonb not null default '{}'::jsonb check (jsonb_typeof(translations) = 'object'),
  created_at   timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);
create index on public.assistant_answers (contract_id, position);

do $$
declare t text;
begin
  foreach t in array array['play_stats','qr_scans','pronunciations','assistant_answers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy org_members_all on public.%I for all to authenticated
                    using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
create policy renter_read on public.play_stats for select to authenticated using (public.is_contract_member(contract_id));
create policy renter_read on public.qr_scans for select to authenticated using (public.is_contract_member(contract_id));
create policy renter_all on public.assistant_answers for all to authenticated
  using (public.is_contract_member(contract_id)) with check (public.is_contract_member(contract_id));

-- ===== الشاشة ترسل إحصاءات العرض المتراكمة =====
-- p_rows: [{"contract": uuid, "key": text, "label": text, "hour": timestamptz, "plays": int, "ms": int}]
create function public.report_plays(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_screen uuid := public.current_screen_id(); v_count integer;
begin
  if v_screen is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad_rows'; end if;

  insert into public.play_stats as p (org_id, contract_id, screen_id, item_key, item_label, hour, plays, shown_ms)
  select c.org_id, c.id, v_screen, left(r ->> 'key', 80), left(coalesce(r ->> 'label', ''), 160),
         date_trunc('hour', (r ->> 'hour')::timestamptz),
         least(greatest((r ->> 'plays')::int, 0), 10000), least(greatest((r ->> 'ms')::bigint, 0), 3600000)
  from jsonb_array_elements(p_rows) r
  join public.contracts c on c.id = (r ->> 'contract')::uuid
  where public.screen_has_contract(c.id)
    and (r ->> 'hour')::timestamptz between c.starts_at - interval '1 hour' and least(c.ends_at, now()) + interval '1 hour'
  on conflict (contract_id, screen_id, item_key, hour) do update
    set plays = p.plays + excluded.plays,
        shown_ms = least(p.shown_ms + excluded.shown_ms, 3600000),
        item_label = excluded.item_label;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ===== رابط QR: يُسجَّل المسح ثم يُعاد توجيه الزائر =====
create function public.record_qr_scan(p_contract uuid, p_screen uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or c.qr_url is null then return null; end if;
  insert into public.qr_scans (org_id, contract_id, screen_id)
  values (c.org_id, c.id, (select s.id from public.screens s where s.id = p_screen and s.org_id = c.org_id));
  return c.qr_url;
end $$;

-- ===== تنبيه انقطاع الشاشات المؤجرة الآن =====
create function public.screen_alerts(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'screen_id', s.id, 'screen', coalesce(s.name, 'شاشة'), 'contract', c.title,
           'last_seen_at', s.last_seen_at) order by s.last_seen_at nulls first), '[]'::jsonb)
  from public.screens s
  join public.contract_screens cs on cs.screen_id = s.id
  join public.contracts c on c.id = cs.contract_id
  where public.is_org_member(p_org) and s.org_id = p_org and s.status = 'active'
    and c.status = 'confirmed' and c.starts_at <= now() and c.ends_at > now()
    and (s.last_seen_at is null or s.last_seen_at < now() - interval '2 minutes');
$$;

-- ===== تقرير إثبات العرض =====
create function public.contract_report(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or not (public.is_org_member(c.org_id) or public.is_contract_member(c.id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'title', c.title, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'status', c.status,
    'client', (select name from public.clients where id = c.client_id),
    'organization', (select name from public.organizations where id = c.org_id),
    'contact_phone', (select contact_phone from public.organizations where id = c.org_id),
    'screens', coalesce((select jsonb_agg(jsonb_build_object(
        'name', coalesce(s.name, 'شاشة'), 'location', s.location,
        'plays', coalesce((select sum(p.plays) from public.play_stats p where p.contract_id = c.id and p.screen_id = s.id), 0),
        'shown_ms', coalesce((select sum(p.shown_ms) from public.play_stats p where p.contract_id = c.id and p.screen_id = s.id), 0),
        'active_hours', (select count(distinct p.hour) from public.play_stats p where p.contract_id = c.id and p.screen_id = s.id))
        order by s.name)
      from public.contract_screens cs join public.screens s on s.id = cs.screen_id where cs.contract_id = c.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(x order by x ->> 'label') from (
        select jsonb_build_object('label', max(p.item_label), 'plays', sum(p.plays), 'shown_ms', sum(p.shown_ms)) x
        from public.play_stats p where p.contract_id = c.id group by p.item_key) i), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(x order by x ->> 'day') from (
        select jsonb_build_object('day', (p.hour at time zone 'Africa/Tripoli')::date, 'plays', sum(p.plays), 'shown_ms', sum(p.shown_ms)) x
        from public.play_stats p where p.contract_id = c.id
        group by (p.hour at time zone 'Africa/Tripoli')::date) d), '[]'::jsonb),
    'qr_scans', (select count(*) from public.qr_scans q where q.contract_id = c.id),
    'guests', (select count(*) from public.guests g where g.contract_id = c.id),
    'checked_in', (select count(*) from public.guests g where g.contract_id = c.id and g.checked_in_at is not null),
    'generated_at', now());
end $$;

-- ===== بيانات التواصل للمستأجر لطلب التجديد =====
create function public.renter_contact(p_contract uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organization', o.name, 'contact_phone', o.contact_phone)
  from public.contracts c join public.organizations o on o.id = c.org_id
  where c.id = p_contract and (public.is_contract_member(c.id) or public.is_org_member(c.org_id));
$$;

-- ===== البيان: QR لكل عقد، والمساعد ضمن الوضع التفاعلي، والقاموس =====
create or replace function public.kiosk_json(p_contract uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not c.interactive then null else jsonb_build_object(
    'languages', to_jsonb(c.languages),
    'registration', c.registration_enabled,
    'logo', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'path', a.storage_path, 'mime', a.mime_type, 'size', a.size_bytes, 'duration_ms', null) end,
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'speaker', g.speaker, 'place', g.place,
        'starts_at', g.starts_at, 'ends_at', g.ends_at, 'translations', g.translations)
        order by g.starts_at, g.id)
      from public.agenda_items g where g.contract_id = c.id), '[]'::jsonb),
    'assistant', case when not c.assistant_enabled then null else jsonb_build_object(
      'name', coalesce(nullif(btrim(c.assistant_name), ''), 'المساعد'),
      'avatar', case when v.id is null then null else jsonb_build_object(
        'id', v.id, 'path', v.storage_path, 'mime', v.mime_type, 'size', v.size_bytes, 'duration_ms', null) end,
      'answers', coalesce((
        select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer,
                                            'translations', q.translations) order by q.position, q.created_at)
        from public.assistant_answers q where q.contract_id = c.id), '[]'::jsonb)) end) end
  from public.contracts c
  left join public.media_assets a on a.id = c.logo_asset_id and a.kind = 'image'
    and (a.contract_id is null or a.contract_id = c.id)
  left join public.media_assets v on v.id = c.assistant_asset_id and v.kind = 'image'
    and (v.contract_id is null or v.contract_id = c.id)
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
           'kiosk', public.kiosk_json(c.id),
           'qr', case when c.qr_url is null then null
                      else jsonb_build_object('caption', coalesce(nullif(btrim(c.qr_caption), ''), 'امسح للمزيد')) end)
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
    'screen_id', s.id,
    'organization', o.name,
    'contact_phone', o.contact_phone,
    'fallback_headline', o.fallback_headline,
    'idle', v_idle,
    'contracts', v_contracts,
    'schedules', public.screen_schedules_json(s.id),
    'pronunciations', coalesce((select jsonb_agg(jsonb_build_object('term', p.term, 'spoken', p.spoken)
                                                 order by length(p.term) desc)
                                from public.pronunciations p where p.org_id = s.org_id), '[]'::jsonb));

  return v_stable || jsonb_build_object(
    'version', md5(v_stable::text),
    'program', coalesce(v_current, v_idle,
      jsonb_build_object('layout', jsonb_build_object('position', 'none', 'percent', 0), 'items', '[]'::jsonb)));
end $$;

revoke all on function public.report_plays(jsonb), public.record_qr_scan(uuid, uuid), public.screen_alerts(uuid),
  public.contract_report(uuid), public.renter_contact(uuid) from public, anon, authenticated;
grant execute on function public.report_plays(jsonb), public.screen_alerts(uuid), public.contract_report(uuid),
  public.renter_contact(uuid) to authenticated;
grant execute on function public.record_qr_scan(uuid, uuid) to anon, authenticated;

commit;
