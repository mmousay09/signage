-- المرحلة 1: شغّل هذا الملف بعد 0001_schema.sql
begin;

-- المنظومة لشركة واحدة: أول حساب ينشئ الشركة، ولا يمكن لأي حساب آخر إنشاء شركة جديدة.
create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'registered_user_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('create_organization'));
  if exists (select 1 from public.organizations) then
    raise exception 'organization_already_exists' using errcode = '42501';
  end if;
  insert into public.organizations (name) values (p_name) returning id into v_id;
  insert into public.organization_members (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- إظهار حالة الصوت والعرض في لوحة التحكم
create or replace view public.v_screen_status with (security_invoker = true) as
select s.id, s.org_id, s.name, s.location, s.status, s.last_seen_at, s.app_version,
       s.cached_bytes, s.free_bytes,
       coalesce(s.last_seen_at > now() - interval '90 seconds', false) as is_online,
       c.id as contract_id, c.title as contract_title, c.ends_at as contract_ends_at,
       cl.name as client_name,
       s.player_state
from public.screens s
left join public.contract_screens cs on cs.screen_id = s.id and cs.is_blocking and now() <@ cs.period
left join public.contracts c on c.id = cs.contract_id
left join public.clients cl on cl.id = c.client_id;

commit;
