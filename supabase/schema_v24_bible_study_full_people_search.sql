-- MKC Amanuel Local Church — schema v24
-- The Small Group Bible Study department user needs to search and add ANY
-- member into a small group, not just people whose "department" happens to
-- already be Small Group Bible Study (most members won't have that as their
-- department — cell groups are drawn from the whole congregation).
--
-- This ONLY widens SELECT (read) on people for that one department user.
-- It does NOT touch people_insert or people_update, so a Bible Study
-- department user still cannot create or edit member records outside their
-- own department — they can only read names to add them to a small group.
-- Run this after schema_v23_viewer_read_access.sql.

create or replace function public.is_bible_study_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select public.current_role()='department_user'
    and exists (
      select 1 from public.departments d
      where d.id = public.current_department_id()
      and d.name = 'Small Group Bible Study'
    );
$$;

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using(
  public.is_admin()
  or public.current_role()='viewer'
  or public.is_bible_study_admin()
  or (
    public.current_role()='department_user'
    and public.person_is_in_current_department(id)
  )
);

-- Done. Bible Study department users can now SELECT every member (needed to
-- search the whole congregation when building a small group), while
-- people_insert/people_update policies are unchanged: they still can only
-- add or edit records for people already in their own department.
