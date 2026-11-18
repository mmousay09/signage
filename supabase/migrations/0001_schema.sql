-- ============================================================================
-- منظومة إدارة وتأجير الشاشات الدعائية العمودية — مخطط قاعدة البيانات v1
-- طريقة التشغيل: Supabase > SQL Editor > الصق الملف كاملًا > Run (مرة واحدة، على مشروع جديد)
--
-- قبل التشغيل:  Authentication > Providers/Settings > فعّل Anonymous Sign-Ins
-- بعد التشغيل:  Realtime > Settings > عطّل "Allow public access"
--
-- هوية كل طرف:
--   المالك/الموظفون  = مستخدم عادي + صف في organization_members
--   الشاشة           = مستخدم مجهول (Anonymous) مربوط بصف في screens
--   المستأجر         = مستخدم مجهول/عادي + صف في contract_members عبر رابط دعوة
--
-- مسار الملفات في التخزين:  {org_id}/{contract_id أو shared}/{اسم الملف}
-- قناة كل شاشة في Realtime:  screen:{screen_id}  (خاصة: private = true)
-- ============================================================================

begin;

create extension if not exists pgcrypto   with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ----------------------------------------------------------------------------
-- 1) الأنواع
-- ----------------------------------------------------------------------------
create type public.org_role          as enum ('owner', 'admin', 'staff');
create type public.screen_status     as enum ('pending', 'active', 'disabled');
create type public.contract_status   as enum ('draft', 'confirmed', 'cancelled');
create type public.media_kind        as enum ('image', 'video', 'audio', 'chime');
create type public.playlist_item_kind as enum ('image', 'video', 'text', 'agenda');
create type public.avatar_position   as enum ('top', 'bottom', 'none');
create type public.avatar_render     as enum ('static_image', 'model_3d', 'heygen', 'did');
create type public.voice_provider    as enum ('browser', 'elevenlabs');
create type public.video_provider    as enum ('none', 'heygen', 'did');
create type public.clip_status       as enum ('pending', 'processing', 'ready', 'failed');
create type public.schedule_recurrence as enum ('once', 'daily', 'weekly');
create type public.broadcast_status  as enum ('preparing', 'sent', 'cancelled', 'failed');
create type public.delivery_status   as enum ('pending', 'received', 'ready', 'played', 'failed', 'missed');
create type public.screen_command_kind as enum ('reload', 'resync', 'clear_cache', 'identify');
create type public.command_status    as enum ('pending', 'done', 'failed');

-- ----------------------------------------------------------------------------
-- 2) الشركة والعملاء والشاشات والعقود
-- ----------------------------------------------------------------------------
create table public.organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) > 0),
  contact_phone     text,
  default_timezone  text not null default 'Africa/Tripoli',
  fallback_headline text not null default 'هذه الشاشة متاحة للإيجار',
  fallback_playlist_id uuid,
  fallback_layout_id   uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.organization_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.org_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.organization_members (user_id);

create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id)
);

create table public.screens (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid references public.organizations(id) on delete cascade,
  auth_user_id       uuid unique references auth.users(id) on delete set null,
  name               text,
  location           text,
  status             public.screen_status not null default 'pending',
  pairing_code       text check (pairing_code ~ '^[0-9]{5}$'),
  pairing_expires_at timestamptz,
  paired_at          timestamptz,
  last_seen_at       timestamptz,
  app_version        text,
  cached_bytes       bigint,
  free_bytes         bigint,
  player_state       jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (org_id, id),
  check ((status = 'pending') = (org_id is null))
);
create unique index screens_pairing_code_key on public.screens (pairing_code) where pairing_code is not null;

create table public.contracts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  client_id  uuid not null,
  title      text not null check (length(btrim(title)) > 0),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  timezone   text not null default 'Africa/Tripoli',
  status     public.contract_status not null default 'draft',
  period     tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check (ends_at > starts_at),
  foreign key (org_id, client_id) references public.clients(org_id, id) on delete restrict
);
create index on public.contracts (org_id, status, ends_at);

-- ----------------------------------------------------------------------------
-- 3) المحتوى
-- ----------------------------------------------------------------------------
create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  contract_id  uuid,                                  -- NULL = مكتبة الشركة
  kind         public.media_kind not null,
  name         text not null,
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  sha256       text,                                  -- للتحقق من اكتمال التنزيل على الشاشة
  duration_ms  integer check (duration_ms >= 0),
  width        integer,
  height       integer,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);
