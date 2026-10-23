-- MKC Amanuel Local Church — schema v25
-- Mirrors what schema_v24 did for the Small Group Bible Study department user,
-- but for the Worship & Choir department user: they need to search and assign
-- ANY member of the congregation into a choir/worship sub-group (Worship, A Choir,
-- B Choir, Shalom Choir), not just people whose primary "department" already
-- happens to be Worship & Choir.
--
-- This ONLY widens:
--   1) SELECT (read) on people, for the Worship & Choir department user.
--   2) SELECT + INSERT/UPDATE/DELETE on person_subgroups (choir group membership),
--      scoped to Worship & Choir's own sub-groups only.
-- It does NOT touch people_insert or people_update, so a Worship & Choir
-- department user still cannot create or edit a member's core profile
-- (name, phone, DOB, etc.) outside their own department — they can only read
-- names and toggle choir/worship group membership across the whole congregation.
-- Run this after schema_v24_bible_study_full_people_search.sql.

create or replace function public.is_choir_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select public.current_role()='department_user'
    and exists (
      select 1 from public.departments d
      where d.id = public.current_department_id()
      and d.name = 'Worship & Choir'
    );
$$;

-- 1) Full congregation read, same pattern as is_bible_study_admin().
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using(
  public.is_admin()
  or public.current_role()='viewer'
  or public.is_bible_study_admin()
  or public.is_choir_admin()
  or (
    public.current_role()='department_user'
    and public.person_is_in_current_department(id)
  )
);

-- 2) Choir/worship sub-group membership: read + manage for ANY person, as long
--    as the sub-group being read/changed belongs to Worship & Choir and the
--    department user is assigned to Worship & Choir. (Own-department people are
--    still covered by the existing department_user branch below, unchanged.)
drop policy if exists person_subgroups_read on public.person_subgroups;
create policy person_subgroups_read on public.person_subgroups for select to authenticated using (
  public.is_admin()
  or public.current_role()='viewer'
  or (
    public.is_choir_admin()
    and exists (
      select 1 from public.department_subgroups sg
      where sg.id = person_subgroups.subgroup_id
      and sg.department_id = public.current_department_id()
    )
  )
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);

drop policy if exists person_subgroups_manage on public.person_subgroups;
create policy person_subgroups_manage on public.person_subgroups for all to authenticated using (
  public.is_admin()
  or (
    public.is_choir_admin()
    and exists (
      select 1 from public.department_subgroups sg
      where sg.id = person_subgroups.subgroup_id
      and sg.department_id = public.current_department_id()
    )
  )
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
) with check (
  public.is_admin()
  or (
    public.is_choir_admin()
    and exists (
      select 1 from public.department_subgroups sg
      where sg.id = person_subgroups.subgroup_id
      and sg.department_id = public.current_department_id()
    )
  )
  or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))
);

-- Done. A Worship & Choir department user can now SELECT every member (to search
-- the whole congregation) and INSERT/DELETE rows in person_subgroups for any
-- person, as long as the sub-group is one of Worship & Choir's own groups
-- (Worship, A Choir, B Choir, Shalom Choir, or any others added later under that
-- department). people_insert/people_update remain unchanged: full profile
-- edits are still limited to their own department's people.
