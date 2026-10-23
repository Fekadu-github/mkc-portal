-- MKC Amanuel Local Church — v16 patch
-- Fixes: "column reference rejection_reason is ambiguous" when a Super Admin
-- rejects a department, member, or event deletion request.
--
-- Cause: each review_*_deletion() function has a parameter named
-- rejection_reason, which is also the name of the table column being
-- updated. PL/pgSQL's default behavior errors out on that collision.
-- Fix: add "#variable_conflict use_variable" so the function's own
-- parameter always wins over the column of the same name. This does not
-- change the function's name or parameters, so nothing on the frontend
-- needs to change — just run this in the Supabase SQL editor.

create or replace function public.review_department_deletion(request_id uuid, decision text, rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then raise exception 'Only a Super Admin can review deletion requests'; end if;
  perform 1 from public.department_deletion_requests where id=request_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if (select status from public.department_deletion_requests where id=request_id) <> 'pending' then raise exception 'This deletion request has already been reviewed'; end if;
  if decision='rejected' then
    if nullif(btrim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.department_deletion_requests set status='rejected',rejection_reason=btrim(rejection_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  elsif decision='approved' then
    if (select department_id from public.department_deletion_requests where id=request_id) is null then raise exception 'The department is no longer available'; end if;
    delete from public.departments where id=(select department_id from public.department_deletion_requests where id=request_id);
    update public.department_deletion_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  else raise exception 'Decision must be approved or rejected'; end if;
end;
$$;

create or replace function public.review_member_deletion(request_id uuid, decision text, rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then raise exception 'Only a Super Admin can review deletion requests'; end if;
  perform 1 from public.member_deletion_requests where id=request_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if (select status from public.member_deletion_requests where id=request_id) <> 'pending' then raise exception 'This deletion request has already been reviewed'; end if;
  if decision='rejected' then
    if nullif(btrim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.member_deletion_requests set status='rejected',rejection_reason=btrim(rejection_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  elsif decision='approved' then
    if (select person_id from public.member_deletion_requests where id=request_id) is null then raise exception 'The member record is no longer available'; end if;
    delete from public.people where id=(select person_id from public.member_deletion_requests where id=request_id);
    update public.member_deletion_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  else raise exception 'Decision must be approved or rejected'; end if;
end;
$$;

create or replace function public.review_event_deletion(request_id uuid, decision text, rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then raise exception 'Only a Super Admin can review deletion requests'; end if;
  perform 1 from public.event_deletion_requests where id=request_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if (select status from public.event_deletion_requests where id=request_id) <> 'pending' then raise exception 'This deletion request has already been reviewed'; end if;
  if decision='rejected' then
    if nullif(btrim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.event_deletion_requests set status='rejected',rejection_reason=btrim(rejection_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  elsif decision='approved' then
    if (select event_id from public.event_deletion_requests where id=request_id) is null then raise exception 'The event is no longer available'; end if;
    delete from public.events where id=(select event_id from public.event_deletion_requests where id=request_id);
    update public.event_deletion_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=request_id;
  else raise exception 'Decision must be approved or rejected'; end if;
end;
$$;
