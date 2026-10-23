-- v20: Fix department users being unable to save new/updated people records
-- =============================================================================
-- BUG: people_read and people_update policies called person_is_in_current_department(id),
-- a function that queries public.people from inside a policy that protects public.people.
-- Any statement that needs to read back the affected row under that policy (e.g. the
-- app's `.insert(f).select('id')` in addPerson(), or any UPDATE ... RETURNING) triggers
-- that policy, which calls the function, which queries people again, which re-triggers
-- the same policy — a self-referencing check that Postgres resolves by denying it rather
-- than looping. Super Admin/Secretary/Pastor never hit this because is_admin() short-circuits
-- the OR before the recursive branch runs, so only department_user accounts were affected.
--
-- FIX: inline the "own department" check directly against columns (department_id and the
-- person_departments junction table) instead of re-querying people via the function.
-- person_is_in_current_department() itself is left intact since it's used safely elsewhere
-- (e.g. request_member_deletion, event/department deletion checks) where it isn't being
-- evaluated as part of a policy on public.people itself.

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using(
  public.is_admin()
  or (
    public.current_role()='department_user'
    and (
      department_id = public.current_department_id()
      or exists(select 1 from public.person_departments pd where pd.person_id=people.id and pd.department_id=public.current_department_id())
    )
  )
);

drop policy if exists people_update on public.people;
create policy people_update on public.people for update to authenticated
using(
  public.is_admin()
  or (
    public.current_role()='department_user'
    and (
      department_id = public.current_department_id()
      or exists(select 1 from public.person_departments pd where pd.person_id=people.id and pd.department_id=public.current_department_id())
    )
  )
)
with check(
  public.is_admin()
  or (public.current_role()='department_user' and department_id=public.current_department_id())
);

-- -----------------------------------------------------------------------------
-- Previously live-only, now tracked: automatically pins a department_user's new
-- people records to their own department, regardless of what (if anything) the
-- client sends for department_id. Admin-tier roles (is_admin()) may set any
-- department explicitly. This was already running on the production database
-- but was missing from every schema file in the repo, so a fresh deploy from
-- this repo alone would have silently lost this protection.
-- -----------------------------------------------------------------------------
create or replace function public.set_people_department() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Super admins / pastors / secretaries may explicitly select a department
  if public.is_admin() then
    return new;
  end if;
  -- Department users must always use their own department
  if public.current_role() = 'department_user' then
    new.department_id := public.current_department_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_people_department on public.people;
create trigger trg_set_people_department before insert on public.people
  for each row execute function public.set_people_department();
