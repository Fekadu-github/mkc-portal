-- MKC Amanuel Local Church — Supabase/PostgreSQL production schema v12
-- Run this whole file in Supabase SQL Editor.
-- Uses only the browser-safe anon/publishable key; never put a service-role key in the website.

create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('super_admin','secretary','pastor','department_user','viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.person_status as enum ('member','visitor','new_believer','leader'); exception when duplicate_object then null; end $$;
do $$ begin create type public.followup_status as enum ('open','closed'); exception when duplicate_object then null; end $$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, full_name text not null,
  role public.app_role not null default 'viewer', department_id uuid references public.departments(id) on delete set null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(), family_name text not null, address text,
  primary_phone text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(), member_no text not null unique,
  first_name text not null, middle_name text, last_name text not null, date_of_birth date,
  gender text check (gender in ('Male','Female','Other')), phone text, email text, address text,
  family_id uuid references public.families(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  status public.person_status not null default 'member', membership_date date, baptism_date date,
  emergency_contact_name text, emergency_contact_phone text, guardian_name text, notes text,
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade, relationship text,
  is_primary_contact boolean not null default false, primary key (family_id, person_id)
);
create table if not exists public.person_departments (
  person_id uuid not null references public.people(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (person_id, department_id)
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(), attendance_date date not null, service_name text not null,
  department_id uuid references public.departments(id) on delete set null, present_count integer not null default 0 check (present_count >= 0),
  absent_count integer not null default 0 check (absent_count >= 0), attendee_name text, father_name text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(), title text not null, event_date date not null, start_time time,
  location text, department_id uuid references public.departments(id) on delete set null, description text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade, attended boolean not null default false,
  registered_at timestamptz not null default now(), unique(event_id, person_id)
);
create table if not exists public.follow_up_cases (
  id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id) on delete cascade,
  reason text not null, assigned_to uuid references auth.users(id) on delete set null, last_contact date,
  status public.followup_status not null default 'open', notes text, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
  action text not null, table_name text, record_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.department_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  department_name text not null,
  justification text not null check (char_length(btrim(justification)) >= 5),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  check ((status <> 'rejected') or nullif(btrim(rejection_reason), '') is not null)
);
create table if not exists public.member_deletion_requests (
  id uuid primary key default gen_random_uuid(), person_id uuid references public.people(id) on delete set null,
  member_name text not null, justification text not null check (char_length(btrim(justification)) >= 5),
  status text not null default 'pending' check (status in ('pending','approved','rejected')), rejection_reason text,
  requested_by uuid not null references auth.users(id) on delete restrict, requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz,
  check ((status <> 'rejected') or nullif(btrim(rejection_reason), '') is not null)
);

-- Compatibility upgrades must run before indexes, sequences, triggers, or RLS
-- reference columns that may not exist in older portal installations.
alter table public.departments add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role public.app_role not null default 'viewer';
alter table public.profiles add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.people add column if not exists member_no text;
alter table public.people add column if not exists family_id uuid references public.families(id) on delete set null;
alter table public.people add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.people add column if not exists date_of_birth date;
alter table public.people add column if not exists status public.person_status default 'member';
alter table public.people add column if not exists created_at timestamptz not null default now();
alter table public.people add column if not exists updated_at timestamptz not null default now();
alter table public.attendance add column if not exists attendance_date date;
alter table public.attendance add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.attendance add column if not exists attendee_name text;
alter table public.attendance add column if not exists father_name text;
alter table public.events add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.events add column if not exists event_date date;
alter table public.follow_up_cases add column if not exists status public.followup_status default 'open';

-- New records must always include the church's required member details. NOT VALID
-- preserves legacy records while enforcing the rule for every insert or update.
alter table public.people drop constraint if exists people_required_fields;
alter table public.people add constraint people_required_fields check (
  nullif(btrim(first_name), '') is not null and nullif(btrim(last_name), '') is not null
  and date_of_birth is not null and gender is not null and nullif(btrim(address), '') is not null
  and department_id is not null
) not valid;

-- Helpful indexes.
-- Upgrade older audit_logs tables before creating their indexes and triggers.
alter table public.audit_logs add column if not exists actor_id uuid references auth.users(id) on delete set null;
alter table public.audit_logs add column if not exists action text not null default 'LEGACY';
alter table public.audit_logs add column if not exists table_name text;
alter table public.audit_logs add column if not exists record_id uuid;
alter table public.audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.audit_logs add column if not exists created_at timestamptz not null default now();

create index if not exists people_department_idx on public.people(department_id);
create index if not exists people_family_idx on public.people(family_id);
create index if not exists people_dob_idx on public.people(date_of_birth);
create index if not exists people_status_idx on public.people(status);
create index if not exists person_departments_department_idx on public.person_departments(department_id);
create unique index if not exists person_departments_one_primary_idx on public.person_departments(person_id) where is_primary;
create index if not exists attendance_date_idx on public.attendance(attendance_date desc);
create index if not exists events_date_idx on public.events(event_date);
create index if not exists followup_status_idx on public.follow_up_cases(status);
create index if not exists audit_actor_idx on public.audit_logs(actor_id);
create index if not exists department_deletion_requests_status_idx on public.department_deletion_requests(status, requested_at desc);
create index if not exists member_deletion_requests_status_idx on public.member_deletion_requests(status, requested_at desc);

-- Generate member numbers in PostgreSQL so concurrent staff cannot create duplicates.
create sequence if not exists public.member_no_seq;
select setval(
  'public.member_no_seq',
  greatest(coalesce((select max(nullif(regexp_replace(member_no, '[^0-9]', '', 'g'), '')::bigint) from public.people), 0), 1),
  coalesce((select max(nullif(regexp_replace(member_no, '[^0-9]', '', 'g'), '')::bigint) from public.people), 0) > 0
);
create or replace function public.assign_member_no() returns trigger language plpgsql as $$
begin
  if new.member_no is null or btrim(new.member_no) = '' then
    new.member_no := 'MKC-' || lpad(nextval('public.member_no_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists people_assign_member_no on public.people;
create trigger people_assign_member_no before insert on public.people for each row execute function public.assign_member_no();
insert into public.person_departments(person_id,department_id,is_primary)
select id,department_id,true from public.people where department_id is not null
on conflict (person_id,department_id) do update set is_primary=excluded.is_primary;

-- v12 additions for databases created from v10/v11.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.people add column if not exists guardian_name text;
alter table public.people add column if not exists baptism_date date;
alter table public.people add column if not exists emergency_contact_name text;
alter table public.people add column if not exists emergency_contact_phone text;
alter table public.people add column if not exists updated_by uuid references auth.users(id) on delete set null;

insert into public.departments(name,description) values
('Administration','Church administration'),('Youth','Youth ministry'),('Children','Children services'),('Women','Women ministry'),('Men','Men ministry'),
('Teaching & Training','Teaching and training'),('Evangelism & Shepherding','Evangelism and pastoral care'),('Worship & Choir','Worship ministry'),('Sunday School','Sunday school'),('Prayer','Prayer ministry')
on conflict (name) do nothing;

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles; create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists families_updated_at on public.families; create trigger families_updated_at before update on public.families for each row execute function public.set_updated_at();
drop trigger if exists people_updated_at on public.people; create trigger people_updated_at before update on public.people for each row execute function public.set_updated_at();
drop trigger if exists events_updated_at on public.events; create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
drop trigger if exists followup_updated_at on public.follow_up_cases; create trigger followup_updated_at before update on public.follow_up_cases for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'viewer') on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role::text::public.app_role from public.profiles where id=auth.uid() and active=true; $$;
create or replace function public.current_department_id() returns uuid language sql stable security definer set search_path=public as $$ select department_id from public.profiles where id=auth.uid() and active=true; $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role() in ('super_admin','secretary','pastor'),false); $$;
-- A member may belong to a department as either their primary assignment or an
-- additional assignment.  SECURITY DEFINER avoids RLS recursion while keeping
-- the result limited to the signed-in user's department.
create or replace function public.person_is_in_current_department(person_uuid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    exists(select 1 from public.people p where p.id=person_uuid and p.department_id=public.current_department_id())
    or exists(select 1 from public.person_departments pd where pd.person_id=person_uuid and pd.department_id=public.current_department_id()),
    false
  );
$$;

-- Departments cannot be directly deleted. Administrative staff submit a
-- justified request; only a Super Admin can approve (permanently delete) it.
create or replace function public.request_department_deletion(target_department_id uuid, request_justification text)
returns uuid language plpgsql security definer set search_path=public as $$
declare request_uuid uuid; target_name text;
begin
  if coalesce(public.current_role()::text, '') not in ('super_admin','secretary','pastor') then
    raise exception 'Only administrative staff can request a department deletion';
  end if;
  if nullif(btrim(request_justification), '') is null or char_length(btrim(request_justification)) < 5 then
    raise exception 'A deletion justification of at least 5 characters is required';
  end if;
  select name into target_name from public.departments where id=target_department_id;
  if target_name is null then raise exception 'Department not found'; end if;
  if exists(select 1 from public.department_deletion_requests where department_id=target_department_id and status='pending') then
    raise exception 'A deletion request is already pending for this department';
  end if;
  insert into public.department_deletion_requests(department_id,department_name,justification,requested_by)
  values(target_department_id,target_name,btrim(request_justification),auth.uid()) returning id into request_uuid;
  return request_uuid;
end;
$$;
create or replace function public.review_department_deletion(request_id uuid, decision text, rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare request_row public.department_deletion_requests%rowtype;
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then raise exception 'Only a Super Admin can review deletion requests'; end if;
  select * into request_row from public.department_deletion_requests where id=request_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if request_row.status <> 'pending' then raise exception 'This deletion request has already been reviewed'; end if;
  if decision='rejected' then
    if nullif(btrim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.department_deletion_requests set status='rejected',rejection_reason=btrim(rejection_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  elsif decision='approved' then
    if request_row.department_id is null then raise exception 'The department is no longer available'; end if;
    delete from public.departments where id=request_row.department_id;
    update public.department_deletion_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  else raise exception 'Decision must be approved or rejected'; end if;
end;
$$;
create or replace function public.request_member_deletion(target_person_id uuid, request_justification text)
returns uuid language plpgsql security definer set search_path=public as $$
declare request_uuid uuid; target_name text;
begin
  if coalesce(public.current_role()::text, '') not in ('super_admin','secretary','pastor','department_user') then raise exception 'You cannot request member deletion'; end if;
  if coalesce(public.current_role()::text, '')='department_user' and not public.person_is_in_current_department(target_person_id) then raise exception 'You can only request deletion for members in your department'; end if;
  if nullif(btrim(request_justification), '') is null or char_length(btrim(request_justification)) < 5 then raise exception 'A deletion justification of at least 5 characters is required'; end if;
  select concat_ws(' ',first_name,last_name) into target_name from public.people where id=target_person_id;
  if target_name is null then raise exception 'Member not found'; end if;
  if exists(select 1 from public.member_deletion_requests where person_id=target_person_id and status='pending') then raise exception 'A deletion request is already pending for this member'; end if;
  insert into public.member_deletion_requests(person_id,member_name,justification,requested_by) values(target_person_id,target_name,btrim(request_justification),auth.uid()) returning id into request_uuid;
  return request_uuid;
end;
$$;
create or replace function public.review_member_deletion(request_id uuid, decision text, rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare request_row public.member_deletion_requests%rowtype;
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then raise exception 'Only a Super Admin can review deletion requests'; end if;
  select * into request_row from public.member_deletion_requests where id=request_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if request_row.status <> 'pending' then raise exception 'This deletion request has already been reviewed'; end if;
  if decision='rejected' then
    if nullif(btrim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.member_deletion_requests set status='rejected',rejection_reason=btrim(rejection_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  elsif decision='approved' then
    if request_row.person_id is null then raise exception 'The member record is no longer available'; end if;
    delete from public.people where id=request_row.person_id;
    update public.member_deletion_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  else raise exception 'Decision must be approved or rejected'; end if;
end;
$$;
-- Emergency deletion override requested for the named active portal account.
-- The check is performed in PostgreSQL, not only in the browser UI.
create or replace function public.delete_member_without_approval(target_person_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if lower(coalesce(auth.jwt()->>'email', '')) <> 'aamkc01@gmail.com'
     or not exists(select 1 from public.profiles where id=auth.uid() and active=true) then
    raise exception 'You are not authorized to delete members without approval';
  end if;
  delete from public.people where id=target_person_id;
  if not found then raise exception 'Member not found'; end if;
end;
$$;

-- Generic audit trigger. It is SECURITY DEFINER so normal users cannot bypass logging.
create or replace function public.write_audit_log() returns trigger language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
  if TG_TABLE_NAME in ('family_members','person_departments') then rid:=null; elsif TG_OP='DELETE' then rid:=OLD.id; else rid:=NEW.id; end if;
  -- Keep audit logs free of full member/contact snapshots. Store the actor, operation and record identifier only.
  insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
  values(auth.uid(),TG_OP,TG_TABLE_NAME,rid,jsonb_build_object('timestamp',now()));
  return coalesce(NEW,OLD);
end; $$;

do $$ declare t text; begin
   foreach t in array array['profiles','families','people','family_members','person_departments','attendance','events','event_registrations','follow_up_cases'] loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t,t);
  end loop;
end $$;

-- RLS.
alter table public.departments enable row level security; alter table public.profiles enable row level security; alter table public.families enable row level security;
alter table public.people enable row level security; alter table public.family_members enable row level security; alter table public.attendance enable row level security;
alter table public.person_departments enable row level security;
alter table public.department_deletion_requests enable row level security;
alter table public.member_deletion_requests enable row level security;
alter table public.events enable row level security; alter table public.event_registrations enable row level security; alter table public.follow_up_cases enable row level security; alter table public.audit_logs enable row level security;

-- Drop/recreate policies so the script is safe to re-run.
do $$ declare r record; begin for r in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('departments','profiles','families','people','family_members','person_departments','attendance','events','event_registrations','follow_up_cases','audit_logs','department_deletion_requests','member_deletion_requests') loop execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename); end loop; end $$;

create policy departments_read on public.departments for select to authenticated using(active=true or public.is_admin());
create policy departments_insert on public.departments for insert to authenticated with check(public.is_admin());
create policy departments_update on public.departments for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy department_deletion_requests_read on public.department_deletion_requests for select to authenticated using(requested_by=auth.uid() or public.current_role()='super_admin');
create policy member_deletion_requests_read on public.member_deletion_requests for select to authenticated using(requested_by=auth.uid() or public.current_role()='super_admin');
create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profiles_admin_manage on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy people_read on public.people for select to authenticated using(public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(id)));
create policy people_insert on public.people for insert to authenticated with check(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy people_update on public.people for update to authenticated using(public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(id))) with check(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy families_read on public.families for select to authenticated using(public.is_admin() or exists(select 1 from public.people p where p.family_id=families.id and public.current_role()='department_user' and p.department_id=public.current_department_id()));
create policy families_manage on public.families for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy family_members_read on public.family_members for select to authenticated using(public.is_admin() or exists(select 1 from public.people p where p.id=family_members.person_id and p.department_id=public.current_department_id() and public.current_role()='department_user'));
create policy family_members_manage on public.family_members for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy person_departments_read on public.person_departments for select to authenticated using(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id() and public.person_is_in_current_department(person_id)));
create policy person_departments_manage on public.person_departments for all to authenticated using(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id() and public.person_is_in_current_department(person_id))) with check(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id() and public.person_is_in_current_department(person_id)));
create policy attendance_read on public.attendance for select to authenticated using(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy attendance_insert on public.attendance for insert to authenticated with check(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy attendance_update on public.attendance for update to authenticated using(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id())) with check(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy attendance_delete on public.attendance for delete to authenticated using(public.is_admin());
create policy events_read on public.events for select to authenticated using(public.is_admin() or department_id is null or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy events_manage on public.events for all to authenticated using(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id())) with check(public.is_admin() or (public.current_role()='department_user' and department_id=public.current_department_id()));
create policy event_registrations_read on public.event_registrations for select to authenticated using(public.is_admin() or exists(select 1 from public.events e where e.id=event_registrations.event_id and (e.department_id is null or e.department_id=public.current_department_id())));
create policy event_registrations_manage on public.event_registrations for all to authenticated using(public.is_admin() or exists(select 1 from public.events e where e.id=event_registrations.event_id and e.department_id=public.current_department_id())) with check(public.is_admin() or exists(select 1 from public.events e where e.id=event_registrations.event_id and e.department_id=public.current_department_id()));
create policy followup_read on public.follow_up_cases for select to authenticated using(public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(person_id)));
create policy followup_manage on public.follow_up_cases for all to authenticated using(public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(person_id))) with check(public.is_admin() or (public.current_role()='department_user' and public.person_is_in_current_department(person_id)));
-- Audit rows are written exclusively by the SECURITY DEFINER database trigger.
-- There is deliberately no client insert policy for audit_logs.
create policy audit_read on public.audit_logs for select to authenticated using(public.is_admin());

-- This derived view contains no data. Recreate it so older versions with a
-- different column order can be upgraded safely.
drop view if exists public.people_directory;
create view public.people_directory with (security_invoker=true) as
 select p.*,f.family_name,d.name as department_name,case when p.date_of_birth is null then null else extract(year from age(current_date,p.date_of_birth))::int end as age,
 case when p.date_of_birth is null then 'Unknown' when extract(year from age(current_date,p.date_of_birth))<13 then 'Children' when extract(year from age(current_date,p.date_of_birth))<25 then 'Youth' when extract(year from age(current_date,p.date_of_birth))<60 then 'Adult' else 'Senior' end as age_group
 from public.people p left join public.families f on f.id=p.family_id left join public.departments d on d.id=p.department_id;

-- After the first Auth user is created, run once with its UUID:
-- update public.profiles set role='super_admin',full_name='Church Administrator' where id='AUTH-USER-UUID';