create index on public.media_assets (org_id, contract_id);

create table public.layouts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  avatar_position public.avatar_position not null default 'top',
  avatar_percent  smallint not null default 40,       -- نسبة ارتفاع المحاكي من الشاشة
  options         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, id),
  check ((avatar_position = 'none' and avatar_percent = 0)
      or (avatar_position <> 'none' and avatar_percent between 10 and 90))
);

create table public.avatars (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null,
  render_mode        public.avatar_render not null default 'static_image',
  voice_provider     public.voice_provider not null default 'browser',
  voice_id           text,
  provider_avatar_id text,
  idle_asset_id      uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, idle_asset_id) references public.media_assets(org_id, id) on delete set null (idle_asset_id)
);

create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid,                                   -- NULL = قائمة للشركة (مثل شاشة "متاحة للإيجار")
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);
create index on public.playlists (org_id, contract_id);

create table public.playlist_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  playlist_id uuid not null,
  position    integer not null,
  kind        public.playlist_item_kind not null,
  asset_id    uuid,
  body        text,
  duration_ms integer check (duration_ms > 0),        -- الفيديو يأخذ مدته من الملف
  is_enabled  boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (playlist_id, position) deferrable initially deferred,
  foreign key (org_id, playlist_id) references public.playlists(org_id, id) on delete cascade,
  foreign key (org_id, asset_id) references public.media_assets(org_id, id) on delete restrict,
  check ((kind in ('image', 'video')) = (asset_id is not null)),
  check (kind <> 'text' or length(btrim(coalesce(body, ''))) > 0),
  check (kind = 'video' or duration_ms is not null)
);

alter table public.organizations
  add constraint organizations_fallback_playlist_fk
    foreign key (id, fallback_playlist_id) references public.playlists(org_id, id) on delete set null (fallback_playlist_id),
  add constraint organizations_fallback_layout_fk
    foreign key (id, fallback_layout_id) references public.layouts(org_id, id) on delete set null (fallback_layout_id);

-- ربط الشاشات بالعقود. منع الحجز المزدوج يتم هنا على مستوى قاعدة البيانات.
create table public.contract_screens (
  contract_id uuid not null,
  screen_id   uuid not null,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  layout_id   uuid,
  playlist_id uuid,
  avatar_id   uuid,
  period      tstzrange not null,                     -- يُملأ تلقائيًا من العقد
  is_blocking boolean not null default false,         -- يُملأ تلقائيًا: true للعقد المؤكد
  created_at  timestamptz not null default now(),
  primary key (contract_id, screen_id),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade,
  foreign key (org_id, screen_id)   references public.screens(org_id, id)   on delete restrict,
  foreign key (org_id, layout_id)   references public.layouts(org_id, id)   on delete set null (layout_id),
  foreign key (org_id, playlist_id) references public.playlists(org_id, id) on delete set null (playlist_id),
  foreign key (org_id, avatar_id)   references public.avatars(org_id, id)   on delete set null (avatar_id),
  constraint contract_screens_no_double_booking
    exclude using gist (screen_id with =, period with &&) where (is_blocking)
);
create index on public.contract_screens (screen_id);

-- جدول الفعاليات المعروض على الشاشة
create table public.agenda_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null,
  title       text not null,
  speaker     text,
  place       text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  updated_at  timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade,
  check (ends_at is null or ends_at > starts_at)
);
create index on public.agenda_items (contract_id, starts_at);

-- ----------------------------------------------------------------------------
-- 4) الصوت والمحاكي: كل نص يُولَّد مرة واحدة لكل (صوت + محاكي)
-- ----------------------------------------------------------------------------
create table public.speech_clips (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  cache_key          text not null,
  body               text not null check (length(body) between 1 and 5000),
  language           text not null default 'ar',
  voice_provider     public.voice_provider not null,
  voice_id           text,
  video_provider     public.video_provider not null default 'none',
  provider_avatar_id text,
  status             public.clip_status not null default 'pending',
  audio_asset_id     uuid,
  video_asset_id     uuid,
  alignment          jsonb,                           -- توقيت الحروف لتحريك الشفاه محليًا
  duration_ms        integer,
  provider_job_id    text,
  error              text,
  use_count          integer not null default 1,
  last_used_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (org_id, cache_key),
  unique (org_id, id),
  foreign key (org_id, audio_asset_id) references public.media_assets(org_id, id) on delete set null (audio_asset_id),
  foreign key (org_id, video_asset_id) references public.media_assets(org_id, id) on delete set null (video_asset_id)
);

