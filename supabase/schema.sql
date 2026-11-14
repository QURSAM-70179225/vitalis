-- =============================================================================
-- VITALIS: Supabase schema (run once in the Supabase SQL editor)
--
-- Passwords are handled by Supabase Auth (hashed). These tables never store them.
-- Row Level Security:
--   * astronauts read/write only their own health data
--   * the Crew Medical Officer (cmo) and ground team read their mission's crew
--   * journal entries are readable by their owner ONLY
--   * roles are assigned by the invite code used to join a mission, not self-declared
-- =============================================================================

-- No extensions needed: gen_random_uuid() is built into PostgreSQL 13+.

-- ---------------------------------------------------------------------------
-- Missions & profiles
-- ---------------------------------------------------------------------------
create table if not exists public.missions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  environment_id text not null check (environment_id in ('iss','gateway','lunar-surface','mars-transit','mars-surface','rover')),
  start_date     timestamptz not null default now(),
  crew_code      text not null unique,
  ground_code    text not null unique,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'Astronaut' check (char_length(name) between 1 and 80),
  callsign    text not null default 'CREW' check (char_length(callsign) between 1 and 20),
  color       text not null default '#22d3ee',
  role        text not null default 'astronaut' check (role in ('astronaut','cmo','ground')),
  mission_id  uuid references public.missions(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_mission_idx on public.profiles(mission_id);

-- Auto-create a profile when someone signs up (name/callsign from sign-up metadata).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, callsign)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Astronaut'),
    upper(coalesce(nullif(new.raw_user_meta_data->>'callsign', ''), 'CREW'))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can read profiles safely)
-- ---------------------------------------------------------------------------
create or replace function public.my_mission() returns uuid
language sql stable security definer set search_path = public as $$
  select mission_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Can the current user read health data belonging to `target`?
