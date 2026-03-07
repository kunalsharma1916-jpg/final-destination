-- 0001_init.sql
create extension if not exists pgcrypto;
create extension if not exists unaccent;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  team_code text unique not null,
  budget integer not null default 10000,
  current_stage integer not null default 1,
  is_active boolean not null default true,
  last_submit_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.stages (
  stage_no integer primary key,
  country text,
  location_name text,
  lat double precision not null,
  lng double precision not null,
  clue_text text not null,
  hint_question text,
  hint_answers text,
  main_question text not null,
  main_answers text not null,
  reward_hint integer not null default 200,
  reward_main integer not null default 1000,
  penalty_wrong integer not null default -500,
  time_limit_sec integer
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  stage_no integer not null,
  answer_type text not null check (answer_type in ('HINT', 'MAIN', 'ADMIN', 'SYSTEM')),
  answer_raw text not null,
  answer_norm text not null,
  is_correct boolean not null,
  delta integer not null,
  reverted boolean not null default false,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.event_state (
  id integer primary key default 1,
  is_live boolean not null default false,
  global_stage_unlock integer not null default 1,
  hint_unlocked_stage integer not null default 0,
  freeze_leaderboard boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint event_state_singleton check (id = 1)
);

insert into public.event_state (id)
values (1)
on conflict (id) do nothing;

create index if not exists submissions_team_created_idx on public.submissions(team_id, created_at desc);
create index if not exists teams_budget_idx on public.teams(budget desc);

create or replace function public.normalize_answer(p text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(lower(unaccent(coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace view public.leaderboard_public as
select
  t.team_name,
  t.budget,
  t.current_stage,
  count(*) filter (
    where s.answer_type in ('HINT', 'MAIN')
      and s.is_correct = false
      and s.reverted = false
  ) as wrong_count,
  max(s.created_at) filter (
    where s.answer_type in ('HINT', 'MAIN')
      and s.is_correct = true
      and s.reverted = false
  ) as last_correct_at
from public.teams t
left join public.submissions s on s.team_id = t.id
group by t.id, t.team_name, t.budget, t.current_stage
order by t.budget desc, t.current_stage desc, last_correct_at asc nulls last;

create or replace function public.submit_answer(
  p_team_id uuid,
  p_answer_type text,
  p_answer_raw text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
  v_state event_state%rowtype;
  v_stage stages%rowtype;
  v_now timestamptz := now();
  v_answer_type text := upper(trim(coalesce(p_answer_type, '')));
  v_answer_norm text;
  v_accepted text;
  v_delta integer;
  v_is_correct boolean := false;
  v_message text;
begin
  if v_answer_type not in ('HINT', 'MAIN') then
    raise exception 'Invalid answer type';
  end if;

  select * into v_state
  from public.event_state
  where id = 1
  for update;

  if not found then
    raise exception 'Event state missing';
  end if;

  if v_state.freeze_leaderboard then
    raise exception 'Leaderboard is frozen';
  end if;

  if not v_state.is_live then
    raise exception 'Event is paused';
  end if;

  select * into v_team
  from public.teams
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  if not v_team.is_active then
    raise exception 'Team is inactive';
  end if;

  if v_team.current_stage > v_state.global_stage_unlock then
    raise exception 'Stage is locked';
  end if;

  if v_team.last_submit_at is not null and v_now < (v_team.last_submit_at + interval '8 seconds') then
    raise exception 'Rate limit: wait before next submission';
  end if;

  select * into v_stage
  from public.stages
  where stage_no = v_team.current_stage;

  if not found then
    raise exception 'Stage not configured';
  end if;

  if v_answer_type = 'HINT' then
    if v_state.hint_unlocked_stage < v_team.current_stage then
      raise exception 'Hint locked';
    end if;
    if v_stage.hint_answers is null then
      raise exception 'Hint unavailable';
    end if;
    v_accepted := v_stage.hint_answers;
  else
    v_accepted := v_stage.main_answers;
  end if;

  v_answer_norm := public.normalize_answer(p_answer_raw);

  with variants as (
    select public.normalize_answer(value) as variant
    from regexp_split_to_table(v_accepted, '\|') as value
  )
  select exists(select 1 from variants where variant = v_answer_norm)
  into v_is_correct;

  if v_is_correct then
    if v_answer_type = 'HINT' then
      v_delta := v_stage.reward_hint;
      v_message := 'Correct hint answer';
    else
      v_delta := v_stage.reward_main;
      v_message := 'Correct main answer';
    end if;
  else
    v_delta := v_stage.penalty_wrong;
    v_message := 'Incorrect answer';
  end if;

  insert into public.submissions (
    team_id,
    stage_no,
    answer_type,
    answer_raw,
    answer_norm,
    is_correct,
    delta,
    reverted,
    meta
  ) values (
    p_team_id,
    v_team.current_stage,
    v_answer_type,
    coalesce(p_answer_raw, ''),
    v_answer_norm,
    v_is_correct,
    v_delta,
    false,
    coalesce(p_meta, '{}'::jsonb)
  );

  update public.teams
  set
    budget = budget + v_delta,
    current_stage = case
      when v_is_correct and v_answer_type = 'MAIN' then current_stage + 1
      else current_stage
    end,
    last_submit_at = v_now
  where id = p_team_id
  returning * into v_team;

  return jsonb_build_object(
    'ok', true,
    'is_correct', v_is_correct,
    'delta', v_delta,
    'new_budget', v_team.budget,
    'new_stage', v_team.current_stage,
    'message', v_message
  );
end;
$$;

create or replace function public.admin_adjust_budget(
  p_team_id uuid,
  p_delta int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
begin
  select * into v_team
  from public.teams
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  update public.teams
  set budget = budget + p_delta
  where id = p_team_id
  returning * into v_team;

  insert into public.submissions (
    team_id,
    stage_no,
    answer_type,
    answer_raw,
    answer_norm,
    is_correct,
    delta,
    reverted,
    meta
  ) values (
    p_team_id,
    v_team.current_stage,
    'ADMIN',
    coalesce(p_reason, 'budget_adjustment'),
    public.normalize_answer(coalesce(p_reason, 'budget_adjustment')),
    true,
    p_delta,
    false,
    jsonb_build_object('action', 'adjust_budget', 'reason', p_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'new_budget', v_team.budget,
    'team_id', p_team_id
  );
end;
$$;

create or replace function public.admin_set_stage(
  p_team_id uuid,
  p_new_stage int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
begin
  if p_new_stage < 1 then
    raise exception 'Stage must be >= 1';
  end if;

  select * into v_team
  from public.teams
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  update public.teams
  set current_stage = p_new_stage
  where id = p_team_id
  returning * into v_team;

  insert into public.submissions (
    team_id,
    stage_no,
    answer_type,
    answer_raw,
    answer_norm,
    is_correct,
    delta,
    reverted,
    meta
  ) values (
    p_team_id,
    p_new_stage,
    'ADMIN',
    coalesce(p_reason, 'set_stage'),
    public.normalize_answer(coalesce(p_reason, 'set_stage')),
    true,
    0,
    false,
    jsonb_build_object('action', 'set_stage', 'reason', p_reason, 'new_stage', p_new_stage)
  );

  return jsonb_build_object(
    'ok', true,
    'new_stage', v_team.current_stage,
    'team_id', p_team_id
  );
end;
$$;

create or replace function public.admin_revert_last_submission(
  p_team_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
  v_sub submissions%rowtype;
  v_new_budget integer;
  v_new_stage integer;
begin
  select * into v_team
  from public.teams
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  select * into v_sub
  from public.submissions
  where team_id = p_team_id
    and answer_type in ('HINT', 'MAIN')
    and reverted = false
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No submission to revert';
  end if;

  update public.submissions
  set reverted = true
  where id = v_sub.id;

  v_new_budget := v_team.budget - v_sub.delta;
  v_new_stage := v_team.current_stage;

  if v_sub.answer_type = 'MAIN' and v_sub.is_correct then
    v_new_stage := greatest(1, v_team.current_stage - 1);
  end if;

  update public.teams
  set
    budget = v_new_budget,
    current_stage = v_new_stage
  where id = p_team_id
  returning * into v_team;

  insert into public.submissions (
    team_id,
    stage_no,
    answer_type,
    answer_raw,
    answer_norm,
    is_correct,
    delta,
    reverted,
    meta
  ) values (
    p_team_id,
    v_team.current_stage,
    'ADMIN',
    coalesce(p_reason, 'revert_submission'),
    public.normalize_answer(coalesce(p_reason, 'revert_submission')),
    true,
    -v_sub.delta,
    false,
    jsonb_build_object(
      'action', 'revert_last_submission',
      'reason', p_reason,
      'reverted_submission_id', v_sub.id,
      'reverted_delta', v_sub.delta,
      'reverted_stage', v_sub.stage_no
    )
  );

  return jsonb_build_object(
    'ok', true,
    'new_budget', v_team.budget,
    'new_stage', v_team.current_stage,
    'reverted_submission_id', v_sub.id
  );
end;
$$;

create or replace function public.admin_update_event_state(
  p_is_live boolean,
  p_freeze_leaderboard boolean,
  p_global_stage_unlock integer,
  p_hint_unlocked_stage integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state event_state%rowtype;
begin
  if p_global_stage_unlock < 1 then
    raise exception 'global_stage_unlock must be >= 1';
  end if;

  if p_hint_unlocked_stage < 0 then
    raise exception 'hint_unlocked_stage must be >= 0';
  end if;

  update public.event_state
  set
    is_live = p_is_live,
    freeze_leaderboard = p_freeze_leaderboard,
    global_stage_unlock = p_global_stage_unlock,
    hint_unlocked_stage = p_hint_unlocked_stage,
    updated_at = now()
  where id = 1
  returning * into v_state;

  if not found then
    raise exception 'Event state missing';
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_state', to_jsonb(v_state)
  );
end;
$$;

create or replace function public.admin_set_team_active(
  p_team_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
begin
  update public.teams
  set is_active = p_is_active
  where id = p_team_id
  returning * into v_team;

  if not found then
    raise exception 'Team not found';
  end if;

  insert into public.submissions (
    team_id,
    stage_no,
    answer_type,
    answer_raw,
    answer_norm,
    is_correct,
    delta,
    reverted,
    meta
  ) values (
    p_team_id,
    v_team.current_stage,
    'ADMIN',
    case when p_is_active then 'team_enabled' else 'team_disabled' end,
    case when p_is_active then 'team enabled' else 'team disabled' end,
    true,
    0,
    false,
    jsonb_build_object('action', 'set_team_active', 'is_active', p_is_active)
  );

  return jsonb_build_object(
    'ok', true,
    'team_id', p_team_id,
    'is_active', v_team.is_active
  );
end;
$$;

-- RLS
alter table public.teams enable row level security;
alter table public.stages enable row level security;
alter table public.submissions enable row level security;
alter table public.event_state enable row level security;

revoke all on table public.teams from anon, authenticated;
revoke all on table public.stages from anon, authenticated;
revoke all on table public.submissions from anon, authenticated;
revoke all on table public.event_state from anon, authenticated;

create policy "public read stages"
on public.stages
for select
to anon, authenticated
using (true);

create policy "public read event_state"
on public.event_state
for select
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select on public.stages to anon, authenticated;
grant select on public.event_state to anon, authenticated;
grant select on public.leaderboard_public to anon, authenticated;

grant execute on function public.normalize_answer(text) to anon, authenticated;
