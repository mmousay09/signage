-- ما ينقصنا مقارنة بمنظومة «رؤيا»: فريق وصلاحيات، لقطة من الشاشة، الصوت، اتجاه الشاشة،
-- تنبيه انقطاع أي شاشة، ورمز يحمي إعدادات تطبيق الشاشة

-- قيم جديدة في الأنواع (تُستخدم بعد هذا الملف فقط)
alter type public.org_role add value if not exists 'viewer';
alter type public.screen_command_kind add value if not exists 'snapshot';

begin;

-- ===== الشاشات =====
alter table public.screens
  add column rotation      smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  add column volume        smallint not null default 100 check (volume between 0 and 100),
  add column alert_offline boolean  not null default false;

alter table public.organizations
  add column screen_pin_hash text check (screen_pin_hash ~ '^[0-9a-f]{64}$');

-- ===== الصلاحيات =====
-- «مشاهدة فقط» يقرأ ولا يغيّر: is_org_member صارت تعني من يحق له التعديل،
-- وis_org_reader تشمل كل أعضاء الفريق.
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_org and m.user_id = (select auth.uid())
                   and m.role::text <> 'viewer');
$$;

create function public.is_org_reader(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_org and m.user_id = (select auth.uid()));
$$;

do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r' and c.relrowsecurity
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
      and c.relname <> 'organization_members'
  loop
    execute format('create policy viewer_read on public.%I for select to authenticated using (public.is_org_reader(org_id))', t);
  end loop;
end $$;

drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated
  using (public.is_org_reader(id) or id = public.current_screen_org());

drop policy if exists members_read on public.organization_members;
create policy members_read on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_reader(org_id));

create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  with p as (select string_to_array(p_name, '/') as seg)
  select exists (
    select 1 from p join public.organizations o on o.id::text = p.seg[1]
    where public.is_org_reader(o.id)
       or (p.seg[2] = 'shared' and o.id = public.current_screen_org())
       or exists (select 1 from public.contracts c
                  where c.org_id = o.id and c.id::text = p.seg[2]
                    and (public.screen_has_contract(c.id) or public.is_contract_member(c.id))));
$$;

create or replace function public.realtime_can_read(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.screens s
    where 'screen:' || s.id::text = p_topic
      and (s.auth_user_id = (select auth.uid()) or public.is_org_member(s.org_id)))
  or exists (
    select 1 from public.organizations o
    where 'dashboard:' || o.id::text = p_topic and public.is_org_reader(o.id));
$$;

-- ===== دعوات الفريق: رابط يُرسل على واتساب، صالح 7 أيام ولمرة واحدة =====
create table public.team_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  token_hash  text not null unique,
  role        text not null check (role in ('admin', 'staff', 'viewer')),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at  timestamptz
);
alter table public.team_invites enable row level security;
create policy admins_read on public.team_invites for select to authenticated using (public.is_org_admin(org_id));
revoke all on public.team_invites from anon, public;
grant select on public.team_invites to authenticated;
grant all on public.team_invites to service_role;

create function public.create_team_invite(p_org uuid, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_org_admin(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('admin', 'staff', 'viewer') then raise exception 'bad_role'; end if;
  insert into public.team_invites (org_id, token_hash, role)
  values (p_org, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_role);
  return v_token;
end $$;

create function public.accept_team_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.team_invites;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'registered_user_required' using errcode = '42501';
  end if;
  select * into i from public.team_invites
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or i.revoked_at is not null or i.expires_at < now() then raise exception 'invite_invalid'; end if;
  if i.accepted_by is not null and i.accepted_by <> auth.uid() then raise exception 'invite_used'; end if;
  if exists (select 1 from public.organization_members where user_id = auth.uid() and org_id <> i.org_id) then
    raise exception 'other_organization';
  end if;
  insert into public.organization_members (org_id, user_id, role)
  values (i.org_id, auth.uid(), i.role::public.org_role)
  on conflict (org_id, user_id) do nothing;
  update public.team_invites set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now()) where id = i.id;
  return i.org_id;
end $$;

create function public.revoke_team_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.team_invites set revoked_at = now()
   where id = p_invite and accepted_at is null and public.is_org_admin(org_id);
end $$;

-- قائمة الفريق مع البريد (لا تُقرأ جداول المصادقة من المتصفح مباشرة)
create function public.list_team(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', m.user_id, 'email', u.email, 'role', m.role::text, 'created_at', m.created_at,
           'is_me', m.user_id = auth.uid()) order by m.created_at), '[]'::jsonb)
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org and public.is_org_reader(p_org);
$$;

