# CLAUDE.md — 100 Experts sub-project

Guidance for Claude Code when working inside `proofworks-100/`. This **supplements and overrides** the root `../CLAUDE.md`: that file describes the main *site*, and several of its details are wrong for this sub-project (see below). For the full human-facing explanation of the survey, read `README.md` in this folder.

## This is a separate project from the site

The 100 Experts survey runs in its **own Supabase project**, isolated from the site's email subscribers:

- **Survey project:** `ekyzrnhoxutcnnqrvszp`
- **Site / subscribers project:** `jsbmozalhtxnekufeals` (what the root CLAUDE.md refers to — *not* this one)

**ALWAYS run `supabase` commands from inside `proofworks-100/`** (or pass `--project-ref ekyzrnhoxutcnnqrvszp`). A bulk `supabase functions deploy` from the repo root or the wrong directory can push the survey's public, service-role function into the subscriber project. Both are free-tier and auto-pause after ~7 days idle.

## Commands

```bash
# Local preview — the user keeps `npm run dev` (root) running; do not start it.
# Survey page is at http://localhost:3000/proofworks-100/

# Deploy the edge functions (from inside this folder)
supabase link --project-ref ekyzrnhoxutcnnqrvszp
supabase functions deploy submit-experts
supabase functions deploy confirm-submission

# Function secrets on THIS project (user runs these):
supabase secrets set RESEND_API_KEY=<key> --project-ref ekyzrnhoxutcnnqrvszp           # confirmation email
supabase secrets set TURNSTILE_SECRET_KEY=<key> --project-ref ekyzrnhoxutcnnqrvszp      # anti-bot; pairs with site key in index.html (fail-closed)
supabase secrets set SURVEY_URL=<url> --project-ref ekyzrnhoxutcnnqrvszp                # confirm-submission redirect base (default https://proofworks.cc/100)

# Tests (read URL + anon key from config.js; use @e2e.test emails)
node scripts/test-backend.js
node scripts/test-frontend.js          # Playwright; BASE_URL overridable

# Preview the confirmation email with sample data → exports/confirmation-email.html
node scripts/preview-email.mjs

# Export data for analysis (service-role key is a secret; run locally/CI only)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export.js
```

## Load-bearing rules (easy to break, costly to get wrong)

- **Keep category `id`s stable.** Submissions store the `id` and analysis joins on it. Renaming a `name` is safe; changing an `id` orphans past data. When editing `PW_CATEGORIES`/`PW_GROUPS` in `config.js`, bump `CATALOG_VERSION` and update the seed in `../migrations/100experts_analysis.sql`.
- **PII never leaks to the anon key.** Supabase auto-grants `SELECT` to `anon` on new `public` views, and owner-run views bypass RLS. Any analyst view touching PII (e.g. `latest_submissions`, `alloc_long`, `alloc_canonical`) MUST be `create ... with (security_invoker = on)` AND `revoke all ... from anon, authenticated`. Only `public_allocations` (allocation counts, no PII) is intentionally anon-readable.
- **Writes go through the `submit-experts` / `confirm-submission` edge functions only.** The anon key has no direct table write. submit-experts runs a Turnstile anti-bot check, then enforces sum = 100 and a 10,000-char reasoning cap.
- **Keep-latest (replace-on-confirm).** Each email holds at most one confirmed + one pending row. submit-experts deletes the email's prior *pending* row before inserting; confirm-submission deletes every *other* row for the email once the new one is confirmed. There is no per-email submission cap anymore — Turnstile is the only volume gate on confirmation emails (the row-count cap stopped bounding them once rows stopped accumulating).
- **Anti-bot gate (Turnstile).** `submit-experts` verifies the `turnstileToken` server-side and **fails closed** — no/invalid `TURNSTILE_SECRET_KEY` ⇒ every submit is 403. The public site key lives in `index.html`'s `data-sitekey` (Cloudflare test key by default); swap it + the secret to the real pair for prod. `test-backend.js`/`test-frontend.js` assume the always-pass test pair.
- **Confirmed-only results.** Rows are stored `confirmed = false`; `public_allocations` and the analyst views count confirmed rows only. Don't drop the `where confirmed` filter — it's what keeps unconfirmed/poison entries out of the aggregate.

## Confirmation gate (double opt-in)

On insert, `submit-experts` clears the email's prior pending row, stores the new row UNCONFIRMED with a single-use `confirmation_token` (7-day expiry), and emails the respondent a confirmation link (`EdgeRuntime.waitUntil`, so a mail failure never delays or fails the submission). Clicking it hits `confirm-submission`, which flips `confirmed = true` (idempotent), prunes every other row for that email (keep-latest), and redirects to `confirmed.html` / `confirm-error.html`. Only confirmed rows count — this binds each response to an owned email (anti-impersonation), and a confirmed answer keeps counting until a newer one is confirmed. Schema + view changes: `../migrations/100experts_confirmation.sql`.

- **Email = single source of truth:** `supabase/functions/_shared/confirmation-email.ts`. Written in **erasable-only TS** (type annotations only — no enums/namespaces) so the same file is imported by both the Deno function and `scripts/preview-email.mjs` (Node 22 strips the types on import). Don't add non-erasable TS to it. Pass `confirmUrl` to get the "Confirm my submission" CTA; omit it and the template falls back to the old receipt framing.
- The `FIELDS` map in that file mirrors `config.js` `PW_GROUPS` (id → name + colour). Keep it in sync when you edit groups.
- Sender is `100 experts exercise <updates@proofworks.cc>`; `proofworks.cc` must be a verified Resend domain on the account behind this project's `RESEND_API_KEY`.
- `confirm-submission` redirects to `SURVEY_URL` (default `https://proofworks.cc/100`); set the secret to match the real serve path or links 404.

## Notes

- The root CLAUDE.md's Supabase ref, deploy steps, and email-sender details are for the *site*, not this sub-project. Its general guidance (minimal focused changes, README maintenance, model-selection reminder, task persistence) still applies.
- Supabase fronts functions with a Cloudflare WAF that 403s canonical SQLi payloads before they reach the function — relevant when writing/interpreting `test-backend.js`.