create table public.announcements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  contract_id    uuid,
  title          text not null,
  body           text not null check (length(body) between 1 and 5000),
  chime_asset_id uuid,
  avatar_id      uuid,
  speech_clip_id uuid,
  takeover       boolean not null default true,       -- يوقف المحتوى ويملأ الشاشة أثناء الإعلان
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, contract_id)    references public.contracts(org_id, id)    on delete cascade,
  foreign key (org_id, chime_asset_id) references public.media_assets(org_id, id) on delete set null (chime_asset_id),
  foreign key (org_id, avatar_id)      references public.avatars(org_id, id)      on delete set null (avatar_id),
  foreign key (org_id, speech_clip_id) references public.speech_clips(org_id, id) on delete set null (speech_clip_id)
);

-- ----------------------------------------------------------------------------
-- 5) الجدولة والبث والأوامر
-- ----------------------------------------------------------------------------
create table public.schedules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  contract_id     uuid not null,
  announcement_id uuid not null,
  name            text not null,
  recurrence      public.schedule_recurrence not null default 'daily',
  run_on          date,                               -- للمرة الواحدة
  local_time      time not null,                      -- بتوقيت timezone أدناه
  weekdays        smallint[],                         -- 0=الأحد ... 6=السبت (للأسبوعي)
  timezone        text not null default 'Africa/Tripoli',
  all_screens     boolean not null default true,
  is_enabled      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, contract_id)     references public.contracts(org_id, id)     on delete cascade,
  foreign key (org_id, announcement_id) references public.announcements(org_id, id) on delete cascade,
  check (recurrence <> 'once' or run_on is not null),
  check (recurrence <> 'weekly' or (cardinality(weekdays) > 0 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]))
);
create index on public.schedules (contract_id) where is_enabled;

create table public.schedule_screens (
  schedule_id uuid not null,
  screen_id   uuid not null,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  primary key (schedule_id, screen_id),
  foreign key (org_id, schedule_id) references public.schedules(org_id, id) on delete cascade,
  foreign key (org_id, screen_id)   references public.screens(org_id, id)   on delete cascade
);

create table public.broadcasts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  contract_id    uuid,
  body           text not null check (length(body) between 1 and 5000),
  chime_asset_id uuid,
  avatar_id      uuid,
  speech_clip_id uuid,
  status         public.broadcast_status not null default 'preparing',
  play_at        timestamptz,                         -- لحظة التشغيل الموحدة لكل الشاشات
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, contract_id)    references public.contracts(org_id, id)    on delete set null (contract_id),
  foreign key (org_id, chime_asset_id) references public.media_assets(org_id, id) on delete set null (chime_asset_id),
  foreign key (org_id, avatar_id)      references public.avatars(org_id, id)      on delete set null (avatar_id),
  foreign key (org_id, speech_clip_id) references public.speech_clips(org_id, id) on delete set null (speech_clip_id)
);
create index on public.broadcasts (org_id, created_at desc);

create table public.broadcast_deliveries (
  broadcast_id uuid not null,
  screen_id    uuid not null,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  status       public.delivery_status not null default 'pending',
  received_at  timestamptz,
  played_at    timestamptz,
  drift_ms     integer,                               -- فرق التشغيل عن play_at
  error        text,
  primary key (broadcast_id, screen_id),
  foreign key (org_id, broadcast_id) references public.broadcasts(org_id, id) on delete cascade,
  foreign key (org_id, screen_id)    references public.screens(org_id, id)    on delete cascade
);
create index on public.broadcast_deliveries (screen_id, status);

create table public.screen_commands (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  screen_id   uuid not null,
  command     public.screen_command_kind not null,
  status      public.command_status not null default 'pending',
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '1 hour',
  finished_at timestamptz,
  foreign key (org_id, screen_id) references public.screens(org_id, id) on delete cascade
);
create index on public.screen_commands (screen_id) where status = 'pending';

-- ----------------------------------------------------------------------------
-- 6) وصول المستأجر
-- ----------------------------------------------------------------------------
create table public.contract_members (
  contract_id  uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  primary key (contract_id, user_id),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);
create index on public.contract_members (user_id);

create table public.renter_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null,
  token_hash  text not null unique,                   -- لا يُخزَّن الرابط نفسه
  max_uses    integer not null default 5 check (max_uses > 0),
  use_count   integer not null default 0,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);

