# 100 Experts — Test Plan

Covers the **"a user submits their 100"** journey end to end: the front-end
experience and the back-end handling of front-end actions, plus edge cases,
security, and the confirmation email the function sends on submit (§4).

## Layers under test

```
Browser (index.html + app.js)
   │  POST {name,email,allocations[],reasoning,meta}
   ▼
Edge function  submit-experts   ── validates, caps, inserts (service role)
   ▼
Postgres  submissions (append-only, RLS, validate trigger)
   │
   ▼
Browser acknowledgement screen ("Thanks — confirm your email")

(public_allocations view, latest-per-email, allocations only, no PII —
 anon-readable for OFFLINE analysis; the page never queries it)
```

## How to run

- **Back-end + security (automated):** `node 100/scripts/test-backend.js`
  Reads the URL + anon key from `config.js`. Uses throwaway `@e2e.test` emails.
  Exits non-zero if any check fails.
- **Front-end (browser):** serve the folder (the dev server already runs at
  `http://localhost:3000/100/`) and walk the cases in §1.
- **Cleanup:** `delete from public.submissions where email like '%@e2e.test';`
  in the SQL editor (or set `SUPABASE_SERVICE_ROLE_KEY` and the test script
  self-cleans).

Legend: **[AUTO]** in test-backend.js · **[BROWSER]** drive the page · **[SQL]** dashboard query.

---

## 1. Front-end experience  [BROWSER]

### 1a. Load & render
| # | Test | Expected |
|---|---|---|
| F1 | Page loads | Hero, sticky gauge "0 / 100", 8 group sections with cards, 100 empty dots, empty legend |
| F2 | Category content | 37 cards across the 8 groups, each with name + blurb; "+ Add a type" card at the end |
| F3 | Submit gating at load | Submit button disabled, label "Place 100 to submit" |

### 1b. Allocation mechanics
| # | Test | Expected |
|---|---|---|
| F4 | `+` / `−` steppers | Count changes by 1; dots fill/colour by group; legend + group totals update; `−` disabled at 0 |
| F5 | Type a number | Accepts; pct + dots update |
| F6 | Budget cap (over) | Typing/▲ that would exceed 100 is rejected; "Only N spaces left" message; total never > 100 |
| F7 | Gauge states | <100 → "N to place"; =100 → "ready ✓"; submit enables, label "Submit my 100" |
| F8 | Blur empty input | Restores previous value (no NaN/0 surprise) |
| F9 | Re-distribute | Moving counts between cards keeps total = 100; dot blocks re-layout |

### 1c. Custom additions
| # | Test | Expected |
|---|---|---|
| F10 | Add custom type | Appears under "Your additions" (grey); can allocate to it |
| F11 | Add via Enter key | Same as clicking Add |
| F12 | Remove custom (×) | Card removed; its count returns to the budget |
| F13 | Empty custom name | Ignored (no card added) |
| F14 | Long / special-char custom name | Rendered safely (no HTML injection); 60-char input cap |

### 1d. Submit validation (client-side)
| # | Test | Expected |
|---|---|---|
| F15 | Submit ≠100 | Blocked (button disabled); if forced, "Please allocate exactly 100 people." |
| F16 | Empty name / malformed email | **Native HTML5** validation blocks submit (browser bubble); no DB write |
| F16b | Whitespace-only name | Passes native, caught by JS: "Please add your name." |
| F17 | Email `a@b` (no dot) | Passes native `type=email`, caught by JS regex: "Please enter a valid email." |
| F18 | Valid submit | Spinner → acknowledgement screen |

### 1e. Post-submit acknowledgement (no aggregate results shown)
| # | Test | Expected |
|---|---|---|
| F19 | Acknowledgement shown | Builder + sticky gauge hide; "Thanks for your picks" card appears |
| F20 | Confirm-email message | Card says a confirmation link was emailed (masked address); entry counts only once clicked |
| F21 | "Adjust my answer" | Returns to builder with allocations intact |
| F22 | Re-submit (same email) | Succeeds; replaces the prior answer (keep-latest); acknowledgement shown again |

### 1f. Front-end edge cases
| # | Test | Expected |
|---|---|---|
| F24 | All 100 on one type | Submits; acknowledgement shown |
| F25 | Spread 1 across 100 cells | Submits; layout + legend correct |
| F26 | Paste huge reasoning (>10k) | `maxlength=10000` prevents it client-side |
| F27 | Emoji / non-Latin name + reasoning | Accepted, displayed correctly |
| F28 | Network/function error | Friendly error; button re-enabled to retry |
| F29 | Demo mode (config DEMO_MODE:true) | Works with no backend calls; acknowledgement shown (no email sent) |

---

## 2. Back-end: edge function validation  [AUTO]

Endpoint: `POST {SUPABASE_URL}/functions/v1/submit-experts`

