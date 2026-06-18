-- Migration: 100 Experts — analyst-side tables + analysis views
-- Run this manually in the Supabase dashboard SQL editor, AFTER
-- proofworks-100/supabase-setup.sql.
--
-- Everything here is private. None of these tables/views get an anon grant, so
-- under RLS the public page (anon key) cannot read them. Only the SQL editor
-- and the export script (service-role key) can. Re-runnable (idempotent).

-- ════════════════════════════════════════════════════════════════
--  1. Analyst-side tables
-- ════════════════════════════════════════════════════════════════

-- Canonical catalog: the authoritative list of expert types, mirroring
-- proofworks-100/config.js (PW_GROUPS + PW_CATEGORIES). Submissions snapshot the
-- LABEL they showed at submit time; analysis joins on the stable `id` here, so
-- renaming a type in config.js never orphans historical data — just update the
-- canonical_name below to match.
create table if not exists public.category_catalog (
  id             text primary key,           -- stable config.js category id, e.g. 'crypto'
  group_id       text not null,              -- config.js group id, e.g. 'protocols'
  group_name     text not null,
  canonical_name text not null,
  active         boolean not null default true
);

-- Hand-maintained folding of free-text custom additions into canonical types.
-- You populate this from the "custom-term review" query below. A NULL
-- canonical_id is meaningful: "this is a genuinely new type, keep it separate".
create table if not exists public.category_aliases (
  raw_label    text primary key,             -- exact custom label as typed, e.g. 'FPGA eng.'
  canonical_id text references public.category_catalog(id),  -- null = real new type
  note         text,
  created_at   timestamptz not null default now()
);

-- Per-respondent expertise + weighting, keyed by email. You fill this in by hand
-- (you know who everyone is). The weighted leaderboard joins it; default weight 1.
create table if not exists public.respondents (
  email         text primary key,
  display_name  text,
  expertise_tag text,                        -- your free-form domain tag(s)
  weight        numeric not null default 1.0,
  affiliation   text,
  notes         text,
  updated_at    timestamptz not null default now()
);

-- Lock them all down (default-deny under RLS = invisible to the anon key).
alter table public.category_catalog enable row level security;
alter table public.category_aliases enable row level security;
alter table public.respondents      enable row level security;

