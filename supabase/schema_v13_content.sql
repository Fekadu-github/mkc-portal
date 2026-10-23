-- MKC Amanuel Local Church — v13 migration: public website content management
-- Run this AFTER schema_v12.sql in the Supabase SQL Editor. Safe to re-run.
-- Adds: daily_updates, sermons, a "published" flag on events, and a storage
-- bucket for images — all managed exclusively by super_admin, readable by
-- the public (anonymous) website.

-- =========================================================
-- 1. Daily Updates
-- =========================================================
create table if not exists public.daily_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_daily_updates_updated_at on public.daily_updates;
create trigger trg_daily_updates_updated_at before update on public.daily_updates
  for each row execute function public.set_updated_at();

-- =========================================================
-- 2. Sermons & Teachings
-- =========================================================
create table if not exists public.sermons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  speaker text,
  scripture_reference text,
  summary text,
  media_url text,
  media_type text check (media_type in ('video','audio')),
  sermon_date date not null default current_date,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sermons_updated_at on public.sermons;
create trigger trg_sermons_updated_at before update on public.sermons
  for each row execute function public.set_updated_at();

-- =========================================================
-- 3. Events: allow featuring an existing event on the public site
-- =========================================================
alter table public.events add column if not exists published boolean not null default false;
alter table public.events add column if not exists published_at timestamptz;

-- =========================================================
-- 4. Row Level Security
-- =========================================================
alter table public.daily_updates enable row level security;
alter table public.sermons enable row level security;

do $$ declare r record; begin
  for r in select policyname,tablename from pg_policies
    where schemaname='public' and tablename in ('daily_updates','sermons')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- Public (anonymous website) can read only published rows.
-- super_admin can read everything, including drafts, from the portal.
create policy daily_updates_public_read on public.daily_updates
  for select to anon, authenticated
  using (published = true or public.current_role() = 'super_admin');

create policy daily_updates_super_admin_manage on public.daily_updates
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

create policy sermons_public_read on public.sermons
  for select to anon, authenticated
  using (published = true or public.current_role() = 'super_admin');

create policy sermons_super_admin_manage on public.sermons
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

-- Public read of *published* events only. This is additive to the existing
-- events_read policy (which covers logged-in staff) — permissive policies
-- combine with OR, so this only ever widens access to published rows.
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select to anon
  using (published = true);

-- Only super_admin may flip an event's published flag or publish date.
-- (Day-to-day event fields are still managed by is_admin() as before —
-- see events_manage in schema_v12.sql.)
drop policy if exists events_super_admin_publish on public.events;
create policy events_super_admin_publish on public.events
  for update to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

-- =========================================================
-- 5. Storage bucket for public content images (daily update photos)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('site-content', 'site-content', true)
on conflict (id) do nothing;

drop policy if exists "site_content_public_read" on storage.objects;
create policy "site_content_public_read" on storage.objects
  for select using (bucket_id = 'site-content');

drop policy if exists "site_content_super_admin_write" on storage.objects;
create policy "site_content_super_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-content' and public.current_role() = 'super_admin');

drop policy if exists "site_content_super_admin_update" on storage.objects;
create policy "site_content_super_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-content' and public.current_role() = 'super_admin');

drop policy if exists "site_content_super_admin_delete" on storage.objects;
create policy "site_content_super_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-content' and public.current_role() = 'super_admin');
