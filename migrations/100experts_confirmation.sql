-- Migration: 100 Experts — double-opt-in confirmation gate
-- Run this manually in the Supabase SQL editor (survey project ekyzrnhoxutcnnqrvszp),
-- AFTER proofworks-100/supabase-setup.sql. Re-runnable (idempotent).
--
-- What it does: a submission is now stored UNCONFIRMED with a single-use token;
-- the respondent gets an email and only when they click the link does the row
-- flip to confirmed. Only confirmed rows are counted in the public results and
-- in the analyst views. This binds each response to a real, owned email address
-- (anti-impersonation) and is what the `confirm-submission` edge function writes.
--
-- These changes are also folded into supabase-setup.sql (schema + public view)
-- and migrations/100experts_analysis.sql (analyst views) for fresh installs.

-- ── 1. Columns on submissions (append-only content is untouched; confirmation
--       is delivery metadata, set once by the service-role confirm function). ──
alter table public.submissions add column if not exists confirmed boolean not null default false;
alter table public.submissions add column if not exists confirmation_token uuid;
alter table public.submissions add column if not exists confirmation_token_expires_at timestamptz;
alter table public.submissions add column if not exists confirmed_at timestamptz;

create index if not exists submissions_confirmation_token_idx
  on public.submissions (confirmation_token) where confirmation_token is not null;

-- ── 2. Public results view: confirmed-only, latest confirmed per email. ──
create or replace view public.public_allocations
  with (security_invoker = false) as          -- runs as owner, bypasses table RLS
  select allocations
  from (
    select distinct on (email) email, allocations, created_at
    from public.submissions
    where confirmed
    order by email, created_at desc
  ) latest;

grant select on public.public_allocations to anon;

-- ── 3. Analyst base view: confirmed-only (alloc_long / alloc_canonical inherit
--       this through latest_submissions; same columns, so replace is safe). ──
--       Only runs if the analysis migration has already been applied.
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'latest_submissions') then
    create or replace view public.latest_submissions with (security_invoker = on) as
      select distinct on (email) id, email, name, allocations, reasoning, meta, created_at
      from public.submissions
      where confirmed
      order by email, created_at desc;
  end if;
end $$;

-- ── Backfill note ──
-- If you already collected responses under the OLD (no-gate) behaviour, those
-- rows have confirmed = false and will drop out of the results until confirmed.
-- To grandfather everything captured before this migration as confirmed:
--   update public.submissions
--     set confirmed = true, confirmed_at = coalesce(confirmed_at, created_at)
--     where created_at < now();   -- tighten the cutoff to your launch moment
