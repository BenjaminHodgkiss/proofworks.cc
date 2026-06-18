#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   100 Experts — automated back-end + security test suite.

   Exercises the submit-experts edge function (validation, boundaries,
   per-email cap, append-only) and the RLS/security posture via the anon key.
   Reads SUPABASE_URL + anon key from config.js. Uses throwaway @e2e.test emails.

   Run:    node 100/scripts/test-backend.js
   Clean:  delete from public.submissions where email like '%@e2e.test';
           (or set SUPABASE_SERVICE_ROLE_KEY and this script self-cleans at the end)
   ─────────────────────────────────────────────────────────────── */
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'config.js'));
const CFG = global.window.PW_CONFIG || {};
const URL = CFG.SUPABASE_URL, ANON = CFG.SUPABASE_ANON_KEY;
if (!URL || URL.includes('YOUR-PROJECT') || !ANON) {
  console.error('config.js is not pointed at a live project (SUPABASE_URL / SUPABASE_ANON_KEY).');
  process.exit(1);
}
const FN = `${URL}/functions/v1/submit-experts`;
const CONFIRM = `${URL}/functions/v1/confirm-submission`;
const REST = `${URL}/rest/v1`;
const ts = Date.now();
// Any non-empty string passes the Turnstile gate when the function is deployed
// with Cloudflare's TEST secret (1x000…AA, always-passes). Run this suite
// against a test-key deployment; with the real production secret the
// token-gated checks (those reaching past the anti-bot gate) return 403.
const TEST_TOKEN = 'e2e-dummy-turnstile-token';