-- ════════════════════════════════════════════════════════════════
--  2. Seed the catalog from config.js (PW_GROUPS + PW_CATEGORIES)
--     Keep ids in sync with config.js. Re-runnable via on-conflict upsert.
-- ════════════════════════════════════════════════════════════════
insert into public.category_catalog (id, group_id, group_name, canonical_name) values
  ('chip',        'hwdesign',    'Hardware and software engineering',                'Chip-design engineers'),
  ('fpga',        'hwdesign',    'Hardware and software engineering',                'FPGA engineers'),
  ('fab',         'hwdesign',    'Hardware and software engineering',                'Semiconductor fab engineers'),
  ('firmware',    'hwdesign',    'Hardware and software engineering',                'Embedded/firmware & trusted-software engineers'),
  ('hweng',       'hwdesign',    'Hardware and software engineering',                'Hardware engineers (non-semiconductor)'),
  ('antitamper',  'hwsec',       'Hardware security, inspection & supply-chain',     'Anti-tamper engineers'),
  ('hwattack',    'hwsec',       'Hardware security, inspection & supply-chain',     'Hardware attack & defence researchers'),
  ('inspection',  'hwsec',       'Hardware security, inspection & supply-chain',     'Physical inspection & hardware analysis experts'),
  ('tee',         'hwsec',       'Hardware security, inspection & supply-chain',     'Secure-hardware (RoT/TPM/TEE/enclave) engineers'),
  ('sidechan',    'hwsec',       'Hardware security, inspection & supply-chain',     'Side-channel analysis experts'),
  ('supplysec',   'hwsec',       'Hardware security, inspection & supply-chain',     'Supply-chain experts: Security'),
  ('dcsec',       'infra',       'Infrastructure & monitoring',                      'Physical & operational security experts'),
  ('dcops',       'infra',       'Infrastructure & monitoring',                      'Data-centre builders & operators'),
  ('neteng',      'infra',       'Infrastructure & monitoring',                      'Networking/optical-networking engineers'),
  ('crypto',      'protocols',   'Protocols, proofs, assurance & red-teaming',       'Cryptographers'),
  ('formal',      'protocols',   'Protocols, proofs, assurance & red-teaming',       'Formal-verification experts'),
  ('redteam',     'protocols',   'Protocols, proofs, assurance & red-teaming',       'Offensive OC5-level cyber experts'),
  ('tcb',         'protocols',   'Protocols, proofs, assurance & red-teaming',       'Secure-systems-architecture/minimal-TCB experts'),
  ('stats',       'protocols',   'Protocols, proofs, assurance & red-teaming',       'Statisticians (sampling/statistical safeguards)'),
  ('stpa',        'protocols',   'Protocols, proofs, assurance & red-teaming',       'Systems-theoretic safety/security analysis'),
  ('integration', 'buildrun',    'Building, testing & running the system',           'Systems integration engineers'),
  ('tev',         'buildrun',    'Building, testing & running the system',           'Test & evaluation/independent V&V engineers'),
  ('opssustain',  'buildrun',    'Building, testing & running the system',           'Operations & sustainment/lifecycle leads'),
  ('techpm',      'buildrun',    'Building, testing & running the system',           'Technical project managers'),
  ('evals',       'aiml',        'AI/ML expertise',                                  'Model evaluations, auditing, safety, control, and oversight experts'),
  ('mlsys',       'aiml',        'AI/ML expertise',                                  'ML systems & frontier ML researchers'),
  ('export',      'darkcompute', 'Dark-compute detection',                           'Export-control/compliance specialists'),
  ('intel',       'darkcompute', 'Dark-compute detection',                           'Intelligence-collection experts'),
  ('energy',      'darkcompute', 'Dark-compute detection',                           'Energy & power-grid analysts'),
  ('supplysme',   'darkcompute', 'Dark-compute detection',                           'Supply-chain experts: SM/SME'),
  ('whistle',     'darkcompute', 'Dark-compute detection',                           'Whistleblower-program experts'),
  ('armscontrol', 'governance',  'Governance, diplomacy & law',                      'Arms-control verification theorists'),
  ('diplomacy',   'governance',  'Governance, diplomacy & law',                      'Political-feasibility & diplomacy experts'),
  ('managedaccess','governance', 'Governance, diplomacy & law',                      'Confidentiality/managed-access & inspection-data protection experts'),
  ('standards',   'governance',  'Governance, diplomacy & law',                      'Standards, governance, international-agreement & legal experts'),
  ('treaty',      'governance',  'Governance, diplomacy & law',                      'Treaty enforcement experts and inspectors'),
  ('comms',       'governance',  'Governance, diplomacy & law',                      'Communicators and advocates')
on conflict (id) do update
  set group_id = excluded.group_id,
      group_name = excluded.group_name,
      canonical_name = excluded.canonical_name,
      active = true;

-- ════════════════════════════════════════════════════════════════
--  3. Analysis views (all built on ONE latest-per-email base, so dedup
--     happens exactly once and re-submitters are never double-counted).
-- ════════════════════════════════════════════════════════════════

-- The analysis base is confirmed-only (double-opt-in). Ensure the column exists
-- first, so this file is self-sufficient and order-independent — it works even
-- if run before supabase-setup.sql / 100experts_confirmation.sql add it.
alter table public.submissions add column if not exists confirmed boolean not null default false;

-- Latest submission per email, WITH PII (service role only). security_invoker=on
-- makes the view honour the CALLER's RLS: anon has no policy on submissions so it
-- sees nothing; service_role bypasses RLS so export.js still reads everything.
-- (Without this, the view runs as owner and leaks every row to the anon key.)
create or replace view public.latest_submissions with (security_invoker = on) as
  select distinct on (email) id, email, name, allocations, reasoning, meta, created_at
  from public.submissions
  where confirmed                              -- analysis counts only confirmed (double-opt-in) entries
  order by email, created_at desc;

-- One row per (latest submission, allocated category). security_invoker=on so it
-- inherits latest_submissions' RLS behaviour (no anon exposure).
create or replace view public.alloc_long with (security_invoker = on) as
  select l.email,
         l.created_at,
         (e->>'id')             as raw_id,
         (e->>'label')          as raw_label,
         (e->>'group')          as group_id,
         (e->>'count')::int     as count,
         coalesce((e->>'custom')::boolean, false) as is_custom
  from public.latest_submissions l,
       jsonb_array_elements(l.allocations) e;

-- Fold custom labels via category_aliases; for catalog types use their id.
-- canonical_id NULL = an unassigned custom term (surface it in the review query).
-- security_invoker=on so it inherits the no-anon-exposure behaviour.
create or replace view public.alloc_canonical with (security_invoker = on) as
  select al.email,
         al.created_at,
         al.count,
         al.raw_id,
         al.raw_label,
         al.is_custom,
         coalesce(a.canonical_id,
                  case when al.is_custom then null else al.raw_id end) as canonical_id,
         cc.canonical_name,
         cc.group_id   as canonical_group,
         cc.group_name as canonical_group_name
  from public.alloc_long al
  left join public.category_aliases a on a.raw_label = al.raw_label
  left join public.category_catalog cc
         on cc.id = coalesce(a.canonical_id,
                             case when al.is_custom then null else al.raw_id end);