-- ----------------------------------------------------------------------------
-- 7) دوال الصلاحيات
-- ----------------------------------------------------------------------------
create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_org and m.user_id = (select auth.uid()));
$$;

create function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_org and m.user_id = (select auth.uid())
                   and m.role in ('owner', 'admin'));
$$;

create function public.current_screen_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.screens s
  where s.auth_user_id = (select auth.uid()) and s.status = 'active';
$$;

create function public.current_screen_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.org_id from public.screens s
  where s.auth_user_id = (select auth.uid()) and s.status = 'active';
$$;

-- الشاشة ترى عقودها الحالية والقادمة لتحفظها مسبقًا وتعمل دون إنترنت
create function public.screen_has_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_screens cs
    join public.screens s on s.id = cs.screen_id
    where cs.contract_id = p_contract and cs.is_blocking
      and upper(cs.period) > now()
      and s.auth_user_id = (select auth.uid()) and s.status = 'active');
$$;

create function public.is_contract_member(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contract_members m
                 where m.contract_id = p_contract and m.user_id = (select auth.uid()));
$$;

-- التعديل مسموح للمستأجر داخل فترة الإيجار فقط
create function public.can_renter_edit(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_members m
    join public.contracts c on c.id = m.contract_id
    where m.contract_id = p_contract and m.user_id = (select auth.uid())
      and c.status = 'confirmed' and now() <@ c.period);
$$;

create function public.is_renter_of_screen(p_screen uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_screens cs
    join public.contract_members m on m.contract_id = cs.contract_id
    where cs.screen_id = p_screen and m.user_id = (select auth.uid()));
$$;

create function public.playlist_contract(p_playlist uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.contract_id from public.playlists p where p.id = p_playlist;
$$;

create function public.screen_can_read_playlist(p_playlist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.playlists p
    where p.id = p_playlist
      and ((p.contract_id is null and p.org_id = public.current_screen_org())
           or public.screen_has_contract(p.contract_id)));
$$;

create function public.screen_has_broadcast(p_broadcast uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.broadcast_deliveries d
                 where d.broadcast_id = p_broadcast and d.screen_id = public.current_screen_id());
$$;

create function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  with p as (select string_to_array(p_name, '/') as seg)
  select exists (
    select 1 from p join public.organizations o on o.id::text = p.seg[1]
    where public.is_org_member(o.id)
       or (p.seg[2] = 'shared' and o.id = public.current_screen_org())
       or exists (select 1 from public.contracts c
                  where c.org_id = o.id and c.id::text = p.seg[2]
                    and (public.screen_has_contract(c.id) or public.is_contract_member(c.id))));
$$;

create function public.storage_can_write(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  with p as (select string_to_array(p_name, '/') as seg)
  select exists (
    select 1 from p join public.organizations o on o.id::text = p.seg[1]
    where public.is_org_member(o.id)
       or (lower(substring(p_name from '\.([^.]+)$')) in ('jpg', 'jpeg', 'png', 'webp')
           and exists (select 1 from public.contracts c
                       where c.org_id = o.id and c.id::text = p.seg[2]
                         and public.can_renter_edit(c.id))));
$$;

create function public.realtime_can_read(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.screens s
    where 'screen:' || s.id::text = p_topic
      and (s.auth_user_id = (select auth.uid()) or public.is_org_member(s.org_id)));
$$;

create function public.realtime_can_send(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.screens s
    where 'screen:' || s.id::text = p_topic and public.is_org_member(s.org_id));
$$;

-- ----------------------------------------------------------------------------
-- 8) المشغلات
-- ----------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations','clients','contracts','layouts','avatars','playlists',
                           'playlist_items','agenda_items','announcements','schedules'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- الفترة وحالة الحجز تأتيان دائمًا من العقد ولا يمكن تعديلهما من العميل
create function public.sync_contract_screen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into strict c from public.contracts where id = new.contract_id;
  new.period := c.period;
  new.is_blocking := c.status = 'confirmed';
  return new;
end $$;

create trigger sync_contract_screen before insert or update on public.contract_screens
  for each row execute function public.sync_contract_screen();

create function public.propagate_contract_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.contract_screens set is_blocking = is_blocking where contract_id = new.id;
  return null;
end $$;

create trigger propagate_contract_change
  after update of starts_at, ends_at, status on public.contracts
  for each row execute function public.propagate_contract_change();

-- إيصال أمر الشاشة فورًا، ويبقى في الجدول لتلتقطه الشاشة إذا كانت غير متصلة
create function public.push_screen_command() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'command', new.command, 'expires_at', new.expires_at),
    'command', 'screen:' || new.screen_id::text, true);
  return null;