create or replace function public.can_read_crew(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or (
        public.my_role() in ('cmo','ground')
        and exists (select 1 from public.profiles p where p.id = target and p.mission_id = public.my_mission() and p.mission_id is not null)
      )
$$;

-- 8-character invite code from the first 6 (fully random) bytes of a v4 UUID.
-- Uses only built-in functions, so it works on Supabase where pgcrypto lives in
-- the "extensions" schema (gen_random_bytes is not on the search path there).
create or replace function public.random_code() returns text
language sql volatile set search_path = public, pg_catalog as $$
  select upper(substr(translate(encode(uuid_send(gen_random_uuid()), 'base64'), '+/=0O1Il', 'XYZ23456'), 1, 8))
$$;

-- Create a mission. The creator joins it as astronaut, cmo or ground (e.g. a ground admin).
create or replace function public.create_mission(p_name text, p_environment text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('astronaut','cmo','ground') then raise exception 'invalid role'; end if;
  insert into public.missions (name, environment_id, crew_code, ground_code, created_by)
  values (p_name, p_environment, public.random_code(), public.random_code(), auth.uid())
  returning id into m;
  update public.profiles set mission_id = m, role = p_role where id = auth.uid();
  return m;
end $$;

-- Join with an invite code. Crew code → astronaut (or cmo); ground code → ground.
create or replace function public.join_mission(p_code text, p_as_cmo boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.missions%rowtype; r text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.missions where crew_code = upper(trim(p_code)) or ground_code = upper(trim(p_code));
  if not found then raise exception 'invalid invite code'; end if;
  r := case when m.ground_code = upper(trim(p_code)) then 'ground' when p_as_cmo then 'cmo' else 'astronaut' end;
  update public.profiles set mission_id = m.id, role = r where id = auth.uid();
  return m.id;
end $$;

-- Invite codes are only visible to the mission creator and the ground team.
create or replace function public.mission_codes()
returns table (crew_code text, ground_code text) language sql stable security definer set search_path = public as $$
  select m.crew_code, m.ground_code from public.missions m
  where m.id = public.my_mission() and (m.created_by = auth.uid() or public.my_role() = 'ground')
$$;

-- ---------------------------------------------------------------------------
-- Health data (ids are generated on the device so offline writes can be synced idempotently)
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  id          text primary key,
  crew_id     uuid not null references public.profiles(id) on delete cascade,
  mission_id  uuid not null references public.missions(id) on delete cascade,
  day         int  not null,
  ts          timestamptz not null,
  vals        jsonb not null default '{}',
  symptoms    text[] not null default '{}',
  notes       text,
  source      text not null default 'manual',
  created_at  timestamptz not null default now()
);

create table if not exists public.cognitive_results (
  id           text primary key,
  crew_id      uuid not null references public.profiles(id) on delete cascade,
  mission_id   uuid not null references public.missions(id) on delete cascade,
  day          int not null,
  ts           timestamptz not null,
  mean_rt      int not null,
  median_rt    int not null,
  lapses       int not null,
  false_starts int not null,
  trials       int not null
);

-- Owner-only: never readable by the CMO or ground.
create table if not exists public.journal_entries (
  id             text primary key,
  crew_id        uuid not null references public.profiles(id) on delete cascade,
  day            int not null,
  ts             timestamptz not null,
  mood           int not null,
  note           text not null default '',
  wellbeing      int not null,
  answers        int[] not null default '{}',
  connected_home boolean not null default false
);

-- 1-minute aggregates from sensors (suit, Bluetooth devices).
create table if not exists public.vital_samples (
  id          text primary key,
  crew_id     uuid not null references public.profiles(id) on delete cascade,
  mission_id  uuid not null references public.missions(id) on delete cascade,
  ts          timestamptz not null,
  channels    jsonb not null,
  sources     text[] not null default '{}'
);
create index if not exists vital_samples_crew_ts on public.vital_samples(crew_id, ts desc);

-- Alerts computed by the on-board triage engine.
create table if not exists public.alerts (
  id               text primary key,
  crew_id          uuid not null references public.profiles(id) on delete cascade,
  mission_id       uuid not null references public.missions(id) on delete cascade,
  day              int not null,
  level            text not null check (level in ('nominal','monitor','act','critical')),
  rule_id          text not null,
  title            text not null,
  why              text[] not null default '{}',
  actions          text[] not null default '{}',
  source           text not null default 'triage',
  created_at       timestamptz not null default now(),
  acknowledged_by  uuid references public.profiles(id),
  acknowledged_at  timestamptz
);
create index if not exists alerts_mission_idx on public.alerts(mission_id, created_at desc);

create table if not exists public.packets (
  id               text primary key,
  crew_id          uuid not null references public.profiles(id) on delete cascade,
  mission_id       uuid not null references public.missions(id) on delete cascade,
  day              int not null,
  created_at       timestamptz not null,
  overall          text not null,
  summary          text not null,
  top_rule         text,
  raw_bytes        int not null,
  compressed_bytes int not null,
  payload          jsonb not null
);

-- Messages from the ground team / CMO to a crew member.
create table if not exists public.ground_messages (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references public.missions(id) on delete cascade,
  crew_id     uuid not null references public.profiles(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  body        text not null check (char_length(body) between 1 and 4000),
  packet_id   text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create table if not exists public.mission_events (
  id          text primary key,
  mission_id  uuid not null references public.missions(id) on delete cascade,
  day         int not null,
  type        text not null,
  label       text not null,
  crew_ids    uuid[] not null default '{}'
);

-- Acknowledge an alert (cmo / ground only).
create or replace function public.acknowledge_alert(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('cmo','ground') then raise exception 'not allowed'; end if;
  update public.alerts set acknowledged_by = auth.uid(), acknowledged_at = now()
  where id = p_id and mission_id = public.my_mission();
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.missions          enable row level security;
alter table public.profiles          enable row level security;
alter table public.check_ins         enable row level security;
alter table public.cognitive_results enable row level security;
alter table public.journal_entries   enable row level security;
alter table public.vital_samples     enable row level security;
alter table public.alerts            enable row level security;
alter table public.packets           enable row level security;
alter table public.ground_messages   enable row level security;
alter table public.mission_events    enable row level security;

-- Missions: members can read (invite codes hidden by column grants below).
drop policy if exists missions_read on public.missions;
create policy missions_read on public.missions for select to authenticated using (id = public.my_mission());

-- Profiles: everyone in the mission can see names/callsigns/roles; edit only yourself.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (mission_id is not null and mission_id = public.my_mission()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Health data tables: own rows writable; readable per can_read_crew().
do $$
declare t text;
begin
  foreach t in array array['check_ins','cognitive_results','vital_samples','alerts','packets'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.can_read_crew(crew_id))', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (crew_id = auth.uid() and mission_id = public.my_mission())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (crew_id = auth.uid()) with check (crew_id = auth.uid() and mission_id = public.my_mission())', t);
  end loop;
end $$;

drop policy if exists journal_own on public.journal_entries;
create policy journal_own on public.journal_entries for all to authenticated using (crew_id = auth.uid()) with check (crew_id = auth.uid());

drop policy if exists messages_read on public.ground_messages;
create policy messages_read on public.ground_messages for select to authenticated
  using (crew_id = auth.uid() or (public.my_role() in ('cmo','ground') and mission_id = public.my_mission()));
drop policy if exists messages_insert on public.ground_messages;
create policy messages_insert on public.ground_messages for insert to authenticated
  with check (author_id = auth.uid() and mission_id = public.my_mission() and public.my_role() in ('cmo','ground')
              and exists (select 1 from public.profiles p where p.id = crew_id and p.mission_id = public.my_mission()));
drop policy if exists messages_mark_read on public.ground_messages;
create policy messages_mark_read on public.ground_messages for update to authenticated using (crew_id = auth.uid()) with check (crew_id = auth.uid());

drop policy if exists events_read on public.mission_events;
create policy events_read on public.mission_events for select to authenticated using (mission_id = public.my_mission());
drop policy if exists events_write on public.mission_events;
create policy events_write on public.mission_events for insert to authenticated with check (mission_id = public.my_mission());

-- Column-level privileges: users cannot change their own role or mission directly,
-- cannot read invite codes, and can only flag messages as read.
revoke all on public.missions from anon, authenticated;
grant select (id, name, environment_id, start_date, created_by, created_at) on public.missions to authenticated;
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, callsign, color) on public.profiles to authenticated;
revoke update on public.ground_messages from anon, authenticated;
grant select, insert on public.ground_messages to authenticated;
grant update (read_at) on public.ground_messages to authenticated;
revoke update on public.alerts from anon, authenticated;
grant select, insert on public.alerts to authenticated;
-- upsert needs update on the written columns; acknowledgement columns stay RPC-only
grant update (crew_id, mission_id, day, level, rule_id, title, why, actions, source, created_at) on public.alerts to authenticated;
grant select, insert, update on public.check_ins, public.cognitive_results, public.vital_samples, public.packets to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert on public.mission_events to authenticated;
revoke all on function public.create_mission(text, text, text) from public, anon;
revoke all on function public.join_mission(text, boolean) from public, anon;
revoke all on function public.acknowledge_alert(text) from public, anon;
revoke all on function public.mission_codes() from public, anon;
grant execute on function public.create_mission(text, text, text), public.join_mission(text, boolean),
  public.acknowledge_alert(text), public.mission_codes(), public.my_mission(), public.my_role(), public.can_read_crew(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: ground console gets live alerts, check-ins and vitals; crew gets messages.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.alerts;          exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.ground_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.check_ins;       exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.vital_samples;   exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.packets;         exception when duplicate_object then null; end;
  end if;
end $$;
