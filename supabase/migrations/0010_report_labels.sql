-- تقرير إثبات العرض: اسم الملف بدل «صورة رقم 1» متى كانت المادة ما زالت في المكتبة
begin;

create or replace function public.contract_report(p_contract uuid) returns jsonb
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

commit;