-- المالك وحده يعيّن أو يغيّر مالكًا، ولا تبقى الشركة دون مالك
create function public.set_member_role(p_org uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_current text; v_me text;
begin
  select role::text into v_me from public.organization_members where org_id = p_org and user_id = auth.uid();
  select role::text into v_current from public.organization_members where org_id = p_org and user_id = p_user;
  if v_me not in ('owner', 'admin') or v_current is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('owner', 'admin', 'staff', 'viewer') then raise exception 'bad_role'; end if;
  if (p_role = 'owner' or v_current = 'owner') and v_me <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  if v_current = 'owner' and p_role <> 'owner'
     and (select count(*) from public.organization_members where org_id = p_org and role::text = 'owner') = 1 then
    raise exception 'last_owner';
  end if;
  update public.organization_members set role = p_role::public.org_role where org_id = p_org and user_id = p_user;
end $$;

create function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_current text; v_me text;
begin
  select role::text into v_me from public.organization_members where org_id = p_org and user_id = auth.uid();
  select role::text into v_current from public.organization_members where org_id = p_org and user_id = p_user;
  if v_current is null then return; end if;
  if p_user <> auth.uid() and coalesce(v_me, '') not in ('owner', 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_current = 'owner' and coalesce(v_me, '') <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  if v_current = 'owner'
     and (select count(*) from public.organization_members where org_id = p_org and role::text = 'owner') = 1 then
    raise exception 'last_owner';
  end if;
  delete from public.organization_members where org_id = p_org and user_id = p_user;
end $$;

-- اسم الملف يصل للشاشة ليظهر في «يعرض الآن» وفي تقرير العرض
create or replace function public.program_json(p_playlist uuid, p_layout uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'layout', coalesce(
      (select jsonb_build_object('position', l.avatar_position, 'percent', l.avatar_percent)
       from public.layouts l where l.id = p_layout),
      jsonb_build_object('position', 'none', 'percent', 0)),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'body', i.body, 'duration_ms', i.duration_ms,
        'asset', case when a.id is null then null else jsonb_build_object(
          'id', a.id, 'name', a.name, 'path', a.storage_path, 'mime', a.mime_type,
          'size', a.size_bytes, 'duration_ms', a.duration_ms) end)
        order by i.position)
      from public.playlist_items i
      left join public.media_assets a on a.id = i.asset_id
      where i.playlist_id = p_playlist and i.is_enabled), '[]'::jsonb));
$$;

-- ===== لقطة مما تعرضه الشاشة الآن =====
create table public.screen_snapshots (
  screen_id uuid primary key references public.screens(id) on delete cascade,
  org_id    uuid not null references public.organizations(id) on delete cascade,
  image     text not null check (image like 'data:image/jpeg;base64,%' and length(image) <= 900000),
  taken_at  timestamptz not null default now()
);
alter table public.screen_snapshots enable row level security;
create policy viewer_read on public.screen_snapshots for select to authenticated using (public.is_org_reader(org_id));
revoke all on public.screen_snapshots from anon, public;
grant select on public.screen_snapshots to authenticated;
grant all on public.screen_snapshots to service_role;

create function public.save_snapshot(p_image text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_screen uuid := public.current_screen_id(); v_org uuid := public.current_screen_org();
begin
  if v_screen is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.screen_snapshots (screen_id, org_id, image, taken_at)
  values (v_screen, v_org, p_image, now())
  on conflict (screen_id) do update set image = excluded.image, taken_at = now();
end $$;

-- ===== تنبيه الانقطاع: الشاشات المؤجرة دائمًا، وأي شاشة فُعّل لها التنبيه =====
create or replace function public.screen_alerts(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'screen_id', x.id, 'screen', x.name, 'contract', x.contract, 'last_seen_at', x.last_seen_at)
           order by x.last_seen_at nulls first), '[]'::jsonb)
  from (
    select s.id, coalesce(s.name, 'شاشة') as name, s.last_seen_at,
           (select c.title from public.contract_screens cs join public.contracts c on c.id = cs.contract_id
             where cs.screen_id = s.id and c.status = 'confirmed' and c.starts_at <= now() and c.ends_at > now()
             limit 1) as contract,
           s.alert_offline
    from public.screens s
    where public.is_org_reader(p_org) and s.org_id = p_org and s.status = 'active'
      and (s.last_seen_at is null or s.last_seen_at < now() - interval '2 minutes')
  ) x
  where x.contract is not null or x.alert_offline;
$$;

create or replace function public.contract_report(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or not (public.is_org_reader(c.org_id) or public.is_contract_member(c.id)) then
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
        select jsonb_build_object(
                 'label', coalesce(max(m.name), max(p.item_label)), 'plays', sum(p.plays), 'shown_ms', sum(p.shown_ms)) x
        from public.play_stats p
        left join public.playlist_items pi on pi.id::text = p.item_key
        left join public.media_assets m on m.id = pi.asset_id
        where p.contract_id = c.id group by p.item_key) i), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(x order by x ->> 'day') from (
        select jsonb_build_object('day', (p.hour at time zone 'Africa/Tripoli')::date, 'plays', sum(p.plays), 'shown_ms', sum(p.shown_ms)) x
        from public.play_stats p where p.contract_id = c.id
        group by (p.hour at time zone 'Africa/Tripoli')::date) d), '[]'::jsonb),
    'qr_scans', (select count(*) from public.qr_scans q where q.contract_id = c.id),
    'guests', (select count(*) from public.guests g where g.contract_id = c.id),
    'checked_in', (select count(*) from public.guests g where g.contract_id = c.id and g.checked_in_at is not null),
    'generated_at', now());
end $$;

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
    'rotation', s.rotation,
    'volume', s.volume,
    'pin_hash', o.screen_pin_hash,
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


revoke all on function public.is_org_reader(uuid), public.create_team_invite(uuid, text),
  public.accept_team_invite(text), public.revoke_team_invite(uuid), public.list_team(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.save_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.is_org_reader(uuid), public.create_team_invite(uuid, text),
  public.accept_team_invite(text), public.revoke_team_invite(uuid), public.list_team(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.save_snapshot(text)
  to authenticated;

commit;
