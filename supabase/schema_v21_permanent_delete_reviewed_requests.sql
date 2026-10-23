-- v21: allow a Super Admin to permanently remove *already-reviewed*
-- member deletion request records (status = 'approved' or 'rejected').
--
-- Why: member_deletion_requests only ever had a SELECT policy — every
-- write went through the request_member_deletion / review_member_deletion
-- RPCs. There was no way to clear out old, already-decided request
-- records from the "Member deletion requests" panel, so they piled up
-- forever. This adds one narrow, security-definer RPC for that cleanup.
--
-- Safety:
--   * Only a super_admin may call it (checked inside the function, not
--     just in the UI).
--   * It refuses to touch a 'pending' request, so an open request can
--     never be deleted without first being reviewed.
--   * It only deletes the log/request row itself — the underlying
--     person record was already permanently deleted (or was never
--     deleted, if the request was rejected) by review_member_deletion.
--
-- Run this file once, after schema_v20_fix_people_read_recursion.sql,
-- in the Supabase SQL editor.

create or replace function public.delete_member_deletion_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'super_admin' then
    raise exception 'Only a Super Admin can permanently delete a deletion request record.';
  end if;

  delete from public.member_deletion_requests
  where id = request_id
    and status <> 'pending';
end;
$$;

grant execute on function public.delete_member_deletion_request(uuid) to authenticated;