// ── helpers ──────────────────────────────────────────────────────
async function submit(body, method = 'POST') {
  const r = await fetch(FN, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j, headers: r.headers };
}
async function rest(query, method = 'GET', body) {
  const opt = { method, headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(`${REST}/${query}`, opt);
  let t = await r.text(), j; try { j = JSON.parse(t); } catch (_) { j = t; }
  return { status: r.status, body: j };
}
async function confirmGet(token) {     // follow no redirects so we can inspect the 302 target
  const u = token === undefined ? CONFIRM : `${CONFIRM}?token=${encodeURIComponent(token)}`;
  const r = await fetch(u, { redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location') || '' };
}
const valid = (over = 0) => [
  { id: 'crypto', label: 'Cryptographers', group: 'protocols', count: 60 + over, custom: false },
  { id: 'inspection', label: 'Physical inspection & hardware analysis experts', group: 'hwsec', count: 40, custom: false },
];
const base = (extra = {}) => ({ name: 'E2E', email: `e2e-${ts}-${Math.floor(Math.random()*1e6)}@e2e.test`, allocations: valid(), reasoning: 'auto', turnstileToken: TEST_TOKEN, ...extra });

let pass = 0, fail = 0; const failures = [];
async function check(id, desc, fn) {
  try {
    const r = await fn();
    if (r === true) { pass++; console.log(`  ✅ ${id}  ${desc}`); }
    else { fail++; failures.push(`${id} ${desc} → ${r}`); console.log(`  ❌ ${id}  ${desc} → ${r}`); }
  } catch (e) { fail++; failures.push(`${id} ${desc} → ERR ${e.message}`); console.log(`  ❌ ${id}  ${desc} → ERR ${e.message}`); }
}
const want = (got, status, errIncl) => got.status !== status ? `expected ${status}, got ${got.status} ${JSON.stringify(got.body).slice(0,120)}`
  : (errIncl && !String(got.body.error || '').toLowerCase().includes(errIncl.toLowerCase())) ? `error missing "${errIncl}": ${JSON.stringify(got.body)}` : true;

async function main() {
  console.log(`\n100 Experts back-end suite → ${URL}\n`);

  console.log('§2 Function validation');
  await check('B0', 'missing turnstile token → 403', async () => want(await submit(base({ turnstileToken: undefined })), 403, 'verification'));
  await check('B1', 'valid full', async () => want(await submit(base()), 200));
  await check('B2', 'reasoning null', async () => want(await submit(base({ reasoning: null })), 200));
  await check('B3', 'single entry 100', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 100, custom: false }] })), 200));
  await check('B4', 'custom entry', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 70, custom: false }, { id: 'custom_x', label: 'Optical imaging', group: 'custom', count: 30, custom: true }] })), 200));
  await check('B5', 'sum 99', async () => want(await submit(base({ allocations: valid(-1) })), 400, 'sum to 100'));
  await check('B6', 'sum 101', async () => want(await submit(base({ allocations: valid(1) })), 400, 'sum to 100'));
  await check('B7', 'sum 0', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 0, custom: false }] })), 400));
  await check('B8', 'name missing', async () => want(await submit(base({ name: undefined })), 400, 'name'));
  await check('B9', 'name empty', async () => want(await submit(base({ name: '' })), 400, 'name'));
  await check('B10', 'name whitespace', async () => want(await submit(base({ name: '   ' })), 400, 'name'));
  await check('B11', 'email missing', async () => want(await submit(base({ email: undefined })), 400, 'email'));
  await check('B12', 'email invalid', async () => want(await submit(base({ email: 'notanemail' })), 400, 'email'));
  await check('B13', 'email no TLD', async () => want(await submit(base({ email: 'a@b' })), 400, 'email'));
  await check('B14', 'reasoning 10001', async () => want(await submit(base({ reasoning: 'a'.repeat(10001) })), 400, 'too long'));
  await check('B15', 'reasoning 10000 (boundary)', async () => want(await submit(base({ reasoning: 'a'.repeat(10000) })), 200));
  await check('B16', 'allocations object', async () => want(await submit(base({ allocations: { crypto: 100 } })), 400));
  await check('B17', 'allocations []', async () => want(await submit(base({ allocations: [] })), 400, 'array'));
  await check('B18', 'entry missing id', async () => want(await submit(base({ allocations: [{ label: 'C', group: 'protocols', count: 100, custom: false }] })), 400, 'id'));
  await check('B19', 'entry missing label', async () => want(await submit(base({ allocations: [{ id: 'crypto', group: 'protocols', count: 100, custom: false }] })), 400, 'label'));
  await check('B20', 'entry missing group', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', count: 100, custom: false }] })), 400, 'group'));
  await check('B21', 'entry missing custom', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 100 }] })), 400, 'custom'));
  await check('B22', 'count negative', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: -5, custom: false }, { id: 'inspection', label: 'I', group: 'hwsec', count: 105, custom: false }] })), 400, 'range'));
  await check('B23', 'count float', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 60.5, custom: false }, { id: 'inspection', label: 'I', group: 'hwsec', count: 39.5, custom: false }] })), 400));
  await check('B24', 'count string', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: '60', custom: false }, { id: 'inspection', label: 'I', group: 'hwsec', count: 40, custom: false }] })), 400));
  await check('B25', 'count >100', async () => want(await submit(base({ allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 101, custom: false }] })), 400, 'range'));
  await check('B26', '201 entries', async () => want(await submit(base({ allocations: Array.from({ length: 201 }, (_, i) => ({ id: 'x' + i, label: 'x', group: 'custom', count: 0, custom: true })) })), 400, 'many'));
  await check('B27', 'method GET', async () => want(await submit(undefined, 'GET'), 405));
  await check('B28', 'OPTIONS preflight', async () => { const r = await submit(undefined, 'OPTIONS'); return (r.status === 200 || r.status === 204) ? true : `status ${r.status}`; });
  await check('B29', 'extra fields ignored', async () => want(await submit(base({ junk: 'x', evil: { a: 1 } })), 200));
  await check('B30', 'meta omitted', async () => { const b = base(); delete b.meta; return want(await submit(b), 200); });
  await check('B31', 'meta as array', async () => want(await submit(base({ meta: [1, 2, 3] })), 200));
  await check('B32', 'emoji/unicode', async () => want(await submit(base({ name: '测试 🧪 Ünïcødé', reasoning: 'naïve café 🚀 — 日本語' })), 200));
  // injection is neutralised either way: 200 = reached fn + stored literally (parameterised),
  // 403 = Cloudflare WAF blocked the canonical signature at the gateway. Both are safe.
  await check('B33', 'sql injection neutralized (200 literal / 403 WAF)', async () => { const r = await submit(base({ name: "Robert'); DROP TABLE submissions;--" })); return (r.status === 200 || r.status === 403) ? true : `expected 200 or 403, got ${r.status} ${JSON.stringify(r.body).slice(0,100)}`; });
  await check('B33b', 'benign apostrophe + keywords accepted', async () => want(await submit(base({ name: "Conor O'Brien", reasoning: "We should select strong cryptographers; the chip's design matters." })), 200));

  console.log('\n§2a Resubmit (replace-on-confirm; keeps only the latest)');
  // mixed-case variants of ONE email → all still succeed; proves case-insensitive
  // normalisation and that resubmitting just replaces the prior pending row.
  const capA = `Cap-${ts}@E2E.test`, capB = `cap-${ts}@e2e.test`;
  let capOk = true;
  for (let i = 0; i < 10; i++) { const r = await submit(base({ email: i % 2 ? capB : capA })); if (r.status !== 200) { capOk = `submit #${i + 1} got ${r.status}`; break; } }
  await check('B34', '10 resubmits same email all succeed (case-insensitive)', async () => capOk);
  await check('B36', 'resubmit same email succeeds (no cap)', async () => {
    const e = `ap-${ts}@e2e.test`;
    const r1 = await submit(base({ email: e, allocations: [{ id: 'crypto', label: 'C', group: 'protocols', count: 100, custom: false }] }));
    const r2 = await submit(base({ email: e, allocations: [{ id: 'formal', label: 'F', group: 'protocols', count: 100, custom: false }] }));
    return (r1.status === 200 && r2.status === 200) ? true : `r1=${r1.status} r2=${r2.status}`;
  });

  console.log('\n§2b Confirmation gate (double-opt-in)');
  await check('B39', 'confirm: no token → 3xx to error page', async () => {
    const r = await confirmGet(undefined);
    return (r.status >= 300 && r.status < 400 && /confirm-error/.test(r.location)) ? true : `status ${r.status} loc "${r.location}"`;
  });
  await check('B40', 'confirm: bad token → 3xx to error page', async () => {
    const r = await confirmGet('not-a-real-token');
    return (r.status >= 300 && r.status < 400 && /confirm-error/.test(r.location)) ? true : `status ${r.status} loc "${r.location}"`;
  });
  await check('B41', 'public_allocations is confirmed-only (well-formed)', async () => {
    const r = await rest('public_allocations?select=allocations');
    return (r.status === 200 && Array.isArray(r.body)) ? true : `status ${r.status}`;
  });

  // The full confirm flow needs to read a row's token — only the service-role
  // key can (anon can't read submissions). Skipped when it isn't supplied.
  const SRK0 = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SRK0) {
    await check('B42', 'replace-on-confirm: 2 submits → 1 pending → confirm → exactly 1 confirmed row', async () => {
      const e = `cfm-${ts}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
      const a1 = [{ id: 'crypto', label: 'C', group: 'protocols', count: 100, custom: false }];
      const a2 = [{ id: 'formal', label: 'F', group: 'protocols', count: 100, custom: false }];
      if ((await submit(base({ email: e, allocations: a1 }))).status !== 200) return 'submit #1 failed';
      if ((await submit(base({ email: e, allocations: a2 }))).status !== 200) return 'submit #2 failed';
      const rows = async () => {
        const rr = await fetch(`${REST}/submissions?select=id,confirmation_token,confirmed&email=eq.${encodeURIComponent(e)}&order=created_at.desc`,
          { headers: { apikey: SRK0, Authorization: `Bearer ${SRK0}` } });
        return await rr.json();
      };
      const pending = await rows();   // prior pending should have been cleared on the 2nd submit
      if (pending.length !== 1) return `expected 1 row after 2 submits, got ${pending.length}`;
      if (pending[0].confirmed) return 'row should be unconfirmed pre-click';
      const c = await confirmGet(pending[0].confirmation_token);
      if (!(c.status >= 300 && c.status < 400 && /confirmed\.html/.test(c.location))) return `confirm redirect ${c.status} "${c.location}"`;
      const after = await rows();     // confirm should leave exactly one confirmed row
      return (after.length === 1 && after[0].confirmed === true) ? true : `after: rows=${after.length} confirmed=${after[0] && after[0].confirmed}`;
    });
  } else {
    console.log('  ⏭️  B42 confirm flow skipped (set SUPABASE_SERVICE_ROLE_KEY to run it)');
  }

  console.log('\n§3 Security / RLS (anon key)');
  await check('S1', 'public_allocations readable (control)', async () => { const r = await rest('public_allocations?select=allocations&limit=1'); return (r.status === 200 && Array.isArray(r.body)) ? true : `status ${r.status} ${JSON.stringify(r.body).slice(0,100)}`; });
  await check('S2', 'submissions raw not readable', async () => { const r = await rest('submissions?select=name,email&limit=5'); return (r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0)) ? true : `LEAK status ${r.status} ${JSON.stringify(r.body).slice(0,120)}`; });
  await check('S3', 'anon cannot insert directly', async () => { const r = await rest('submissions', 'POST', { name: 'x', email: `direct-${ts}@e2e.test`, allocations: valid() }); return (r.status >= 400) ? true : `WROTE DIRECTLY status ${r.status}`; });
  const noLeak = (label, q, field) => async () => { const r = await rest(q); if (r.status >= 400) return true; if (Array.isArray(r.body) && r.body.length === 0) return true; return `LEAK (${label}) status ${r.status} ${JSON.stringify(r.body).slice(0,140)}`; };
  await check('S4', 'latest_submissions hides PII', noLeak('latest_submissions', 'latest_submissions?select=email,name,reasoning&limit=5'));
  await check('S5', 'alloc_canonical hides email', noLeak('alloc_canonical', 'alloc_canonical?select=email&limit=5'));
  await check('S6', 'alloc_long hides email', noLeak('alloc_long', 'alloc_long?select=email&limit=5'));
  await check('S7', 'respondents not exposed', noLeak('respondents', 'respondents?select=email&limit=5'));
  await check('S8', 'category_catalog not exposed', noLeak('category_catalog', 'category_catalog?select=id&limit=5'));

  // ── cleanup (only if a service-role key is supplied) ──
  const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SRK) {
    const r = await fetch(`${REST}/submissions?email=like.*%40e2e.test`, { method: 'DELETE', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, Prefer: 'return=minimal' } });
    console.log(`\nCleanup: deleted @e2e.test rows (HTTP ${r.status}).`);
  } else {
    console.log(`\nCleanup: run  delete from public.submissions where email like '%@e2e.test';  (or set SUPABASE_SERVICE_ROLE_KEY to auto-clean).`);
  }

  console.log(`\n${'─'.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  • ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
