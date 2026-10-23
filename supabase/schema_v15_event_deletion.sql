-- MKC Amanuel Local Church — v15 migration: event deletion requests
-- Run this AFTER schema.sql (and any v13/v14 migrations already applied) in
-- the Supabase SQL Editor. Safe to re-run.
--
-- Mirrors the existing department_deletion_requests / member_deletion_requests
-- workflow: a Department User (or admin staff) can request that a
-- department-created event be deleted, with a required reason. Only a
-- Super Admin can approve (which permanently deletes the event) or reject
-- (which requires a rejection reason) the request.

create table if not exists public.event_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  event_title text not null,
  event_date date,
  department_name text,
  justification text not null check (char_length(btrim(justification)) >= 5),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  check ((status <> 'rejected') or nullif(btrim(rejection_reason), '') is not null)
);

create index if not exists event_deletion_requests_status_idx
  on public.event_deletion_requests(status, requested_at desc);

-- Request deletion. Admin staff (super_admin/secretary/pastor) can request
-- deletion of any event; a Department User can only request deletion of an
-- event that belongs to their own department.
create or replace function public.request_event_deletion(target_event_id uuid, request_justification text)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  request_uuid uuid;
  target_row public.events%rowtype;
  target_dept_name text;
begin
  if coalesce(public.current_role()::text, '') not in ('super_admin','secretary','pastor','department_user') then
    raise exception 'You cannot request event deletion';
  end if;
  select * into target_row from public.events where id=target_event_id;
  if not found then raise exception 'Event not found'; end if;
  if coalesce(public.current_role()::text, '')='department_user' then
    if target_row.department_id is null or target_row.department_id <> public.current_department_id() then
      raise exception 'You can only request deletion for events in your department';
    end if;
  end if;
  if nullif(btrim(request_justification), '') is null or char_length(btrim(request_justification)) < 5 then
    raise exception 'A deletion justification of at least 5 characters is required';
  end if;
  if exists(select 1 from public.event_deletion_requests where event_id=target_event_id and status='pending') then
    raise exception 'A deletion request is already pending for this event';
  end if;
  select name into target_dept_name from public.departments where id=target_row.department_id;
  insert into public.event_deletion_requests(event_id,event_title,event_date,department_name,justification,requested_by)
  values(target_event_id,target_row.title,target_row.event_date,target_dept_name,btrim(request_justification),auth.uid())
  returning id into request_uuid;
  return request_uuid;
end;
$$;

-- Review (approve/reject). Only a Super Admin may call this. Approval
-- permanently deletes the event (and cascades to its registrations).
create or replace function public.review_event_deletion(request_id uuid, decision text, rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare request_row public.event_deletion_requests%rowtype;
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then
    raise exception 'Only a Super Admin can review deletion requests';
  end if;
  select * into request_row from public.event_deletion_requests where id=request_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if request_row.status <> 'pending' then raise exception 'This deletion request has already been reviewed'; end if;
  if decision='rejected' then
    if nullif(btrim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.event_deletion_requests set status='rejected',rejection_reason=btrim(rejection_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  elsif decision='approved' then
    if request_row.event_id is null then raise exception 'The event is no longer available'; end if;
    delete from public.events where id=request_row.event_id;
    update public.event_deletion_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  else raise exception 'Decision must be approved or rejected'; end if;
end;
$$;

alter table public.event_deletion_requests enable row level security;

drop policy if exists event_deletion_requests_read on public.event_deletion_requests;
create policy event_deletion_requests_read on public.event_deletion_requests
  for select to authenticated
  using (requested_by=auth.uid() or public.current_role()='super_admin');
