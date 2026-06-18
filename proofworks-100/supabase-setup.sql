-- ════════════════════════════════════════════════════════════════
--  Proofworks · 100 Experts — Supabase schema + security
--  Run this once in your Supabase project: SQL Editor → New query → paste → Run.
--
--  Design: KEEP-LATEST. Each email keeps only its most recent answer. A new
--  submission clears the email's previous PENDING row; confirming the new one
--  then prunes any older row — so an email holds at most one confirmed + one
--  pending row. Writes go through the `submit-experts` / `confirm-submission`
--  edge functions (service role), so the public anon key cannot write directly.
--  (Analyst tables + analysis views live in migrations/100experts_analysis.sql.)
-- ════════════════════════════════════════════════════════════════

-- 1. Submissions table. Keep-latest: at most one confirmed + one pending row
--    per email (the edge functions prune older rows); no unique constraint on
--    email so the transient pending+confirmed pair is allowed.
create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,                 -- NOT unique: allows a transient pending+confirmed pair
  allocations jsonb not null,                -- array: [{id,label,group,count,custom}, ...]
  reasoning   text,                          -- optional free-text rationale (cap 10k, see trigger)
  meta        jsonb not null default '{}'::jsonb,  -- {schema_version, catalog_version, ...}
  -- Double-opt-in: a row is only counted once the respondent clicks the link
  -- emailed to them. confirm-submission (service role) flips `confirmed`.
  confirmed                     boolean not null default false,
  confirmation_token            uuid,         -- single-use token embedded in the email link
  confirmation_token_expires_at timestamptz,  -- link validity window
  confirmed_at                  timestamptz
);

-- Add the confirmation columns to an already-existing table (safe to re-run).
alter table public.submissions add column if not exists confirmed boolean not null default false;
alter table public.submissions add column if not exists confirmation_token uuid;
alter table public.submissions add column if not exists confirmation_token_expires_at timestamptz;
alter table public.submissions add column if not exists confirmed_at timestamptz;

-- Latest-per-email lookups (public view + analysis views all rely on this).
create index if not exists submissions_email_created_idx
  on public.submissions (email, created_at desc);

-- Fast lookups when confirm-submission resolves an emailed link by its token.
create index if not exists submissions_confirmation_token_idx
  on public.submissions (confirmation_token) where confirmation_token is not null;

-- If you created the table before this revision, migrate it with:
--   alter table public.submissions drop constraint if exists submissions_email_key;
--   alter table public.submissions add column if not exists meta jsonb not null default '{}'::jsonb;
--   alter table public.submissions drop column if exists updated_at;
--   (see migrations/100experts_analysis.sql for the allocations-shape backfill note)

-- 2. Server-side integrity backstop (defence in depth behind the edge function).
--    Holds no matter who/what inserts: allocations must sum to 100, reasoning capped.
create or replace function public.validate_submission() returns trigger as $$
declare s int;
begin
  if length(coalesce(new.reasoning, '')) > 10000 then
    raise exception 'reasoning too long (max 10000 chars)';
  end if;
  if jsonb_typeof(new.allocations) <> 'array' then
    raise exception 'allocations must be a JSON array';
  end if;
  select coalesce(sum((e->>'count')::int), 0) into s
  from jsonb_array_elements(new.allocations) e;
  if s <> 100 then
    raise exception 'allocations must sum to 100 (got %)', s;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_validate on public.submissions;
create trigger trg_validate before insert on public.submissions
  for each row execute function public.validate_submission();

-- Old per-update trigger is no longer needed (no updated_at column to touch).
drop trigger if exists trg_touch on public.submissions;

-- 3. Lock the raw table down with row-level security.
alter table public.submissions enable row level security;

-- No anon policies at all: under RLS that means anon (the public page) can
-- neither read nor write the raw table. Names + emails stay private, and the
-- only writer is the `submit-experts` edge function using the service-role key
-- (the service role bypasses RLS). Remove the old anon insert/update policies
-- if you are upgrading an existing project:
drop policy if exists "anon can insert" on public.submissions;
drop policy if exists "anon can update" on public.submissions;

-- 4. A public, privacy-safe view: allocations only, no names or emails, and
--    collapsed to the LATEST submission per email (so two-time submitters are
--    counted once). This is what the page reads to build the aggregate results.
create or replace view public.public_allocations
  with (security_invoker = false) as          -- runs as owner, bypasses table RLS
  select allocations
  from (
    select distinct on (email) email, allocations, created_at
    from public.submissions
    where confirmed                            -- only confirmed (double-opt-in) entries count
    order by email, created_at desc
  ) latest;

grant select on public.public_allocations to anon;

-- ── Done. Front-end needs only the Project URL + anon key (config.js), and the
--    submit-experts edge function deployed (supabase functions deploy). ──

-- ════════════════════════════════════════════════════════════════
--  Handy admin queries (run as you, in the SQL editor)
--  NOTE: allocations is now an ARRAY of {id,label,group,count,custom}. Unnest
--  with jsonb_array_elements, and dedup to latest-per-email first. The richer
--  canonical/weighted leaderboards live in migrations/100experts_analysis.sql.
-- ════════════════════════════════════════════════════════════════
--   Total responses (latest per email):
--     select count(distinct email) from public.submissions;
--
--   Raw leaderboard (avg per type, latest-per-email, by stable id):
--     with latest as (
--       select distinct on (email) email, allocations
--       from public.submissions order by email, created_at desc)
--     select (e->>'id') as expert_id,
--            max(e->>'label') as label,
--            round(avg((e->>'count')::numeric), 2) as avg_people,
--            count(*) as n_respondents
--     from latest, jsonb_array_elements(allocations) e
--     group by (e->>'id') order by avg_people desc;
--
--   Export everyone (for expertise weighting later — run after the analysis
--   migration so you can join public.respondents):
--     select name, email, allocations, reasoning, created_at
--     from public.latest_submissions order by created_at;
