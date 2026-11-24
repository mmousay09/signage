-- تسجيل الحضور بمسح البطاقة، والمساعد الصوتي (أسئلة الزوار وإجابات الذكاء الاصطناعي)
begin;

alter table public.contracts
  add column checkin_enabled   boolean not null default false,
  add column assistant_ai      boolean not null default false,
  add column assistant_context text check (length(assistant_context) <= 4000);

-- ===== تسجيل الحضور =====
-- من الشاشة (إن فُعّل للعقد) أو من لوحة التحكم لمن يحق له التعديل.
-- p_at وقت المسح الفعلي، فتُقبل عمليات المسح المحفوظة دون إنترنت بوقتها الصحيح
create function public.check_in_guest(p_contract uuid, p_code text, p_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contracts;
  g public.guests;
  v_screen uuid := public.current_screen_id();
  v_at timestamptz := least(coalesce(p_at, now()), now());
begin
  select * into c from public.contracts where id = p_contract;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_screen is not null then
    if not public.screen_has_contract(c.id) or not (c.interactive and c.checkin_enabled) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif not public.is_org_member(c.org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into g from public.guests where badge_code = upper(btrim(p_code));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if g.contract_id <> c.id then
    return jsonb_build_object('status', 'other_event');
  end if;
  if g.checked_in_at is not null then
    return jsonb_build_object('status', 'already', 'full_name', g.full_name,
                              'organization', g.organization, 'checked_in_at', g.checked_in_at);
  end if;

  update public.guests set checked_in_at = v_at where id = g.id;
  return jsonb_build_object('status', 'checked_in', 'full_name', g.full_name,
                            'organization', g.organization, 'checked_in_at', v_at);
end $$;

-- ===== أسئلة الزوار للمساعد =====
-- تُسجَّل كل الأسئلة ليعرف المالك ما يسأل عنه الناس وما لم يجد له جوابًا
create table public.assistant_questions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  contract_id  uuid not null,
  screen_id    uuid references public.screens(id) on delete set null,
  question     text not null check (length(btrim(question)) between 1 and 300),
  language     text not null default 'ar' check (language in ('ar','fr','en')),
  source       text not null check (source in ('match','ai','none')),
  answer_id    uuid references public.assistant_answers(id) on delete set null,
  answer       text check (length(answer) <= 2000),
  created_at   timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete cascade
);
create index on public.assistant_questions (contract_id, created_at desc);
create index on public.assistant_questions (screen_id, created_at desc) where source = 'ai';

alter table public.assistant_questions enable row level security;
create policy org_members_all on public.assistant_questions for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy viewer_read on public.assistant_questions for select to authenticated
  using (public.is_org_reader(org_id));
create policy renter_read on public.assistant_questions for select to authenticated
  using (public.is_contract_member(contract_id));
revoke all on public.assistant_questions from anon, public;
grant select, delete on public.assistant_questions to authenticated;
grant all on public.assistant_questions to service_role;

-- الشاشة تسجل سؤالًا أجابت عنه محليًا (من الأسئلة الجاهزة) أو لم تجد له جوابًا
create function public.log_assistant_question(
  p_contract uuid, p_question text, p_language text, p_source text,
  p_answer_id uuid default null, p_answer text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_screen uuid := public.current_screen_id();
begin
  select * into c from public.contracts where id = p_contract;
  if v_screen is null or not found or not public.screen_has_contract(c.id) or p_source not in ('match','none') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.assistant_questions (org_id, contract_id, screen_id, question, language, source, answer_id, answer)
  values (c.org_id, c.id, v_screen, left(btrim(p_question), 300), coalesce(p_language, 'ar'), p_source,
          (select a.id from public.assistant_answers a where a.id = p_answer_id and a.contract_id = c.id),
          left(p_answer, 2000));
end $$;

-- خادم المساعد يستدعيها بجلسة الشاشة قبل سؤال الذكاء الاصطناعي:
-- تتحقق من الصلاحية وحد الاستهلاك (60 سؤالًا في الساعة لكل شاشة)، وتعيد معلومات الفعالية
create function public.begin_ai_question(p_contract uuid, p_question text, p_language text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contracts;
  v_screen uuid := public.current_screen_id();
  v_id uuid;
begin
  select * into c from public.contracts where id = p_contract;
  if v_screen is null or not found or not public.screen_has_contract(c.id)
     or not (c.interactive and c.assistant_enabled and c.assistant_ai) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.assistant_questions q
      where q.screen_id = v_screen and q.source = 'ai' and q.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'quota_exceeded';
  end if;

  insert into public.assistant_questions (org_id, contract_id, screen_id, question, language, source)
  values (c.org_id, c.id, v_screen, left(btrim(p_question), 300), coalesce(p_language, 'ar'), 'ai')
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'assistant', coalesce(nullif(btrim(c.assistant_name), ''), 'المساعد'),
    'event', c.title,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'host', (select o.name from public.organizations o where o.id = c.org_id),
    'contact_phone', (select o.contact_phone from public.organizations o where o.id = c.org_id),
    'notes', c.assistant_context,
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('title', g.title, 'speaker', g.speaker, 'place', g.place,
                                          'starts_at', g.starts_at, 'ends_at', g.ends_at)
                       order by g.starts_at)
      from public.agenda_items g where g.contract_id = c.id), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('question', a.question, 'answer', a.answer) order by a.position)
      from public.assistant_answers a where a.contract_id = c.id), '[]'::jsonb));
end $$;

create function public.finish_ai_question(p_id uuid, p_answer text) returns void
language sql security definer set search_path = '' as $$
  update public.assistant_questions q set answer = left(p_answer, 2000)
  where q.id = p_id and q.source = 'ai' and q.answer is null
    and q.screen_id = public.current_screen_id();
$$;

-- ===== البيان: الحضور والذكاء الاصطناعي ضمن الوضع التفاعلي =====
create or replace function public.kiosk_json(p_contract uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not c.interactive then null else jsonb_build_object(
    'languages', to_jsonb(c.languages),
    'registration', c.registration_enabled,
    'checkin', c.checkin_enabled,
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
      'ai', c.assistant_ai,
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

revoke all on function public.check_in_guest(uuid, text, timestamptz),
  public.log_assistant_question(uuid, text, text, text, uuid, text),
  public.begin_ai_question(uuid, text, text),
  public.finish_ai_question(uuid, text) from public, anon, authenticated;
grant execute on function public.check_in_guest(uuid, text, timestamptz),
  public.log_assistant_question(uuid, text, text, text, uuid, text),
  public.begin_ai_question(uuid, text, text),
  public.finish_ai_question(uuid, text) to authenticated;

commit;