end $$;

create trigger push_screen_command after insert on public.screen_commands
  for each row execute function public.push_screen_command();

-- ----------------------------------------------------------------------------
-- 9) دوال التطبيق (RPC)
-- ----------------------------------------------------------------------------
create function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'registered_user_required' using errcode = '42501';
  end if;
  insert into public.organizations (name) values (p_name) returning id into v_id;
  insert into public.organization_members (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- تستدعيها الشاشة عند أول تشغيل، وتعيدها عند انتهاء صلاحية الكود
create function public.request_pairing_code() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.screens;
  b bytea;
  v_code text;
  v_exp timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '42501'; end if;

  select * into s from public.screens where auth_user_id = auth.uid();
  if found and s.org_id is not null then
    return jsonb_build_object('screen_id', s.id, 'paired', true);
  end if;
  if found and s.pairing_expires_at > now() + interval '1 minute' then
    return jsonb_build_object('screen_id', s.id, 'paired', false,
                              'code', s.pairing_code, 'expires_at', s.pairing_expires_at);
  end if;

  update public.screens set pairing_code = null, pairing_expires_at = null
  where pairing_expires_at <= now();

  for i in 1..20 loop
    b := extensions.gen_random_bytes(3);
    v_code := lpad(((get_byte(b,0) * 65536 + get_byte(b,1) * 256 + get_byte(b,2)) % 100000)::text, 5, '0');
    begin
      insert into public.screens (auth_user_id, pairing_code, pairing_expires_at)
      values (auth.uid(), v_code, v_exp)
      on conflict (auth_user_id) do update
        set pairing_code = excluded.pairing_code, pairing_expires_at = excluded.pairing_expires_at
      returning * into s;
      return jsonb_build_object('screen_id', s.id, 'paired', false,
                                'code', s.pairing_code, 'expires_at', s.pairing_expires_at);
    exception when unique_violation then
      null; -- كود مستخدم، نجرب غيره
    end;
  end loop;
  raise exception 'pairing_code_unavailable';
end $$;

create function public.claim_screen(p_org uuid, p_code text, p_name text, p_location text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_org_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.screens
     set org_id = p_org, name = p_name, location = p_location, status = 'active',
         pairing_code = null, pairing_expires_at = null, paired_at = now()
   where pairing_code = p_code and pairing_expires_at > now() and status = 'pending'
  returning id into v_id;
  if v_id is null then raise exception 'invalid_or_expired_code' using errcode = 'P0002'; end if;
  return v_id;
end $$;

create function public.get_server_time() returns bigint
language sql volatile set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

create function public.screen_heartbeat(
  p_app_version text default null, p_cached_bytes bigint default null,
  p_free_bytes bigint default null, p_state jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.screens
     set last_seen_at = now(), app_version = coalesce(p_app_version, app_version),
         cached_bytes = coalesce(p_cached_bytes, cached_bytes),
         free_bytes = coalesce(p_free_bytes, free_bytes),
         player_state = coalesce(p_state, '{}'::jsonb)
   where auth_user_id = auth.uid() and status = 'active'
  returning id into v_id;
  return jsonb_build_object('screen_id', v_id, 'paired', v_id is not null,
                            'server_time_ms', public.get_server_time());
end $$;

create function public.ack_screen_command(p_command uuid, p_ok boolean default true) returns void
language sql security definer set search_path = '' as $$
  update public.screen_commands
     set status = case when p_ok then 'done'::public.command_status else 'failed'::public.command_status end,
         finished_at = now()
   where id = p_command and screen_id = public.current_screen_id() and status = 'pending';
$$;

create function public.get_or_create_speech_clip(
  p_org uuid, p_body text, p_voice_provider public.voice_provider, p_voice_id text default null,
  p_video_provider public.video_provider default 'none', p_provider_avatar_id text default null,
  p_language text default 'ar')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  c public.speech_clips;
  v_id uuid;
  v_new boolean;
begin
  if not (public.is_org_member(p_org) or auth.role() = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_key := encode(sha256(convert_to(concat_ws('|', p_language, p_voice_provider, p_voice_id,
             p_video_provider, p_provider_avatar_id,
             lower(btrim(regexp_replace(p_body, '\s+', ' ', 'g')))), 'UTF8')), 'hex');

  insert into public.speech_clips
    (org_id, cache_key, body, language, voice_provider, voice_id, video_provider, provider_avatar_id)
  values (p_org, v_key, btrim(p_body), p_language, p_voice_provider, p_voice_id, p_video_provider, p_provider_avatar_id)
  on conflict (org_id, cache_key) do update
    set use_count = public.speech_clips.use_count + 1, last_used_at = now(),
        status = case when public.speech_clips.status = 'failed'
                      then 'pending'::public.clip_status else public.speech_clips.status end,
        error = null
  returning id, (xmax = 0) into v_id, v_new;

  select * into c from public.speech_clips where id = v_id;
  return jsonb_build_object('id', c.id, 'status', c.status, 'needs_generation', c.status = 'pending',
                            'audio_asset_id', c.audio_asset_id, 'video_asset_id', c.video_asset_id,
                            'is_new', v_new);
end $$;

-- p_screen_ids = NULL تعني كل شاشات العقد
create function public.create_broadcast(
  p_org uuid, p_body text, p_contract uuid default null, p_screen_ids uuid[] default null,
  p_chime uuid default null, p_avatar uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer;
begin
  if not public.is_org_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_contract is null and p_screen_ids is null then raise exception 'target_required'; end if;

  insert into public.broadcasts (org_id, contract_id, body, chime_asset_id, avatar_id)
  values (p_org, p_contract, p_body, p_chime, p_avatar) returning id into v_id;

  insert into public.broadcast_deliveries (broadcast_id, screen_id, org_id)
  select v_id, s.id, p_org from public.screens s
  where s.org_id = p_org and s.status = 'active'
    and (p_screen_ids is null or s.id = any (p_screen_ids))
    and (p_contract is null or exists (select 1 from public.contract_screens cs
                                       where cs.contract_id = p_contract and cs.screen_id = s.id));
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'no_target_screens'; end if;
  return jsonb_build_object('id', v_id, 'screens', v_count);
end $$;

-- تُستدعى بعد جاهزية الصوت؛ تحدد لحظة تشغيل واحدة مستقبلية لكل الشاشات
create function public.dispatch_broadcast(p_broadcast uuid, p_clip uuid default null, p_lead_ms integer default 4000)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare b public.broadcasts; d record;
begin
  select * into b from public.broadcasts where id = p_broadcast for update;
  if not found or not (public.is_org_member(b.org_id) or auth.role() = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if b.status <> 'preparing' then raise exception 'already_dispatched'; end if;

  update public.broadcasts
     set status = 'sent', speech_clip_id = coalesce(p_clip, speech_clip_id),
         play_at = clock_timestamp() + make_interval(secs => greatest(1500, least(p_lead_ms, 60000)) / 1000.0)
   where id = p_broadcast returning * into b;

  for d in select screen_id from public.broadcast_deliveries where broadcast_id = p_broadcast loop
    perform realtime.send(
      jsonb_build_object('id', b.id, 'body', b.body, 'play_at', b.play_at,
                         'chime_asset_id', b.chime_asset_id, 'avatar_id', b.avatar_id,
                         'speech_clip_id', b.speech_clip_id),
      'broadcast', 'screen:' || d.screen_id::text, true);
  end loop;
  return b.play_at;
end $$;

create function public.report_broadcast_status(
  p_broadcast uuid, p_status public.delivery_status, p_drift_ms integer default null, p_error text default null)
returns void
language sql security definer set search_path = '' as $$
  update public.broadcast_deliveries
     set status = p_status,
         received_at = coalesce(received_at, now()),
         played_at = case when p_status = 'played' then now() else played_at end,
         drift_ms = coalesce(p_drift_ms, drift_ms), error = p_error
   where broadcast_id = p_broadcast and screen_id = public.current_screen_id();
$$;

-- تعيد الرابط السري مرة واحدة فقط؛ قاعدة البيانات تحفظ بصمته
create function public.create_renter_invite(p_contract uuid, p_max_uses integer default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_token text;
begin
  select * into c from public.contracts where id = p_contract;
  if not found or not public.is_org_member(c.org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.renter_invites (org_id, contract_id, token_hash, max_uses, expires_at)
  values (c.org_id, c.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_max_uses, c.ends_at);
  return jsonb_build_object('token', v_token, 'expires_at', c.ends_at);
end $$;

create function public.redeem_renter_invite(p_token text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.renter_invites; v_rows integer;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '42501'; end if;
  select * into i from public.renter_invites
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or i.revoked_at is not null or i.expires_at <= now() then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.contract_members
             where contract_id = i.contract_id and user_id = auth.uid()) then
    return i.contract_id;
  end if;
  if i.use_count >= i.max_uses then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0002';
  end if;
  insert into public.contract_members (contract_id, user_id, org_id, display_name)
  values (i.contract_id, auth.uid(), i.org_id, p_display_name);
  update public.renter_invites set use_count = use_count + 1 where id = i.id;
  return i.contract_id;
end $$;

-- حالة الشاشات للوحة التحكم (متصلة إذا وصلت نبضة خلال 90 ثانية)
create view public.v_screen_status with (security_invoker = true) as
select s.id, s.org_id, s.name, s.location, s.status, s.last_seen_at, s.app_version,
       s.cached_bytes, s.free_bytes,
       coalesce(s.last_seen_at > now() - interval '90 seconds', false) as is_online,
       c.id as contract_id, c.title as contract_title, c.ends_at as contract_ends_at,
       cl.name as client_name
from public.screens s
left join public.contract_screens cs on cs.screen_id = s.id and cs.is_blocking and now() <@ cs.period
left join public.contracts c on c.id = cs.contract_id
left join public.clients cl on cl.id = c.client_id;

-- ----------------------------------------------------------------------------
-- 10) سياسات RLS
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','organization_members','clients','screens','contracts','media_assets','layouts',
    'avatars','playlists','playlist_items','contract_screens','agenda_items','speech_clips',
    'announcements','schedules','schedule_screens','broadcasts','broadcast_deliveries',
    'screen_commands','contract_members','renter_invites'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- وصول كامل لأعضاء الشركة (الصلاحيات الفعلية مقيدة أيضًا بقسم GRANT)
  foreach t in array array[
    'clients','contracts','media_assets','layouts','avatars','playlists','playlist_items',
    'contract_screens','agenda_items','speech_clips','announcements','schedules','schedule_screens',
    'broadcasts','broadcast_deliveries','screen_commands','contract_members','renter_invites'] loop
    execute format('create policy org_members_all on public.%I for all to authenticated
                    using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
  end loop;
end $$;

create policy org_read on public.organizations for select to authenticated
  using (public.is_org_member(id) or id = public.current_screen_org());
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy members_read on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(org_id));
create policy members_admin on public.organization_members for all to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy screens_read on public.screens for select to authenticated
  using (auth_user_id = (select auth.uid()) or public.is_org_member(org_id) or public.is_renter_of_screen(id));
create policy screens_update on public.screens for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy screens_delete on public.screens for delete to authenticated
  using (public.is_org_admin(org_id));

-- قراءة الشاشة
create policy screen_read on public.contracts for select to authenticated using (public.screen_has_contract(id));
create policy screen_read on public.contract_screens for select to authenticated using (screen_id = public.current_screen_id());
create policy screen_read on public.layouts for select to authenticated using (org_id = public.current_screen_org());
create policy screen_read on public.avatars for select to authenticated using (org_id = public.current_screen_org());
create policy screen_read on public.speech_clips for select to authenticated using (org_id = public.current_screen_org());
create policy screen_read on public.media_assets for select to authenticated
  using ((contract_id is null and org_id = public.current_screen_org()) or public.screen_has_contract(contract_id));
create policy screen_read on public.playlists for select to authenticated
  using ((contract_id is null and org_id = public.current_screen_org()) or public.screen_has_contract(contract_id));
create policy screen_read on public.playlist_items for select to authenticated using (public.screen_can_read_playlist(playlist_id));
create policy screen_read on public.agenda_items for select to authenticated using (public.screen_has_contract(contract_id));
create policy screen_read on public.announcements for select to authenticated
  using ((contract_id is null and org_id = public.current_screen_org()) or public.screen_has_contract(contract_id));
create policy screen_read on public.schedules for select to authenticated using (public.screen_has_contract(contract_id));
create policy screen_read on public.schedule_screens for select to authenticated using (screen_id = public.current_screen_id());
create policy screen_read on public.broadcasts for select to authenticated using (public.screen_has_broadcast(id));
create policy screen_read on public.broadcast_deliveries for select to authenticated using (screen_id = public.current_screen_id());
create policy screen_read on public.screen_commands for select to authenticated using (screen_id = public.current_screen_id());

-- المستأجر: قراءة عقده، وتعديل النصوص والصور والأجندة خلال فترة الإيجار فقط
create policy renter_read on public.contracts for select to authenticated using (public.is_contract_member(id));
create policy renter_read on public.contract_screens for select to authenticated using (public.is_contract_member(contract_id));
create policy renter_self on public.contract_members for select to authenticated using (user_id = (select auth.uid()));
create policy renter_read on public.playlists for select to authenticated using (public.is_contract_member(contract_id));
create policy renter_read on public.media_assets for select to authenticated using (public.is_contract_member(contract_id));
create policy renter_read on public.agenda_items for select to authenticated using (public.is_contract_member(contract_id));
create policy renter_read on public.playlist_items for select to authenticated
  using (public.is_contract_member(public.playlist_contract(playlist_id)));

create policy renter_insert on public.media_assets for insert to authenticated
  with check (kind = 'image' and public.can_renter_edit(contract_id));
create policy renter_delete on public.media_assets for delete to authenticated
  using (kind = 'image' and public.can_renter_edit(contract_id));
create policy renter_write on public.agenda_items for all to authenticated
  using (public.can_renter_edit(contract_id)) with check (public.can_renter_edit(contract_id));

create policy renter_write on public.playlist_items for all to authenticated
  using (kind in ('image', 'text') and public.can_renter_edit(public.playlist_contract(playlist_id)))
  with check (
    kind in ('image', 'text')
    and public.can_renter_edit(public.playlist_contract(playlist_id))
    and (asset_id is null or exists (
          select 1 from public.media_assets a
          where a.id = asset_id and a.kind = 'image'
            and a.contract_id = public.playlist_contract(playlist_id))));

-- ----------------------------------------------------------------------------
-- 11) الصلاحيات على مستوى الأعمدة والدوال
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke insert, delete on public.organizations from authenticated;
revoke update on public.organizations from authenticated;
grant  update (name, contact_phone, default_timezone, fallback_headline, fallback_playlist_id, fallback_layout_id)
  on public.organizations to authenticated;

revoke insert, update on public.screens from authenticated;
grant  update (name, location, status) on public.screens to authenticated;

revoke insert, update, delete on public.speech_clips, public.broadcasts, public.broadcast_deliveries from authenticated;
revoke update, delete on public.screen_commands from authenticated;
revoke insert, update, delete on public.renter_invites from authenticated;
grant  update (revoked_at) on public.renter_invites to authenticated;
revoke insert, update on public.contract_members from authenticated;
revoke update on public.contract_screens from authenticated;
grant  update (layout_id, playlist_id, avatar_id) on public.contract_screens to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function
  public.is_org_member(uuid), public.is_org_admin(uuid), public.current_screen_id(), public.current_screen_org(),
  public.screen_has_contract(uuid), public.is_contract_member(uuid), public.can_renter_edit(uuid),
  public.is_renter_of_screen(uuid), public.playlist_contract(uuid), public.screen_can_read_playlist(uuid),
  public.screen_has_broadcast(uuid), public.storage_can_read(text), public.storage_can_write(text),
  public.realtime_can_read(text), public.realtime_can_send(text),
  public.create_organization(text), public.request_pairing_code(), public.claim_screen(uuid, text, text, text),
  public.get_server_time(), public.screen_heartbeat(text, bigint, bigint, jsonb), public.ack_screen_command(uuid, boolean),
  public.get_or_create_speech_clip(uuid, text, public.voice_provider, text, public.video_provider, text, text),
  public.create_broadcast(uuid, text, uuid, uuid[], uuid, uuid), public.dispatch_broadcast(uuid, uuid, integer),
  public.report_broadcast_status(uuid, public.delivery_status, integer, text),
  public.create_renter_invite(uuid, integer), public.redeem_renter_invite(text, text)
to authenticated;

-- ----------------------------------------------------------------------------
-- 12) التخزين و Realtime
-- ----------------------------------------------------------------------------
-- الحد 50MB يناسب الخطة المجانية. في خطة Pro ارفع الحد العام ثم حدّث file_size_limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm',
              'audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.storage_can_read(name));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.storage_can_write(name));
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.storage_can_write(name))
  with check (bucket_id = 'media' and public.storage_can_write(name));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.storage_can_write(name));

create policy screen_channel_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.realtime_can_read((select realtime.topic())));
create policy screen_channel_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.realtime_can_send((select realtime.topic())));

-- تحديثات لوحة التحكم: حالة الشاشات وتأكيدات النداء
alter publication supabase_realtime add table public.screens, public.broadcast_deliveries;

commit;
