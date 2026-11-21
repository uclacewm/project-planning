-- CEWM Project Planning: database setup
-- Every table starts with "planning_" so nothing collides with the Center's other pages.
-- Safe to run once in the Supabase SQL editor (or as a migration).

-- ---------------------------------------------------------------
-- Members: who may sign in to this page, and who may edit
-- ---------------------------------------------------------------
create table if not exists public.planning_members (
  email text primary key check (email = lower(email)),
  name text,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now()
);

-- Add people with: insert into public.planning_members (email, name, role) values ('name@mednet.ucla.edu', 'Full Name', 'editor');
-- (The three editors and the shared viewer account were added when this was first applied.)

create or replace function public.planning_email() returns text
language sql stable set search_path = public as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.planning_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planning_members where email = public.planning_email())
$$;

create or replace function public.planning_is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planning_members where email = public.planning_email() and role = 'editor')
$$;

create or replace function public.planning_my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.planning_members where email = public.planning_email()), public.planning_email())
$$;

-- ---------------------------------------------------------------
-- Projects (active, pipeline, standing, archived) and sub-projects
-- ---------------------------------------------------------------
create table if not exists public.planning_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'active' check (category in ('active', 'pipeline', 'standing', 'archived')),
  parent_id uuid references public.planning_projects(id) on delete set null,
  pillar text check (pillar in ('Education', 'Research', 'Clinical', 'Community', 'Global')),
  other_pillars text[] not null default '{}',
  types text[] not null default '{}',
  audiences text[] not null default '{}',
  leads text,
  team text,
  public_description text,
  team_notes text,
  flag text,
  timeline_note text,
  box_url text,
  qualtrics_url text,
  is_placeholder boolean not null default false,
  show_publicly boolean not null default false,
  seeking_support boolean not null default false,
  sort_order int not null default 100,
  depends_on uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Bars on the timeline: one row per stage period
create table if not exists public.planning_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.planning_projects(id) on delete cascade,
  stage text not null check (stage in ('Idea', 'Funding', 'Planning', 'Delivery', 'Wrap-up', 'Ongoing')),
  label text,
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Events: conferences, workshops, talks, gatherings (CEWM or outside)
create table if not exists public.planning_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null check (event_type in ('Conference', 'Workshop', 'Talk', 'Gathering')),
  host text not null default 'CEWM' check (host in ('CEWM', 'Outside')),
  project_ids uuid[] not null default '{}',
  extra_tags text[] not null default '{}',
  start_date date,
  end_date date,
  start_time text,
  when_text text,
  location text,
  tentative boolean not null default false,
  planning_start date,
  lead text,
  attendance int,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Key dates and deadlines (on a project or an event)
create table if not exists public.planning_dates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.planning_projects(id) on delete cascade,
  event_id uuid references public.planning_events(id) on delete cascade,
  on_date date not null,
  label text not null,
  kind text not null default 'key' check (kind in ('key', 'deadline')),
  tentative boolean not null default false,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Meetings: weekly admin meetings and project meetings
create table if not exists public.planning_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'admin' check (kind in ('admin', 'project')),
  project_id uuid references public.planning_projects(id) on delete set null,
  meeting_date date,
  start_time text,
  end_time text,
  location text,
  repeats text check (repeats in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  repeat_until date,
  tentative boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'closed', 'cancelled')),
  summary text,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Notes captured in a meeting, per agenda topic
create table if not exists public.planning_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.planning_meetings(id) on delete cascade,
  project_id uuid references public.planning_projects(id) on delete set null,
  topic text,
  quick_status text check (quick_status in ('No change', 'On track', 'Waiting', 'Blocked', 'Done')),
  update_text text,
  decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Action items
