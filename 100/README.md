# 100 Experts — Proofworks community exercise

A single-page exercise: *"If you could put 100 experts to work full-time on AI verification, who would you pick?"* Visitors distribute a budget of 100 people across expert types, can add their own, enter name + email, and submit. Aggregate results are not shown in the page — responses are analysed offline.

## Files

| File | What it is |
|---|---|
| `index.html` | The page (HTML + all styling). |
| `app.js` | All behaviour: dot grid, steppers, validation, submit, post-submit acknowledgement. |
| `config.js` | **Edit this** — Supabase keys, demo toggle, catalog version, and the expert category list. |
| `supabase-setup.sql` | Run once in Supabase to create the table + security (append-only). |
| `supabase/functions/submit-experts/` | Edge function that validates each submission (incl. a Turnstile anti-bot check), writes it **unconfirmed**, and emails the respondent a confirmation link. |
| `supabase/functions/confirm-submission/` | Edge function the email link hits; flips the row to `confirmed` so it starts counting. |
| `supabase/functions/_shared/confirmation-email.ts` | Builds the confirmation email (confirm button + "fields → types" breakdown). Single source of truth, shared by the function and the preview script. |
| `confirmed.html` / `confirm-error.html` | Where `confirm-submission` redirects after a good / bad link. |
| `supabase/functions/_shared/send-email.ts` | Resend API wrapper (the survey project's own copy — it can't import the site's). |
| `supabase/config.toml` | Survey project's CLI config (own project, separate from the site's). |
| `scripts/export.js` | Pull the data for analysis (PII + shareable exports). |
| `scripts/preview-email.mjs` | Render the confirmation email with sample data to `exports/confirmation-email.html` for design review (`node scripts/preview-email.mjs`). |
| `expert-categories-draft.md` | Draft category list to refine before launch (not used by the app). |
| `CLAUDE.md` | Agent-facing rules and footguns for this sub-project (separate Supabase project, stable ids, RLS/PII, the confirmation email). |

The analysis SQL lives one level up, alongside the site's other migrations:

| File | What it is |
|---|---|
| `../migrations/100experts_analysis.sql` | Analyst tables (catalog, aliases, respondent weights) + analysis views. |
| `../migrations/100experts_confirmation.sql` | Double-opt-in confirmation columns + makes the views confirmed-only (run after the two above). |

> **This survey uses its own Supabase project**, separate from the email-notification subscribers. The root `supabase/` directory links to the notification project; this `100/supabase/` tree links to the survey project. Always run survey `supabase` commands from inside `100/` so the survey's public, service-role function never deploys into the subscriber project.

## Run it locally (preview)

It works out of the box in **demo mode** (no backend — submits are stubbed locally so you can preview the full flow). Just serve the folder:

```bash
cd 100
python3 -m http.server 8000
# open http://localhost:8000
```

`DEMO_MODE: true` in `config.js` keeps it backend-free for previewing.

## Go live (real submissions)

