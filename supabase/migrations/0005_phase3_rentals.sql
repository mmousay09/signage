-- المرحلة 3: برنامج لكل عقد، تحويل تلقائي يعمل دون إنترنت، وبوابة المستأجر
begin;

-- لكل عقد قائمة عرض خاصة تُنشأ تلقائيًا
create function public.create_contract_playlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.playlists (org_id, contract_id, name) values (new.org_id, new.id, new.title);
  return null;
end $$;

create trigger create_contract_playlist after insert on public.contracts
  for each row execute function public.create_contract_playlist();

insert into public.playlists (org_id, contract_id, name)
select c.org_id, c.id, c.title from public.contracts c
where not exists (select 1 from public.playlists p where p.contract_id = c.id);

create or replace function public.sync_contract_screen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into strict c from public.contracts where id = new.contract_id;
  new.period := c.period;
  new.is_blocking := c.status = 'confirmed';
  if new.playlist_id is null then
    select p.id into new.playlist_id from public.playlists p
    where p.contract_id = c.id order by p.created_at limit 1;
  end if;
  return new;
end $$;

create or replace function public.propagate_contract_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.contract_screens set is_blocking = is_blocking where contract_id = new.id;
  update public.renter_invites set expires_at = new.ends_at
   where contract_id = new.id and revoked_at is null;
  return null;
end $$;

create function public.program_json(p_playlist uuid, p_layout uuid) returns jsonb
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
          'id', a.id, 'path', a.storage_path, 'mime', a.mime_type,
          'size', a.size_bytes, 'duration_ms', a.duration_ms) end)
        order by i.position)
      from public.playlist_items i
      left join public.media_assets a on a.id = i.asset_id
      where i.playlist_id = p_playlist and i.is_enabled), '[]'::jsonb));
$$;

-- البيان يحمل كل العقود القادمة، فتتحول الشاشة في وقتها حتى دون إنترنت
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
    'contracts', v_contracts);

  return v_stable || jsonb_build_object(
    'version', md5(v_stable::text),
    'program', coalesce(v_current, v_idle,
      jsonb_build_object('layout', jsonb_build_object('position', 'none', 'percent', 0), 'items', '[]'::jsonb)));
end $$;

create or replace function public.reorder_playlist(p_playlist uuid, p_items uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.playlists;
begin
  select * into p from public.playlists where id = p_playlist;
  if not found or not (public.is_org_member(p.org_id)
      or (p.contract_id is not null and public.can_renter_edit(p.contract_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.playlist_items i
     set position = o.ordinality
    from unnest(p_items) with ordinality as o(id, ordinality)
   where i.id = o.id and i.playlist_id = p_playlist;
end $$;

create function public.request_contract_resync(p_contract uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_count integer;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or not (public.is_org_member(c.org_id) or public.can_renter_edit(c.id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.screen_commands (org_id, screen_id, command)
  select cs.org_id, cs.screen_id, 'resync'
  from public.contract_screens cs
  join public.screens s on s.id = cs.screen_id and s.status = 'active'
  where cs.contract_id = p_contract;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- رابط واحد صالح لكل عقد، وإنشاء رابط جديد يلغي السابق
create or replace function public.create_renter_invite(p_contract uuid, p_max_uses integer default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_token text;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or not public.is_org_member(c.org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.renter_invites set revoked_at = now()
   where contract_id = c.id and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.renter_invites (org_id, contract_id, token_hash, max_uses, expires_at)
  values (c.org_id, c.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_max_uses, c.ends_at);
  return jsonb_build_object('token', v_token, 'expires_at', c.ends_at);
end $$;

create or replace function public.redeem_renter_invite(p_token text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.renter_invites;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '42501'; end if;
  select * into i from public.renter_invites
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'invalid_or_expired_invite' using errcode = 'P0002'; end if;
  if i.revoked_at is null and exists (
       select 1 from public.contract_members
       where contract_id = i.contract_id and user_id = auth.uid()) then
    return i.contract_id;
  end if;
  if i.revoked_at is not null or i.expires_at <= now() or i.use_count >= i.max_uses then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0002';
  end if;
  insert into public.contract_members (contract_id, user_id, org_id, display_name)
  values (i.contract_id, auth.uid(), i.org_id, p_display_name);
  update public.renter_invites set use_count = use_count + 1 where id = i.id;
  return i.contract_id;
end $$;

create function public.revoke_renter_access(p_contract uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or not public.is_org_member(c.org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.renter_invites set revoked_at = now()
   where contract_id = c.id and revoked_at is null;
  delete from public.contract_members where contract_id = c.id;
end $$;

revoke all on function public.create_contract_playlist(), public.program_json(uuid, uuid),
  public.request_contract_resync(uuid), public.revoke_renter_access(uuid)
  from public, anon, authenticated;
grant execute on function public.request_contract_resync(uuid), public.revoke_renter_access(uuid)
  to authenticated;

commit;
