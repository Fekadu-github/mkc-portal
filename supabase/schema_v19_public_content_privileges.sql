-- MKC Amanuel Local Church — v19 public content/privilege hardening
-- Run AFTER schema_v17_site_management.sql.
-- Safe to re-run.
--
-- Purpose:
-- 1) Keep public website reads independent of private portal-only tables.
-- 2) Ensure every Super Admin-managed public content table has explicit
--    anonymous read policies for published/active content.
-- 3) Keep all write/delete operations restricted to Super Admin.

-- LEADERSHIP: the public website must not need access to departments.
-- The frontend reads only public leader columns from public.leaders.
-- No departments policy is widened here.

-- Re-assert public read/write policies for site-managed content.
drop policy if exists leaders_public_read on public.leaders;
create policy leaders_public_read on public.leaders
  for select to anon, authenticated
  using (active = true or public.current_role() = 'super_admin');

drop policy if exists leaders_super_admin_manage on public.leaders;
create policy leaders_super_admin_manage on public.leaders
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

drop policy if exists service_schedule_public_read on public.service_schedule;
create policy service_schedule_public_read on public.service_schedule
  for select to anon, authenticated
  using (active = true or public.current_role() = 'super_admin');

drop policy if exists service_schedule_super_admin_manage on public.service_schedule;
create policy service_schedule_super_admin_manage on public.service_schedule
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

drop policy if exists daily_updates_public_read on public.daily_updates;
create policy daily_updates_public_read on public.daily_updates
  for select to anon, authenticated
  using (published = true or public.current_role() = 'super_admin');

drop policy if exists daily_updates_super_admin_manage on public.daily_updates;
create policy daily_updates_super_admin_manage on public.daily_updates
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

drop policy if exists sermons_public_read on public.sermons;
create policy sermons_public_read on public.sermons
  for select to anon, authenticated
  using (published = true or public.current_role() = 'super_admin');

drop policy if exists sermons_super_admin_manage on public.sermons;
create policy sermons_super_admin_manage on public.sermons
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select to anon
  using (published = true);

drop policy if exists events_super_admin_publish on public.events;
create policy events_super_admin_publish on public.events
  for update to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

-- Contact information remains public-readable but writable only by the
-- designated primary Super Admin, as defined in v17.
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);
drop policy if exists site_settings_primary_admin_manage on public.site_settings;
create policy site_settings_primary_admin_manage on public.site_settings
  for all to authenticated
  using (public.is_primary_super_admin())
  with check (public.is_primary_super_admin());