1. **Create a dedicated Supabase project** (free) at supabase.com — separate from any other project (e.g. the site's email subscribers).
2. **SQL Editor → New query →** paste `supabase-setup.sql` → **Run**. Then run `../migrations/100experts_analysis.sql` (analyst tables + analysis views), and `../migrations/100experts_confirmation.sql` (double-opt-in columns + confirmed-only views).
3. **Deploy the edge functions** — from inside `100/` so they target the survey project, not the site's:
   ```bash
   cd 100
   supabase link --project-ref <survey-ref>
   supabase functions deploy submit-experts
   supabase functions deploy confirm-submission
   ```
4. **Set the function secrets** (from inside `100/`):
   ```bash
   supabase secrets set RESEND_API_KEY=<your-resend-key>             # confirmation email (Resend)
   supabase secrets set TURNSTILE_SECRET_KEY=<your-turnstile-secret> # anti-bot; pairs with the site key in index.html
   supabase secrets set SURVEY_URL=https://proofworks.cc/100         # where confirm-submission redirects
   ```
   - **Confirmation email (double-opt-in):** sent via Resend, so this project needs its own `RESEND_API_KEY` (separate from the subscriber project) and `proofworks.cc` verified as a sender domain. Sender is `100 experts exercise <updates@proofworks.cc>`. A submission is stored *unconfirmed* and only counts once the respondent clicks the emailed link (links expire after 7 days). Preview any time with `node scripts/preview-email.mjs`.
   - **Anti-bot:** the submit form carries a Cloudflare Turnstile widget; `submit-experts` verifies it and **fails closed** — with no/invalid `TURNSTILE_SECRET_KEY`, every submit is rejected. Replace the test `data-sitekey` in `index.html` with your real site key; the secret here is its pair. For testing, use Cloudflare's always-pass test pair.
   - **SURVEY_URL:** defaults to `https://proofworks.cc/100`; set it to wherever the static pages actually serve from (e.g. a tunnel during testing) so the confirm/error redirects resolve.
5. In **Project Settings → API**, copy the **Project URL** and **anon / public** key.
6. In `config.js`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DEMO_MODE: false`.
7. **Deploy to GitHub Pages**: drop these files into your Pages repo (e.g. a `/100` folder), commit, push. Visit `proofworks.cc/100`.

The anon key is meant to be public. Under row-level security it **cannot read or write the raw table at all**, and the page never reads any submissions back — it only writes. Every write goes through the `submit-experts` edge function (service role), which runs a Turnstile anti-bot check, validates the payload, and stores the row unconfirmed pending email confirmation (replacing any prior pending row for that email). The `public_allocations` view (confirmed entries only, allocation counts, no PII) is analyst-only (service-role); the page never queries it, and the anon key cannot read it.

## How the data is organised (keep-latest)

- **Keep-latest:** each email keeps only its most recent answer. A new submission clears the email's previous *pending* row; confirming the new one then prunes any older row — so an email holds at most one confirmed + one pending row, and re-submitting replaces rather than accumulates.
- **Confirmed-only (double-opt-in):** a row is stored `confirmed = false` with a single-use token and only flips to confirmed when the respondent clicks the emailed link. The public view and the analyst views count **confirmed** rows only, so each response is proven to belong to its email (anti-impersonation). A confirmed answer keeps counting until a newer one is confirmed. Links expire after 7 days; see `../migrations/100experts_confirmation.sql`.
- **Rename-proof allocations:** stored as an array of `{id, label, group, count, custom}`. `id` is the stable category id (analysis joins on it); `label` is the wording shown at submit time. Custom additions keep `custom: true` and their raw text.
- **Privacy:** the page never reads submissions back; aggregate counts live in the `public_allocations` view (allocation numbers only, latest-per-email, no PII) for offline analysis, so names/emails never reach the browser.
- **Canonicalising customs:** the *custom-term review* query in `100experts_analysis.sql` lists user-added labels; fold near-duplicates by inserting rows into `category_aliases` (`'FPGA eng.' → fpga`). Never auto-merge.
- **Weighting by expertise:** fill in `public.respondents` (keyed by email) with a `weight` per person; the weighted-leaderboard query and the export join it. No expertise fields are asked on the form.

## Exporting for analysis

After applying both SQL files, pull everything with:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export.js
```

Writes to `exports/` (gitignored): `experts_full.*` (**with PII** — analyst only), `leaderboard.*` (aggregated, shareable), and `custom_review.csv` (labels awaiting an alias). The **service role key** is a secret — run this locally or in CI, never in the browser.

## Editing the expert list

Expert types are grouped into fields. Edit two arrays in `config.js`:

- `PW_GROUPS` — the sections (order here = section order on the page). Each entry `{ id, name, color }`; every category in the group inherits the group's colour (palette: Tableau 10), so the dot grid and legend read by field.
- `PW_CATEGORIES` — the expert types. Each entry `{ id, group, name, blurb }`, where `group` matches a `PW_GROUPS` id. Order within a group = card order. Keep `id`s unique and stable.

> **Keeping ids stable is now load-bearing:** submissions store the `id`, and analysis joins on it. Renaming a `name` is safe (update `canonical_name` in `category_catalog` to match); changing an `id` orphans past data. When you edit the list, bump `CATALOG_VERSION` in `config.js` and update the seed in `../migrations/100experts_analysis.sql`.

Users can still add their own types at runtime; those appear under a "Your additions" group and are stored with `custom: true` under their typed label, to be folded via `category_aliases` during analysis.

## Customising the look

Design tokens live at the top of `index.html` in `:root` (`--paper`, `--ink`, `--accent`, fonts). Change `--accent` to reskin most of the page. Fonts are Fraunces / Hanken Grotesk / Geist Mono via Google Fonts.
