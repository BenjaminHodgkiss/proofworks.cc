// One-off: backfill the BCC that didn't get sent.
//
// benjamin@proofworks.cc was meant to receive a copy of every 100 Experts
// confirmation email, but the BCC was only ever wired into the SITE's mailer,
// not this survey's. A couple of confirmation emails went out before that was
// noticed. This reconstructs each one from the stored submission and sends a
// COPY to benjamin@proofworks.cc — and nobody else.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-bcc.mjs
//       → DRY RUN: render each copy to exports/, list who it's for, send nothing.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... \
//     node scripts/backfill-bcc.mjs --send
//       → actually send each copy to benjamin@proofworks.cc only.
//
// Notes:
//   • benjamin@ is the ONLY recipient: `to` is hard-coded, there is no cc/bcc,
//     and the respondent's address is never placed in any recipient field.
//   • The confirm link is DEFUSED (href "#"): the copy keeps the original
//     "Confirm my submission" layout but can't confirm anyone's submission.
//   • Service-role key reads PII (names, emails, reasoning) — run locally, never
//     commit the env. Imports the SAME template the edge function uses.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderConfirmationEmail } from '../supabase/functions/_shared/confirmation-email.ts'

const RECIPIENT = 'benjamin@proofworks.cc'                       // the ONLY recipient, ever
const FROM_ADDRESS = '100 experts exercise <updates@proofworks.cc>'
const SKIP_DOMAINS = ['@e2e.test']                              // test fixtures, not real respondents

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'exports')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = process.env
const SEND = process.argv.includes('--send')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (SEND && !RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY (required with --send)')
  process.exit(1)
}

async function fetchSubmissions() {
  const cols = 'name,email,allocations,reasoning,confirmed,created_at'
  const url = `${SUPABASE_URL}/rest/v1/submissions?select=${cols}&order=created_at`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sendCopy(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // to: benjamin ONLY. Deliberately no cc / no bcc.
    body: JSON.stringify({ from: FROM_ADDRESS, to: RECIPIENT, subject, html })
  })
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`)
  return res.json()
}

const slug = (e) => e.replace(/[^a-z0-9]+/gi, '_').toLowerCase()

const all = await fetchSubmissions()
const rows = all.filter((r) => !SKIP_DOMAINS.some((d) => (r.email || '').endsWith(d)))
const skipped = all.length - rows.length

mkdirSync(outDir, { recursive: true })
console.log(`${all.length} submission row(s); ${skipped} test row(s) skipped; ${rows.length} to copy.`)
console.log(`Every copy goes to ${RECIPIENT} and no one else.\n`)

for (const r of rows) {
  const { subject: original, html } = renderConfirmationEmail({
    name: r.name,
    allocations: r.allocations,
    reasoning: r.reasoning,
    confirmUrl: '#'        // defused: keeps the confirm CTA, but the link is inert
  })
  const subject = `[copy for ${r.email}] ${original}`
  const file = join(outDir, `backfill-${slug(r.email)}.html`)
  writeFileSync(file, html)

  console.log(`• ${r.email}  (${r.confirmed ? 'confirmed' : 'pending'}, ${r.created_at})`)
  console.log(`    subject: ${subject}`)
  console.log(`    preview: ${file}`)
  if (SEND) {
    const out = await sendCopy(subject, html)
    console.log(`    sent → ${out.id}`)
  }
}

console.log(
  SEND
    ? `\nDone — ${rows.length} copy/copies sent to ${RECIPIENT} only.`
    : `\nDry run — nothing sent. Open the previews above, then re-run with RESEND_API_KEY and --send.`
)
