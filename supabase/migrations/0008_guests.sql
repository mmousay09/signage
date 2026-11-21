-- الوضع التفاعلي (الجزء 2): تسجيل الضيوف من الشاشة وبطاقة QR
begin;

alter table public.contracts add column registration_enabled boolean not null default false;

create table public.guests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  contract_id     uuid not null,
  -- رمز البطاقة: 8 حروف وأرقام لا تتشابه، يولّده الجهاز فيعمل التسجيل دون إنترنت
  badge_code      text not null check (badge_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  full_name       text not null check (length(btrim(full_name)) between 2 and 120),
  organization    text check (length(organization) <= 120),
  job_title       text check (length(job_title) <= 120),
  phone           text check (length(phone) <= 30),
  email           text check (length(email) <= 160),
  language        text not null default 'ar' check (language in ('ar','fr','en')),
  source          text not null default 'kiosk' check (source in ('kiosk','admin')),
  screen_id       uuid references public.screens(id) on delete set null,
  checked_in_at   timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade,
  unique (badge_code)
);
create index on public.guests (contract_id, created_at desc);

alter table public.guests enable row level security;
create policy org_members_all on public.guests for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy renter_read on public.guests for select to authenticated
  using (public.is_contract_member(contract_id));
revoke all on public.guests from anon, public;
grant select, insert, update, delete on public.guests to authenticated;
grant all on public.guests to service_role;

-- تسجيل من الشاشة: يقبل الإعادة بالرمز نفسه، فتُرسل الطلبات المخزنة بأمان بعد عودة الإنترنت
create function public.register_guest(
  p_contract uuid, p_code text, p_full_name text, p_organization text default null,
  p_job_title text default null, p_phone text default null, p_email text default null,
  p_language text default 'ar', p_registered_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contracts;
  v_screen uuid := public.current_screen_id();
  v_at timestamptz := least(coalesce(p_registered_at, now()), now());
begin
  select * into c from public.contracts where id = p_contract;
  if v_screen is null or not found or not public.screen_has_contract(c.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (c.interactive and c.registration_enabled and c.status = 'confirmed')
     or v_at < c.starts_at - interval '1 day' or v_at > c.ends_at then
    raise exception 'registration_closed';
  end if;

  insert into public.guests (org_id, contract_id, badge_code, full_name, organization, job_title,
                             phone, email, language, source, screen_id, created_at)
  values (c.org_id, c.id, upper(p_code), btrim(p_full_name), nullif(btrim(p_organization), ''),
          nullif(btrim(p_job_title), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
          coalesce(p_language, 'ar'), 'kiosk', v_screen, v_at)
  on conflict (badge_code) do nothing;

  if not exists (select 1 from public.guests where badge_code = upper(p_code) and contract_id = c.id) then
    raise exception 'code_taken';
  end if;
  return jsonb_build_object('code', upper(p_code));
end $$;

-- صفحة البطاقة على هاتف الضيف: تكفي معرفة الرمز، ولا تكشف الهاتف أو البريد
create function public.get_badge(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', g.badge_code, 'full_name', g.full_name, 'organization', g.organization,
    'job_title', g.job_title, 'language', g.language, 'checked_in', g.checked_in_at is not null,
    'event', c.title, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'host', o.name)
  from public.guests g
  join public.contracts c on c.id = g.contract_id
  join public.organizations o on o.id = g.org_id
  where g.badge_code = upper(p_code);
$$;

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
      from public.agenda_items g where g.contract_id = c.id), '[]'::jsonb)) end
  from public.contracts c
  left join public.media_assets a on a.id = c.logo_asset_id and a.kind = 'image'
    and (a.contract_id is null or a.contract_id = c.id)
  where c.id = p_contract;
$$;

revoke all on function public.register_guest(uuid, text, text, text, text, text, text, text, timestamptz),
  public.get_badge(text) from public, anon, authenticated;
grant execute on function public.register_guest(uuid, text, text, text, text, text, text, text, timestamptz)
  to authenticated;
grant execute on function public.get_badge(text) to anon, authenticated;

commit;