-- Defence in depth: explicitly strip anon/authenticated access to the PII views
-- (Supabase auto-grants SELECT to anon on new views), and make sure the export
-- script's service_role keeps it. security_invoker above already blocks anon,
-- but a revoke turns a silent empty result into an outright permission denial.
revoke all on public.latest_submissions from anon, authenticated;
revoke all on public.alloc_long         from anon, authenticated;
revoke all on public.alloc_canonical    from anon, authenticated;
grant  select on public.latest_submissions, public.alloc_long, public.alloc_canonical to service_role;

-- ════════════════════════════════════════════════════════════════
--  4. Ready-to-run analysis queries (copy/paste in the SQL editor)
-- ════════════════════════════════════════════════════════════════
--
--   Raw leaderboard (avg people per type across respondents who picked it):
--     select canonical_id, canonical_name,
--            round(avg(count)::numeric, 2) as avg_people,
--            sum(count) as total_people, count(*) as n_respondents
--     from public.alloc_canonical
--     where canonical_id is not null
--     group by canonical_id, canonical_name order by avg_people desc;
--     -- avg over ALL respondents instead: divide sum(count) by
--     --   (select count(*) from public.latest_submissions)
--
--   Weighted leaderboard (join your hand-set respondents.weight):
--     select ac.canonical_id, ac.canonical_name,
--            round(sum(ac.count * coalesce(r.weight,1))
--                  / nullif(sum(coalesce(r.weight,1)),0), 2) as weighted_avg
--     from public.alloc_canonical ac
--     left join public.respondents r on r.email = ac.email
--     where ac.canonical_id is not null
--     group by ac.canonical_id, ac.canonical_name order by weighted_avg desc;
--
--   Per-group rollup:
--     select canonical_group, canonical_group_name,
--            sum(count) as total, round(avg(count),2) as avg_per_respondent
--     from public.alloc_canonical where canonical_id is not null
--     group by canonical_group, canonical_group_name order by total desc;
--
--   Custom-term review queue (distinct custom labels with no alias yet):
--     select al.raw_label,
--            count(distinct al.email) as n_people, sum(al.count) as total_people
--     from public.alloc_long al
--     left join public.category_aliases a on a.raw_label = al.raw_label
--     where al.is_custom and a.raw_label is null
--     group by al.raw_label order by total_people desc;
--     -- then: insert into public.category_aliases (raw_label, canonical_id, note)
--     --       values ('FPGA eng.', 'fpga', 'typo variant');
--
--   Reasoning corpus:
--     select email, name, length(reasoning) as chars, reasoning, created_at
--     from public.latest_submissions
--     where coalesce(reasoning,'') <> '' order by created_at;

-- ════════════════════════════════════════════════════════════════
--  5. Backfill note (only if you already have OLD-shape rows)
-- ════════════════════════════════════════════════════════════════
-- The exercise is pre-launch, so there is normally NOTHING to backfill.
-- Old rows stored allocations as an object keyed by DISPLAY NAME:
--   { "Cryptographers": 10, ... }
-- New rows store an ARRAY: [{id,label,group,count,custom}, ...].
-- If `select count(*) from public.submissions` > 0 with the old shape, convert
-- in place by reverse-mapping display name -> id via category_catalog:
--
--   update public.submissions s set allocations = sub.arr
--   from (
--     select s2.id,
--       jsonb_agg(jsonb_build_object(
--         'id',    coalesce(cc.id, 'custom_' || lower(regexp_replace(kv.key,'[^a-z0-9]+','_','g'))),
--         'label', kv.key,
--         'group', coalesce(cc.group_id, 'custom'),
--         'count', kv.value::int,
--         'custom', cc.id is null)) as arr
--     from public.submissions s2,
--          jsonb_each_text(s2.allocations) kv
--     left join public.category_catalog cc on cc.canonical_name = kv.key
--     where jsonb_typeof(s2.allocations) = 'object'
--     group by s2.id) sub
--   where s.id = sub.id;
--
-- PITFALL: any type RENAMED in config.js between collection and backfill won't
-- reverse-match by canonical_name and will be marked custom. If a rename
-- happened, map those names by hand (or temporarily restore the old names).