| # | Input | Expected |
|---|---|---|
| B1 | Valid, full fields, sum 100 | 200 `{success:true}` |
| B2 | Valid, reasoning omitted/null | 200 |
| B3 | Valid, single entry count 100 | 200 |
| B4 | Valid, includes a `custom:true` entry | 200 |
| B5 | Sum 99 | 400 "must sum to 100" |
| B6 | Sum 101 | 400 |
| B7 | Single entry count 0 (sum 0) | 400 |
| B8 | name missing | 400 "Name is required" |
| B9 | name "" | 400 |
| B10 | name "   " (whitespace) | 400 |
| B11 | email missing | 400 "Email is required" |
| B12 | email "notanemail" | 400 "Invalid email" |
| B13 | email "a@b" (no TLD) | 400 |
| B14 | reasoning 10001 chars | 400 "too long" |
| B15 | reasoning exactly 10000 chars | 200 (boundary) |
| B16 | allocations is an object, not array | 400 |
| B17 | allocations `[]` | 400 "non-empty" |
| B18 | entry missing `id` | 400 |
| B19 | entry missing `label` | 400 |
| B20 | entry missing `group` | 400 |
| B21 | entry missing `custom` | 400 |
| B22 | count negative | 400 "out of range" |
| B23 | count float (e.g. 60.5) | 400 |
| B24 | count as string "60" | 400 |
| B25 | count 101 (>100) | 400 |
| B26 | 201 entries (> MAX_ENTRIES) | 400 "too many" |
| B27 | method GET | 405 |
| B28 | OPTIONS preflight | 200 + CORS header |
| B29 | extra unknown fields | 200 (ignored) |
| B30 | meta omitted | 200 |
| B31 | meta as array | 200 (coerced to {}) |
| B32 | emoji/unicode name + reasoning | 200 |
| B33 | Canonical SQL-injection in name (`Robert'); DROP…`) | Neutralised: **403** (Cloudflare WAF blocks the signature) or 200 (stored literally via parameterised insert) |
| B33b | Benign apostrophe + keywords (`O'Brien`, "select…;") | 200 — WAF does **not** over-block natural text |

### 2a. Per-email cap & append-only
| # | Test | Expected |
|---|---|---|
| B34 | 10 submits same email | all 200 |
| B35 | 11th submit same email | 429 "maximum" |
| B36 | 2 submits same new email | both 200 (append-only) |
| B37 | [SQL] latest-per-email | `public_allocations` / `latest_submissions` show only the newest row per email |
| B38 | Email case-insensitive cap | `Foo@e2e.test` and `foo@e2e.test` count against the same cap |

---

## 3. Security / RLS  [AUTO]

| # | Test | Expected |
|---|---|---|
| S1 | anon GET `public_allocations` | 200, allocations only (no name/email) |
| S2 | anon GET `submissions` (raw) | `[]` — RLS hides all rows |
| S3 | anon POST insert into `submissions` directly | denied (401/403) — only the function writes |
| S4 | anon GET `latest_submissions` | **no rows / denied** (must not leak name/email/reasoning) |
| S5 | anon GET `alloc_canonical` | **no email rows / denied** |
| S6 | anon GET `alloc_long` | **no email rows / denied** |
| S7 | anon GET `respondents` | no rows / denied |
| S8 | anon GET `category_catalog` | no rows / denied |
| S9 | DB trigger backstop [SQL] | direct owner insert with sum≠100 or reasoning>10k is rejected by `trg_validate` |

> S4–S6 caught a real PII leak (Supabase auto-grants `SELECT` to anon on new
> views). Fixed via `security_invoker = on` + `revoke` in
> `migrations/100experts_analysis.sql`.

---

## 3a. Observed: Cloudflare WAF in front of the function
Supabase fronts edge functions with Cloudflare. A request whose body matches a
**canonical SQL-injection signature** (e.g. `'); DROP TABLE x;--`) is rejected at
the gateway with **HTTP 403** before reaching the function (confirmed
deterministic). Natural prose, names with apostrophes, and isolated keywords
("select", "DROP TABLE", "UNION SELECT") all pass (200), so false-positives on
real submissions are effectively nil. If a 403 ever occurs, the page shows the
generic "Something went wrong submitting" message and the user can retry/edit —
acceptable. This is defense-in-depth on top of the parameterised insert.

## 4. Confirmation email  [MANUAL]

On a successful insert, `submit-experts` sends the respondent a receipt via
Resend, fired through `EdgeRuntime.waitUntil` so it never delays or fails the
POST. The template is `_shared/confirmation-email.ts` (single source; preview
with `node scripts/preview-email.mjs` → `exports/confirmation-email.html`).

> **Heads-up for the automated suites (§2, §3):** every `200` now triggers a
> background send to its `@e2e.test` address — a non-existent domain. To avoid a
> pile of Resend bounces (and sender-reputation damage), **run the automated
> tests with `RESEND_API_KEY` unset on the survey project**
> (`ekyzrnhoxutcnnqrvszp`). With no key the function logs "Email service not
> configured" and skips the send; the submission still succeeds. Set the key
> only when deliberately testing delivery (E4), against a real inbox.

| # | Test | Expected |
|---|---|---|
| E1 | Preview render | `node scripts/preview-email.mjs` writes `exports/confirmation-email.html`; opens cleanly; subject "100 experts for AI verification" |
| E2 | Mail failure ≠ submit failure | With a bad `RESEND_API_KEY`, a valid submit still returns 200; the error is only logged |
| E3 | Key unset | Function logs "Email service not configured"; no send attempted; submit 200 |
| E4 | Real delivery [real inbox] | Submit with a real address → receipt arrives; breakdown matches the picks; "In your words" shows reasoning only when provided; "Adjust your answer" links to proofworks.cc/100; `benjamin@proofworks.cc` is a mailto link |
| E5 | Client rendering | Forward E4's email to Gmail / Apple Mail / Outlook; table-based layout + inline styles hold up |
| E6 | Custom + long labels | A `custom:true` type and a long type name render under "Your additions" / wrap cleanly, HTML-escaped (no injection) |

---

## 5. Known limitations / non-goals
- **Duplicate ids in one payload:** the function sums counts but doesn't dedupe
  ids; the front end never produces dupes. Analysis would double-count that id
  for that respondent. Acceptable; document if a custom client is ever added.
- **Ballot-stuffing via many distinct emails:** the per-email cap (10) limits one
  email, not many spoofed emails. No CAPTCHA by design (low-stakes community exercise).
- **Latest-per-email** is verified at the SQL layer (§B37), not via the anon API
  (which can't see email).
- The main site's subscriber/digest notifications are a different project and
  out of scope here. The survey's own confirmation email is covered in §4.
