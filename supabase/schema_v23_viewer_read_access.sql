-- MKC Amanuel Local Church — schema v23
-- Fixes a gap where the 'viewer' role (created by the on_auth_user_created
-- trigger as the default role for every new auth user) had NO read access
-- to people/family/subgroup data at all. The app's UI already treats viewer
-- as "read everything, write nothing", but the RLS policies only ever
-- checked is_admin() (super_admin/secretary/pastor) or department_user.
-- This migration ONLY adds SELECT access for viewer — it does not touch any
-- insert/update/delete policy, so viewers still cannot add, edit, delete,
-- or manage anything.
-- Run this whole file in the Supabase SQL Editor after schema_v22.

-- ============================================================
-- people, families, family_members, person_departments
-- ============================================================
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using(
  public.is_admin()
  or public.current_role()='viewer'
  or (
    public.current_role()='department_user'
    and public.person_is_in_current_department(id)
  )
);

drop policy if exists families_read on public.families;
create policy families_read on public.families for select to authenticated using(
  public.is_admin()
  or public.current_role()='viewer'
  or exists(select 1 from public.people p where p.family_id=families.id and public.current_role()='department_user' and p.department_id=public.current_department_id())
);

drop policy if exists family_members_read on public.family_members;
create policy family_members_read on public.family_members for select to authenticated using(
  public.is_admin()
  or public.current_role()='viewer'
  or exists(select 1 from public.people p where p.id=family_members.person_id and p.department_id=public.current_department_id() and public.current_role()='department_user')
);

drop policy if exists person_departments_read on public.person_departments;
create policy person_departments_read on public.person_departments for select to authenticated using(
  public.is_admin()
  or public.current_role()='viewer'
  or (public.current_role()='department_user' and department_id=public.current_department_id() and public.person_is_in_current_department(person_id))
);

-- ============================================================
-- Worship & Choir sub-groups + Small Group Bible Study
-- (so the Choir/Worship column and Bible Study status dot are accurate
--  for viewers too, not just blank/red)
-- ============================================================
drop policy if exists person_subgroups_read on public.person_subgroups;
create policy person_subgroups_read on public.person_subgroups for select to authenticated using (
  public.is_admin()
  or public.current_role()='viewer'
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);

drop policy if exists small_group_members_read on public.small_group_members;
create policy small_group_members_read on public.small_group_members for select to authenticated using (
  public.is_admin()
  or public.current_role()='viewer'
  or exists (select 1 from public.small_groups sg where sg.id = small_group_members.small_group_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);

drop policy if exists small_group_attendance_records_read on public.small_group_attendance_records;
create policy small_group_attendance_records_read on public.small_group_attendance_records for select to authenticated using (
  public.is_admin()
  or public.current_role()='viewer'
  or exists (select 1 from public.small_group_attendance_sessions s join public.small_groups sg on sg.id = s.small_group_id
             where s.id = small_group_attendance_records.session_id
             and public.current_role()='department_user' and sg.department_id = public.current_department_id())
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);

-- Done. Viewers can now SELECT people, families, family_members,
-- person_departments, person_subgroups and small_group_members /
-- small_group_attendance_records. No insert/update/delete policy on any
-- table was changed, so viewers remain fully read-only.
