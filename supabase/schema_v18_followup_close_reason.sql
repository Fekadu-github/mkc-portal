-- MKC Amanuel Local Church — v18 migration: follow-up case closing reason
-- Run this AFTER schema.sql (and v13–v17) in the Supabase SQL Editor.
-- Safe to re-run.
--
-- Adds a required "why was this case closed" reason, captured whenever a
-- follow-up case moves from open -> closed, plus the timestamp of closure
-- so the portal's period reports (3/6/12 months or a custom range) can
-- report on closed cases and their reasons.

alter table public.follow_up_cases add column if not exists closed_reason text;
alter table public.follow_up_cases add column if not exists closed_at timestamptz;

create index if not exists followup_closed_at_idx on public.follow_up_cases(closed_at desc);

-- Enforce the reason server-side (defense in depth — the portal also asks
-- for it client-side): closing a case without a reason is rejected, and
-- reopening a case clears the previous closure record.
create or replace function public.enforce_followup_close_reason()
returns trigger language plpgsql as $$
begin
  if NEW.status='closed' and OLD.status is distinct from 'closed' then
    if nullif(btrim(coalesce(NEW.closed_reason,'')), '') is null then
      raise exception 'A reason is required to close a follow-up case';
    end if;
    if NEW.closed_at is null then NEW.closed_at:=now(); end if;
  elsif NEW.status='open' and OLD.status is distinct from 'open' then
    NEW.closed_reason:=null;
    NEW.closed_at:=null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_followup_close_reason on public.follow_up_cases;
create trigger trg_followup_close_reason before update on public.follow_up_cases
  for each row execute function public.enforce_followup_close_reason();
