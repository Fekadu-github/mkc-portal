-- MKC Amanuel Local Church — v17 migration: site management
-- Run this AFTER schema.sql (and v13/v14/v15/v16) in the Supabase SQL Editor.
-- Safe to re-run.
--
-- Adds three things, all editable from the portal by a Super Admin, and all
-- readable by the public website:
--   1. site_settings   — contact info (address, phone, email)
--   2. leaders         — the Leadership page team, each optionally linked
--                         to a department
--   3. service_schedule — the Weekly Services page schedule
--
-- Permission split requested: fekaduendrias@gmail.com (the developer/Super
-- Admin account) can edit ALL of the above. Other Super Admins — including
-- ammkc01@gmail.com — can edit Leadership and Service Schedule, but NOT
-- Contact Info.

-- =========================================================
-- 0. Helper: is this the one Super Admin allowed to edit contact info?
-- =========================================================
create or replace function public.is_primary_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role()='super_admin' and lower(auth.jwt()->>'email')='fekaduendrias@gmail.com', false);
$$;

-- =========================================================
-- 1. Contact info (site_settings key/value)
-- =========================================================
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Seed with the values already shown on the live site today, so nothing
-- breaks before a Super Admin edits them.
insert into public.site_settings(key, value) values
  ('address_line', 'Akaki Kality, Addis Ababa'),
  ('address_note', 'Behind Akaki Kality Sub-city, near Total Condominium'),
  ('phone', '0905 732 425'),
  ('email', 'ammkc01@gmail.com')
on conflict (key) do nothing;

-- =========================================================
-- 2. Leadership team
-- =========================================================
create table if not exists public.leaders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text not null,
  department_id uuid references public.departments(id) on delete set null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_leaders_updated_at on public.leaders;
create trigger trg_leaders_updated_at before update on public.leaders
  for each row execute function public.set_updated_at();

-- Seed with the leaders already shown on the live Leadership page today.
-- Department links are left blank — assign them from the portal once this
-- migration runs, since department IDs vary per church database.
insert into public.leaders(full_name, title, sort_order) values
  ('Pastor Alemneh Admasu', 'Senior Pastor', 1),
  ('Brother Yosef Heliso', 'Head Leader', 2),
  ('Brother Fekadu Endrias', 'Head of Youth Ministry', 3),
  ('Pastor Girma Wondemu', 'Head of Evangelism & Shepherding', 4),
  ('Pastor Zenebe Geresu', 'Head of Teaching & Training', 5),
  ('Teacher Darmelesh Teklu', 'Head of Children''s Services', 6)
on conflict do nothing;

-- =========================================================
-- 3. Weekly service schedule
-- =========================================================
create table if not exists public.service_schedule (
  id uuid primary key default gen_random_uuid(),
  day_label text not null,
  time_label text not null,
  title text not null,
  description text,
  featured boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_schedule_updated_at on public.service_schedule;
create trigger trg_service_schedule_updated_at before update on public.service_schedule
  for each row execute function public.set_updated_at();

-- Seed with the schedule already shown on the live Weekly Services page.
insert into public.service_schedule(day_label, time_label, title, description, featured, sort_order) values
  ('SUN', '3:00 – 6:00', 'Main Sunday Service', 'Worship, Word, prayer and fellowship.', true, 1),
  ('WED', '11:30', 'Prayer & Deliverance', 'A dedicated time of prayer and deliverance.', false, 2),
  ('THU', '11:30', 'Teaching Service', 'Biblical teaching and spiritual growth.', false, 3),
  ('SAT', '10:00', 'Youth Service', 'A place for young people to grow, worship and serve.', false, 4)
on conflict do nothing;

-- =========================================================
-- 4. Row Level Security
-- =========================================================
alter table public.site_settings enable row level security;
alter table public.leaders enable row level security;
alter table public.service_schedule enable row level security;

do $$ declare r record; begin
  for r in select policyname,tablename from pg_policies
    where schemaname='public' and tablename in ('site_settings','leaders','service_schedule')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- Contact info: public can always read it; only the primary Super Admin
-- (fekaduendrias@gmail.com) can change it.
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);
create policy site_settings_primary_admin_manage on public.site_settings
  for all to authenticated
  using (public.is_primary_super_admin())
  with check (public.is_primary_super_admin());

-- Leadership team: public sees active leaders; any Super Admin can manage.
create policy leaders_public_read on public.leaders
  for select to anon, authenticated
  using (active = true or public.current_role() = 'super_admin');
create policy leaders_super_admin_manage on public.leaders
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

-- Weekly service schedule: public sees active rows; any Super Admin can manage.
create policy service_schedule_public_read on public.service_schedule
  for select to anon, authenticated
  using (active = true or public.current_role() = 'super_admin');
create policy service_schedule_super_admin_manage on public.service_schedule
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');
