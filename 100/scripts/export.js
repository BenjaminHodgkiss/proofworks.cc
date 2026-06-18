#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   Proofworks · 100 Experts — analysis export

   Pulls the survey data from Supabase (service role) and writes:
     - experts_full.csv / .json  → WITH PII (name, email, reasoning) + weights.
                                    Analyst-only. Never share or commit.
     - leaderboard.csv / .json   → aggregated, NO PII. Shareable.
     - custom_review.csv         → custom labels not yet folded via
                                    category_aliases (your review queue).

   Talks to the PostgREST REST API with raw fetch (same pattern as lib/email.js;
   no SDK dependency). Run AFTER supabase-setup.sql and
   migrations/100experts_analysis.sql have been applied.

   Usage:
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export.js [outDir]
   outDir defaults to ./exports (gitignored).
   ─────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'exports'));
const PAGE = 1000;   // PostgREST page size; we loop until a short page

// Fetch an entire table/view, paging through with limit/offset so nothing is
// silently truncated by the server's max-rows setting.
async function fetchAll(resource, query = '') {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const sep = query ? '&' : '';
    const url = `${SUPABASE_URL}/rest/v1/${resource}?${query}${sep}limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!res.ok) throw new Error(`Failed to fetch ${resource}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// CSV with RFC-4180 escaping (reasoning text can contain commas/quotes/newlines).
function toCsv(rows, columns) {
  const cell = v => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map(c => cell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

function write(name, contents) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, contents);
  console.log(`  wrote ${path.relative(process.cwd(), p)}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching from Supabase…');
  const [latest, respondents, canonical] = await Promise.all([
    fetchAll('latest_submissions', 'select=email,name,allocations,reasoning,meta,created_at&order=created_at'),
    fetchAll('respondents', 'select=email,display_name,expertise_tag,weight,affiliation,notes'),
    fetchAll('alloc_canonical', 'select=email,count,raw_label,is_custom,canonical_id,canonical_name,canonical_group,canonical_group_name')
  ]);

  const totalRespondents = latest.length;
  const weightByEmail = Object.fromEntries(respondents.map(r => [r.email, r]));
  console.log(`  ${totalRespondents} respondents, ${respondents.length} weighted, ${canonical.length} allocation rows`);

  // ── 1. Analyst export (WITH PII) ──
  const full = latest.map(s => {
    const r = weightByEmail[s.email] || {};
    return {
      created_at: s.created_at,
      name: s.name,
      email: s.email,
      weight: r.weight != null ? r.weight : '',
      expertise_tag: r.expertise_tag || '',
      affiliation: r.affiliation || '',
      reasoning_chars: (s.reasoning || '').length,
      reasoning: s.reasoning || '',
      catalog_version: (s.meta && s.meta.catalog_version) || '',
      allocations: s.allocations
    };
  });
  write('experts_full.json', JSON.stringify(full, null, 2));
  write('experts_full.csv', toCsv(full,
    ['created_at', 'name', 'email', 'weight', 'expertise_tag', 'affiliation', 'reasoning_chars', 'reasoning', 'catalog_version', 'allocations']));

  // ── 2. Leaderboard (NO PII, shareable) ──
  const agg = {};   // canonical_id -> tallies
  const customAgg = {};   // raw_label -> tallies (unassigned customs)
  for (const row of canonical) {
    if (row.canonical_id == null) {
      const k = row.raw_label || '(blank)';
      const c = customAgg[k] || (customAgg[k] = { raw_label: k, people: new Set(), total_people: 0 });
      c.people.add(row.email); c.total_people += row.count;
      continue;
    }
    const a = agg[row.canonical_id] || (agg[row.canonical_id] = {
      canonical_id: row.canonical_id,
      canonical_name: row.canonical_name,
      canonical_group_name: row.canonical_group_name,
      n_respondents: 0, total_people: 0, weighted_num: 0, weighted_den: 0
    });
    const w = weightByEmail[row.email] && weightByEmail[row.email].weight != null
      ? Number(weightByEmail[row.email].weight) : 1;
    a.n_respondents += 1;
    a.total_people += row.count;
    a.weighted_num += row.count * w;
    a.weighted_den += w;
  }
  const leaderboard = Object.values(agg).map(a => ({
    canonical_id: a.canonical_id,
    canonical_name: a.canonical_name,
    group: a.canonical_group_name,
    n_respondents: a.n_respondents,
    avg_pickers: round(a.total_people / a.n_respondents),       // avg among those who picked it
    avg_all: round(a.total_people / (totalRespondents || 1)),   // avg across all respondents
    total_people: a.total_people,
    weighted_avg: a.weighted_den ? round(a.weighted_num / a.weighted_den) : null
  })).sort((x, y) => y.avg_all - x.avg_all);
  write('leaderboard.json', JSON.stringify({ total_respondents: totalRespondents, leaderboard }, null, 2));
  write('leaderboard.csv', toCsv(leaderboard,
    ['canonical_id', 'canonical_name', 'group', 'n_respondents', 'avg_pickers', 'avg_all', 'total_people', 'weighted_avg']));

  // ── 3. Custom-term review queue ──
  const customReview = Object.values(customAgg)
    .map(c => ({ raw_label: c.raw_label, n_people: c.people.size, total_people: c.total_people }))
    .sort((a, b) => b.total_people - a.total_people);
  write('custom_review.csv', toCsv(customReview, ['raw_label', 'n_people', 'total_people']));

  console.log(`\nDone → ${outDir}`);
  console.log('experts_full.* contains PII — do not share or commit. leaderboard.* is safe to share.');
}

function round(n) { return Math.round(n * 100) / 100; }

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