create table if not exists public.planning_actions (
  id uuid primary key default gen_random_uuid(),
  what text not null,
  owner text,
  due_date date,
  project_id uuid references public.planning_projects(id) on delete set null,
  meeting_id uuid references public.planning_meetings(id) on delete set null,
  topic text,
  status text not null default 'open' check (status in ('open', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Impact numbers
create table if not exists public.planning_impact (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.planning_projects(id) on delete cascade,
  tier text not null check (tier in ('Trained', 'Engaged', 'Reached online')),
  count int,
  source text,
  as_of date,
  status text not null default 'Missing' check (status in ('Verified', 'Estimated', 'Missing')),
  note text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Fundraising (editors only)
create table if not exists public.planning_gifts (
  id uuid primary key default gen_random_uuid(),
  donor text not null,
  description text,
  amount_text text,
  stage text not null default 'Cultivating' check (stage in ('Cultivating', 'Proposal', 'Pledged', 'Received', 'Stewardship', 'Closed')),
  project_id uuid references public.planning_projects(id) on delete set null,
  owner text,
  next_step text,
  next_date date,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Change history (written by triggers, never edited by hand)
create table if not exists public.planning_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid,
  action text not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  summary text,
  old_row jsonb,
  new_row jsonb
);

create index if not exists planning_phases_project on public.planning_phases(project_id);
create index if not exists planning_dates_project on public.planning_dates(project_id);
create index if not exists planning_dates_event on public.planning_dates(event_id);
create index if not exists planning_projects_parent on public.planning_projects(parent_id);
create index if not exists planning_meetings_project on public.planning_meetings(project_id);
create index if not exists planning_notes_meeting on public.planning_meeting_notes(meeting_id);
create index if not exists planning_notes_project on public.planning_meeting_notes(project_id);
create index if not exists planning_actions_project on public.planning_actions(project_id);
create index if not exists planning_actions_meeting on public.planning_actions(meeting_id);
create index if not exists planning_impact_project on public.planning_impact(project_id);
create index if not exists planning_gifts_project on public.planning_gifts(project_id);
create index if not exists planning_history_row on public.planning_history(row_id);

-- ---------------------------------------------------------------
-- Triggers: stamp who changed what, and keep a history
-- ---------------------------------------------------------------
create or replace function public.planning_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := public.planning_my_name();
  return new;
end $$;

create or replace function public.planning_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text;
  r jsonb;
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  label := coalesce(r ->> 'name', r ->> 'title', r ->> 'what', r ->> 'label', r ->> 'donor', r ->> 'topic', r ->> 'tier', '');
  insert into public.planning_history (table_name, row_id, action, changed_by, summary, old_row, new_row)
  values (
    tg_table_name,
    (r ->> 'id')::uuid,
    lower(tg_op),
    public.planning_my_name(),
    label,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['planning_projects', 'planning_phases', 'planning_events', 'planning_dates', 'planning_meetings',
                           'planning_meeting_notes', 'planning_actions', 'planning_impact', 'planning_gifts']
  loop
    execute format('drop trigger if exists %I_stamp on public.%I', t, t);
    execute format('create trigger %I_stamp before insert or update on public.%I for each row execute function public.planning_stamp()', t, t);
    execute format('drop trigger if exists %I_log on public.%I', t, t);
    execute format('create trigger %I_log after insert or update or delete on public.%I for each row execute function public.planning_log()', t, t);
  end loop;
end $$;

-- Helper functions are only for policies and triggers; not callable by anonymous users.
revoke execute on function public.planning_is_member(), public.planning_is_editor(), public.planning_my_name(), public.planning_email() from anon, public;
grant execute on function public.planning_is_member(), public.planning_is_editor(), public.planning_my_name(), public.planning_email() to authenticated;
revoke execute on function public.planning_stamp(), public.planning_log() from anon, authenticated, public;

-- ---------------------------------------------------------------
-- Row-level security
-- Members (editors + shared viewer) can read; only editors can write.
-- Fundraising: editors only, for reading too.
-- ---------------------------------------------------------------
alter table public.planning_members enable row level security;
drop policy if exists planning_members_read on public.planning_members;
create policy planning_members_read on public.planning_members for select to authenticated using ((select public.planning_is_member()));

do $$
declare t text;
begin
  foreach t in array array['planning_projects', 'planning_phases', 'planning_events', 'planning_dates', 'planning_meetings',
                           'planning_meeting_notes', 'planning_actions', 'planning_impact']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using ((select public.planning_is_member()))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check ((select public.planning_is_editor()))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using ((select public.planning_is_editor())) with check ((select public.planning_is_editor()))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using ((select public.planning_is_editor()))', t, t);
  end loop;
end $$;

alter table public.planning_gifts enable row level security;
drop policy if exists planning_gifts_all on public.planning_gifts;
create policy planning_gifts_all on public.planning_gifts for all to authenticated
  using ((select public.planning_is_editor())) with check ((select public.planning_is_editor()));

alter table public.planning_history enable row level security;
drop policy if exists planning_history_read on public.planning_history;
create policy planning_history_read on public.planning_history for select to authenticated
  using ((select public.planning_is_editor()) or ((select public.planning_is_member()) and table_name <> 'planning_gifts'));

-- ---------------------------------------------------------------
-- Live updates: editors see each other's changes as they happen
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['planning_projects', 'planning_phases', 'planning_events', 'planning_dates', 'planning_meetings',
                           'planning_meeting_notes', 'planning_actions', 'planning_impact', 'planning_gifts']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Private storage for the licensed brand fonts (members only)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('planning-assets', 'planning-assets', false)
on conflict (id) do nothing;

drop policy if exists planning_assets_read on storage.objects;
create policy planning_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'planning-assets' and (select public.planning_is_member()));

drop policy if exists planning_assets_write on storage.objects;
create policy planning_assets_write on storage.objects for all to authenticated
  using (bucket_id = 'planning-assets' and (select public.planning_is_editor()))
  with check (bucket_id = 'planning-assets' and (select public.planning_is_editor()));

-- ---------------------------------------------------------------
-- Table access for signed-in users only (this project doesn't grant it automatically).
-- Row-level security above still decides who sees and changes what.
-- ---------------------------------------------------------------
revoke all on public.planning_members, public.planning_projects, public.planning_phases, public.planning_events,
  public.planning_dates, public.planning_meetings, public.planning_meeting_notes, public.planning_actions,
  public.planning_impact, public.planning_gifts, public.planning_history from anon;
grant select on public.planning_members to authenticated;
grant select, insert, update, delete on public.planning_projects, public.planning_phases, public.planning_events,
  public.planning_dates, public.planning_meetings, public.planning_meeting_notes, public.planning_actions,
  public.planning_impact, public.planning_gifts to authenticated;
grant select on public.planning_history to authenticated;

-- ---------------------------------------------------------------
-- People: the Center roster used for Lead and Owner lists (members only)
-- ---------------------------------------------------------------
create table if not exists public.planning_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  team text not null default 'Faculty' check (team in ('Faculty', 'Fellows', 'Acupuncturists', 'Administration', 'Other')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.planning_people enable row level security;
drop policy if exists planning_people_read on public.planning_people;
drop policy if exists planning_people_insert on public.planning_people;
drop policy if exists planning_people_update on public.planning_people;
drop policy if exists planning_people_delete on public.planning_people;
create policy planning_people_read on public.planning_people for select to authenticated using ((select public.planning_is_member()));
create policy planning_people_insert on public.planning_people for insert to authenticated with check ((select public.planning_is_editor()));
create policy planning_people_update on public.planning_people for update to authenticated using ((select public.planning_is_editor())) with check ((select public.planning_is_editor()));
create policy planning_people_delete on public.planning_people for delete to authenticated using ((select public.planning_is_editor()));
revoke all on public.planning_people from anon;
grant select, insert, update, delete on public.planning_people to authenticated;
drop trigger if exists planning_people_stamp on public.planning_people;
create trigger planning_people_stamp before insert or update on public.planning_people for each row execute function public.planning_stamp();
drop trigger if exists planning_people_log on public.planning_people;
create trigger planning_people_log after insert or update or delete on public.planning_people for each row execute function public.planning_log();
-- (Roster rows were loaded separately; they are not stored in this repository.)
