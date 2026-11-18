-- السماح لأعضاء الشركة بقناة لوحة التحكم الخاصة
create or replace function public.realtime_can_read(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.screens s
    where 'screen:' || s.id::text = p_topic
      and (s.auth_user_id = (select auth.uid()) or public.is_org_member(s.org_id)))
  or exists (
    select 1 from public.organizations o
    where 'dashboard:' || o.id::text = p_topic and public.is_org_member(o.id));
$$;
