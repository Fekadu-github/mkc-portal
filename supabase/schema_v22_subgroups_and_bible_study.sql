-- MKC Amanuel Local Church — schema v22
-- Adds:
--   1) Worship & Choir sub-groups (Worship, A Choir, B Choir, Shalom Choir) — a member can
--      belong to more than one.
--   2) A Small Group Bible Study module: small_groups (with a leader), small_group_members
--      (one small group per member), and per-meeting attendance so the Members list can show
--      a green / red / yellow status.
-- Run this whole file in the Supabase SQL Editor after schema_v21.

-- ============================================================
-- 1) Worship & Choir sub-groups
-- ============================================================
create table if not exists public.department_subgroups (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (department_id, name)
);
create index if not exists department_subgroups_department_idx on public.department_subgroups(department_id);

create table if not exists public.person_subgroups (
  person_id uuid not null references public.people(id) on delete cascade,
  subgroup_id uuid not null references public.department_subgroups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, subgroup_id)
);
create index if not exists person_subgroups_subgroup_idx on public.person_subgroups(subgroup_id);

-- Seed the four Worship & Choir sub-groups (matches the department name used in portal.js DEPTS)
insert into public.department_subgroups(department_id, name, sort_order)
select d.id, x.name, x.sort_order
from public.departments d
cross join (values ('Worship',1),('A Choir',2),('B Choir',3),('Shalom Choir',4)) as x(name, sort_order)
where d.name = 'Worship & Choir'
on conflict (department_id, name) do nothing;

-- ============================================================
-- 2) Small Group Bible Study
-- ============================================================
-- A dedicated department so a department_user can be assigned to lead/manage this ministry,
-- same pattern as every other ministry in this portal.
insert into public.departments(name, description)
values ('Small Group Bible Study', 'Cell-based Bible study small groups')
on conflict (name) do nothing;

create table if not exists public.small_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department_id uuid references public.departments(id) on delete set null,
  leader_person_id uuid references public.people(id) on delete set null,
  leader_name text,
  meeting_day text,
  meeting_time text,
  location text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.small_group_members (
  small_group_id uuid not null references public.small_groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  joined_at date not null default current_date,
  primary key (small_group_id, person_id)
);
-- A member belongs to at most one small group at a time.
create unique index if not exists small_group_members_one_group_idx on public.small_group_members(person_id);
create index if not exists small_group_members_group_idx on public.small_group_members(small_group_id);

create table if not exists public.small_group_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  small_group_id uuid not null references public.small_groups(id) on delete cascade,
  session_date date not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (small_group_id, session_date)
);
create index if not exists small_group_sessions_group_idx on public.small_group_attendance_sessions(small_group_id);
create index if not exists small_group_sessions_date_idx on public.small_group_attendance_sessions(session_date);

create table if not exists public.small_group_attendance_records (
  session_id uuid not null references public.small_group_attendance_sessions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  present boolean not null default false,
  primary key (session_id, person_id)
);
create index if not exists small_group_records_person_idx on public.small_group_attendance_records(person_id);

drop trigger if exists small_groups_set_updated_at on public.small_groups;
create trigger small_groups_set_updated_at before update on public.small_groups
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.department_subgroups enable row level security;
alter table public.person_subgroups enable row level security;
alter table public.small_groups enable row level security;
alter table public.small_group_members enable row level security;
alter table public.small_group_attendance_sessions enable row level security;
alter table public.small_group_attendance_records enable row level security;

drop policy if exists department_subgroups_read on public.department_subgroups;
drop policy if exists department_subgroups_manage on public.department_subgroups;
create policy department_subgroups_read on public.department_subgroups for select to authenticated using (true);
create policy department_subgroups_manage on public.department_subgroups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists person_subgroups_read on public.person_subgroups;
drop policy if exists person_subgroups_manage on public.person_subgroups;
create policy person_subgroups_read on public.person_subgroups for select to authenticated using (
  public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);
create policy person_subgroups_manage on public.person_subgroups for all to authenticated using (
  public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
) with check (
  public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);

drop policy if exists small_groups_read on public.small_groups;
drop policy if exists small_groups_manage on public.small_groups;
create policy small_groups_read on public.small_groups for select to authenticated using (
  active = true or public.is_admin()
);
create policy small_groups_manage on public.small_groups for all to authenticated using (
  public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id())
) with check (
  public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id())
);

drop policy if exists small_group_members_read on public.small_group_members;
drop policy if exists small_group_members_manage on public.small_group_members;
create policy small_group_members_read on public.small_group_members for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.small_groups sg where sg.id = small_group_members.small_group_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);
create policy small_group_members_manage on public.small_group_members for all to authenticated using (
  public.is_admin()
  or exists (select 1 from public.small_groups sg where sg.id = small_group_members.small_group_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
) with check (
  public.is_admin()
  or exists (select 1 from public.small_groups sg where sg.id = small_group_members.small_group_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
);

drop policy if exists small_group_attendance_sessions_read on public.small_group_attendance_sessions;
drop policy if exists small_group_attendance_sessions_manage on public.small_group_attendance_sessions;
create policy small_group_attendance_sessions_read on public.small_group_attendance_sessions for select to authenticated using (true);
create policy small_group_attendance_sessions_manage on public.small_group_attendance_sessions for all to authenticated using (
  public.is_admin()
  or exists (select 1 from public.small_groups sg where sg.id = small_group_attendance_sessions.small_group_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
) with check (
  public.is_admin()
  or exists (select 1 from public.small_groups sg where sg.id = small_group_attendance_sessions.small_group_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
);

drop policy if exists small_group_attendance_records_read on public.small_group_attendance_records;
drop policy if exists small_group_attendance_records_manage on public.small_group_attendance_records;
create policy small_group_attendance_records_read on public.small_group_attendance_records for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.small_group_attendance_sessions s join public.small_groups sg on sg.id = s.small_group_id
             where s.id = small_group_attendance_records.session_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);
create policy small_group_attendance_records_manage on public.small_group_attendance_records for all to authenticated using (
  public.is_admin()
  or exists (select 1 from public.small_group_attendance_sessions s join public.small_groups sg on sg.id = s.small_group_id
             where s.id = small_group_attendance_records.session_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
) with check (
  public.is_admin()
  or exists (select 1 from public.small_group_attendance_sessions s join public.small_groups sg on sg.id = s.small_group_id
             where s.id = small_group_attendance_records.session_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
);

-- Done. Verify in Supabase: Table Editor should show department_subgroups (4 rows seeded under
-- "Worship & Choir"), person_subgroups, small_groups (1 seed department "Small Group Bible
-- Study" created), small_group_members, small_group_attendance_sessions,
-- small_group_attendance_records — all with RLS enabled.
