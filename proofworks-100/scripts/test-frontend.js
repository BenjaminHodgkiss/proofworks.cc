#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   100 Experts — front-end (browser) tests, driven with Playwright.

   Drives the real page in headless Chromium against the live backend, walking
   the "user submits their 100" journey + key edge cases (§1 of TESTING.md).
   Submits use throwaway @e2e.test emails (clean up after).

   Run:  node proofworks-100/scripts/test-frontend.js
         BASE_URL=http://localhost:3000/proofworks-100/ (override if needed)
   Screenshots land in proofworks-100/exports/ (gitignored).
   ─────────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');

let chromium;
for (const p of ['playwright', 'playwright-core',
  path.join(process.env.HOME, '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')]) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error('Could not load Playwright.'); process.exit(1); }

const BASE = process.env.BASE_URL || 'http://localhost:3000/proofworks-100/';
const SHOT_DIR = path.join(__dirname, '..', 'exports');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const ts = Date.now();
const email = () => `fe-${ts}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

let pass = 0, fail = 0; const failures = [];
async function check(id, desc, fn) {
  try {
    const r = await fn();
    if (r === true) { pass++; console.log(`  ✅ ${id}  ${desc}`); }
    else { fail++; failures.push(`${id} ${desc} → ${r}`); console.log(`  ❌ ${id}  ${desc} → ${r}`); }
  } catch (e) { fail++; failures.push(`${id} ${desc} → ERR ${e.message}`); console.log(`  ❌ ${id}  ${desc} → ERR ${e.message}`); }
}

// helpers operating on the page
const placed = page => page.$eval('#placed', el => +el.textContent);
const setCard = async (page, id, val) => {     // fill a category card's number input
  const inp = page.locator(`.card[data-id="${id}"] input[type="number"]`);
  await inp.fill(String(val));
  await page.locator('h1').first().click({ position: { x: 1, y: 1 } }).catch(() => {}); // blur
};
// Wait for the Turnstile widget to issue a token before a real submit (the
// always-passes test sitekey solves near-instantly; this avoids a race where we
// click before the token exists). Tolerates absence so failures surface downstream.
const waitForTurnstile = page => page.waitForFunction(
  () => window.turnstile && !!window.turnstile.getResponse(), { timeout: 15000 }
).catch(() => {});

async function main() {
  console.log(`\n100 Experts front-end suite → ${BASE}\n`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.card[data-id]');

  console.log('§1a Load & render');
  await check('FE1', '100 dots rendered', async () => (await page.locator('#dotgrid .dot').count()) === 100 || `got ${await page.locator('#dotgrid .dot').count()}`);
  await check('FE2', '37 category cards rendered', async () => { const n = await page.locator('.card[data-id]').count(); return n === 37 ? true : `got ${n}`; });
  await check('FE3', 'submit disabled at load', async () => (await page.locator('#submit').isDisabled()) ? true : 'enabled');
  await check('FE4', 'no JS errors on load', async () => errors.length === 0 ? true : errors.join('; '));

  console.log('\n§1b Allocation mechanics');
  await check('FE5', 'stepper + increments + dots fill', async () => {
    await page.locator('.card[data-id="crypto"] .plus').click();
    const p = await placed(page); const dots = await page.locator('#dotgrid .dot.filled').count();
    return (p === 1 && dots === 1) ? true : `placed=${p} dots=${dots}`;
  });
  await check('FE6', 'budget cap blocks overflow', async () => {
    await setCard(page, 'crypto', 90);             // total 90
    await setCard(page, 'formal', 20);             // would be 110 → rejected
    const p = await placed(page);
    const f = await page.$eval('.card[data-id="formal"] input', el => el.value);
    return (p === 90 && (f === '0' || f === '')) ? true : `placed=${p} formal=${f}`;
  });
  await check('FE7', 'reach exactly 100 enables submit', async () => {
    await setCard(page, 'formal', 10);             // 90 + 10 = 100
    const p = await placed(page);
    const dis = await page.locator('#submit').isDisabled();
    const state = await page.$eval('#state', el => el.textContent);
    return (p === 100 && !dis && /ready/.test(state)) ? true : `placed=${p} disabled=${dis} state="${state}"`;
  });

  console.log('\n§1d Submit validation (native HTML5 layer + JS fallback layer)');
  await check('FE8', 'empty name blocked by native validation (no submit)', async () => {
    await page.fill('#name', ''); await page.fill('#email', 'valid@e2e.test');
    await page.click('#submit');
    const invalid = await page.$eval('#name', el => !el.checkValidity());
    const onDone = await page.locator('#done.show').count();
    return (invalid && onDone === 0) ? true : `nameInvalid=${invalid} onDone=${onDone}`;
  });
  await check('FE8b', 'whitespace-only name → JS "add your name"', async () => {
    await page.fill('#name', '   '); await page.fill('#email', 'valid@e2e.test');
    await page.click('#submit');
    const err = await page.$eval('#err', el => el.textContent);
    return /name/i.test(err) ? true : `err="${err}"`;
  });
  await check('FE9', 'malformed email blocked by native validation', async () => {
    await page.fill('#name', 'E2E Tester'); await page.fill('#email', 'not-an-email');
    await page.click('#submit');
    const invalid = await page.$eval('#email', el => !el.checkValidity());
    const onDone = await page.locator('#done.show').count();
    return (invalid && onDone === 0) ? true : `emailInvalid=${invalid} onDone=${onDone}`;
  });
  await check('FE9b', 'email "a@b" passes native, caught by JS regex', async () => {
    await page.fill('#name', 'E2E Tester'); await page.fill('#email', 'a@b');
    await page.click('#submit');
    const err = await page.$eval('#err', el => el.textContent);
    return /email/i.test(err) ? true : `err="${err}"`;
  });

  console.log('\n§1e Happy path + acknowledgement');
  const myEmail = email();
  await check('FE10', 'valid submit → acknowledgement screen', async () => {
    await page.fill('#name', 'E2E Tester'); await page.fill('#email', myEmail);
    await waitForTurnstile(page);
    await page.click('#submit');
    await page.waitForSelector('#done.show', { timeout: 15000 });
    return true;
  });
  await check('FE11', 'confirm-email message shown (double-opt-in gate)', async () => {
    const txt = await page.$eval('#doneMsg', el => el.textContent).catch(() => '');
    return /confirm/i.test(txt) ? true : `txt="${txt.slice(0, 60)}"`;
  });
  await page.screenshot({ path: path.join(SHOT_DIR, 'fe-done.png'), fullPage: true });

  console.log('\n§1c/1e Adjust, custom, re-submit');
  await check('FE14', '"adjust my answer" returns to builder', async () => {
    await page.click('#again');
    await page.waitForSelector('#builder:not(.hidden)');
    return (await page.locator('#submit').count()) ? true : 'builder missing';
  });
  await check('FE15', 'add custom type appears under Your additions', async () => {
    await page.fill('.addcard input[type="text"]', 'Optical imaging specialists');
    await page.click('.addcard .addbtn');
    const n = await page.locator('.card .name', { hasText: 'Optical imaging specialists' }).count();
    return n >= 1 ? true : 'custom card not found';
  });
  await check('FE16', 're-submit same email succeeds (replace-on-confirm)', async () => {
    // rebuild to 100: clear crypto/formal, put 100 on a custom + catalog mix
    await setCard(page, 'crypto', 100);
    await page.fill('#name', 'E2E Tester'); await page.fill('#email', myEmail);
    const p = await placed(page);
    if (p !== 100) return `placed=${p} before resubmit`;
    await waitForTurnstile(page);
    await page.click('#submit');
    await page.waitForSelector('#done.show', { timeout: 15000 });
    return true;
  });

  console.log(`\nNo uncaught page errors during run: ${errors.length === 0 ? 'yes' : 'NO — ' + errors.join('; ')}`);
  await browser.close();

  console.log(`\n${'─'.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed   (screenshots in exports/)`);
  if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  • ' + f)); }
  console.log(`\nCleanup: delete from public.submissions where email like '%@e2e.test';`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
