// ─────────────────────────────────────────────────────────────
//  100 Experts — respondent confirmation email
//
//  Builds the HTML receipt a respondent gets after they allocate their
//  100 experts. Pure string-building (no Deno- or Node-specific APIs), so it
//  is the single source of truth for BOTH:
//    • the submit-experts edge function (Deno), which sends it, and
//    • scripts/preview-email.mjs (Node), which renders it for design review.
//
//  Layout is table-based with inline styles for broad email-client support
//  (Gmail, Apple Mail, Outlook). The visual breakdown is "fields, then types":
//  a stacked 100-unit hero bar coloured by field, then a section per field
//  (total + the specific roles the respondent picked under it).
// ─────────────────────────────────────────────────────────────

export interface Allocation {
  id: string
  label: string
  group: string
  count: number
  custom: boolean
}

export interface ConfirmationInput {
  name: string
  allocations: Allocation[]
  reasoning?: string | null
  surveyUrl?: string
  confirmUrl?: string          // double-opt-in link; when present the email asks the reader to confirm
}

export interface RenderedEmail {
  subject: string
  html: string
}

// Mirror of config.js PW_GROUPS (id → display name + colour), plus the
// synthetic "custom" field app.js uses for user-added types. Keep in sync with
// config.js. Names are lightly shortened for the narrower email column.
const FIELDS: Record<string, { name: string; color: string }> = {
  hwdesign:    { name: 'Hardware & software engineering',             color: '#4E79A7' },
  hwsec:       { name: 'Hardware security, inspection & supply-chain', color: '#F28E2B' },
  infra:       { name: 'Infrastructure & monitoring',                 color: '#76B7B2' },
  protocols:   { name: 'Protocols, proofs, assurance & red-teaming',  color: '#B07AA1' },
  buildrun:    { name: 'Building, testing & running the system',      color: '#9C755F' },
  aiml:        { name: 'AI / ML expertise',                           color: '#E15759' },
  darkcompute: { name: 'Dark-compute detection',                      color: '#5E5A50' },
  governance:  { name: 'Governance, diplomacy & law',                 color: '#EDC948' },
  custom:      { name: 'Your additions',                              color: '#59A14F' },
}
const FALLBACK_FIELD = { name: 'Other', color: '#8C887C' }

// Brand palette + type stacks (from config.js / styles), with email-safe
// fallbacks for clients that won't load the web fonts.
const C = {
  paper: '#F7F4EC', panel: '#FCFAF4', ink: '#1B1A17', inkSoft: '#46443D',
  inkFaint: '#8C887C', line: '#E4DFD2', lineStrong: '#C8C1AE', accent: '#235E40',
}
const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif"
const SANS = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
const DEFAULT_SURVEY_URL = 'https://proofworks.cc/100'

interface FieldRollup {
  id: string
  name: string
  color: string
  total: number
  roles: { label: string; count: number }[]
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fieldMeta(id: string) {
  return FIELDS[id] || FALLBACK_FIELD
}

// First name only, for a warmer greeting; falls back to the whole string.
function firstName(name: string): string {
  const t = (name || '').trim()
  return t ? t.split(/\s+/)[0] : 'there'
}

// Roll the flat allocations up into fields (sorted by total, custom last),
// each carrying its picked roles (sorted by count).
function rollup(allocations: Allocation[]): FieldRollup[] {
  const map = new Map<string, FieldRollup>()
  for (const a of allocations || []) {
    if (!a || !(a.count > 0)) continue
    const meta = fieldMeta(a.group)
    let f = map.get(a.group)
    if (!f) {
      f = { id: a.group, name: meta.name, color: meta.color, total: 0, roles: [] }
      map.set(a.group, f)
    }
    f.total += a.count
    f.roles.push({ label: a.label, count: a.count })
  }
  const fields = [...map.values()]
  for (const f of fields) {
    f.roles.sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
  }
  fields.sort((x, y) => {
    if (x.id === 'custom') return 1
    if (y.id === 'custom') return -1
    return y.total - x.total || x.name.localeCompare(y.name)
  })
  return fields
}

// One coloured segment per field, widths proportional to the 100 total.
function heroBar(fields: FieldRollup[], total: number): string {
  const denom = total || 1
  const segs = fields.map((f, i) => {
    const pct = (f.total / denom) * 100
    const radius =
      fields.length === 1 ? '5px'
        : i === 0 ? '5px 0 0 5px'
          : i === fields.length - 1 ? '0 5px 5px 0'
            : '0'
    const gap = i === 0 ? '' : 'border-left:2px solid ' + C.panel + ';'
    return (
      '<td width="' + pct.toFixed(3) + '%" style="' + gap +
      'background:' + f.color + ';height:14px;line-height:14px;font-size:1px;' +
      'border-radius:' + radius + ';" title="' + esc(f.name) + ': ' + f.total + '">&nbsp;</td>'
    )
  }).join('')
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="border-collapse:separate;table-layout:fixed;"><tr>' + segs + '</tr></table>'
  )
}

// A field block: header (swatch + name + total), then its picked roles.
function fieldBlock(f: FieldRollup, isLast: boolean): string {
  const roleRows = f.roles.map((r) =>
    '<tr>' +
    '<td style="padding:5px 0;font:400 14px/1.35 ' + SANS + ';color:' + C.inkSoft + ';">' +
    esc(r.label) + '</td>' +
    '<td width="44" align="right" style="padding:5px 0;font:500 14px ' + MONO + ';color:' + C.ink + ';white-space:nowrap;">' +
    r.count + '</td>' +
    '</tr>'
  ).join('')

  const divider = isLast
    ? ''
    : '<tr><td colspan="2" style="padding:18px 0 0;"><div style="height:1px;background:' + C.line + ';font-size:1px;line-height:1px;">&nbsp;</div></td></tr>'

  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">' +
    // header row
    '<tr>' +
    '<td style="padding:0 0 8px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="14" style="padding:0 9px 0 0;vertical-align:middle;">' +
    '<div style="width:11px;height:11px;border-radius:3px;background:' + f.color + ';font-size:1px;line-height:1px;">&nbsp;</div>' +
    '</td>' +
    '<td style="vertical-align:middle;font:600 15px/1.3 ' + SANS + ';color:' + C.ink + ';letter-spacing:-.01em;">' +
    esc(f.name) + '</td>' +
    '</tr></table>' +
    '</td>' +
    '<td width="60" align="right" style="padding:0 0 8px;vertical-align:bottom;font:500 20px ' + MONO + ';color:' + C.accent + ';white-space:nowrap;">' +
    f.total + '</td>' +
    '</tr>' +
    roleRows +
    divider +
    '</table>'
  )
}

function reasoningBlock(reasoning: string): string {
  const body = esc(reasoning.trim()).replace(/\r?\n/g, '<br>')
  return (
    '<tr><td style="padding:30px 0 0;">' +
    '<div style="font:600 11px/1 ' + MONO + ';letter-spacing:.12em;text-transform:uppercase;color:' + C.inkFaint + ';padding:0 0 12px;">In your words</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td width="3" style="background:' + C.accent + ';border-radius:2px;font-size:1px;">&nbsp;</td>' +
    '<td style="padding:2px 0 2px 16px;font:400 15px/1.6 ' + SERIF + ';font-style:italic;color:' + C.inkSoft + ';">' +
    body +
    '</td></tr></table>' +
    '</td></tr>'
  )
}

export function renderConfirmationEmail(input: ConfirmationInput): RenderedEmail {
  const fields = rollup(input.allocations)
  const total = fields.reduce((s, f) => s + f.total, 0)
  const roleCount = fields.reduce((s, f) => s + f.roles.length, 0)
  const surveyUrl = input.surveyUrl || DEFAULT_SURVEY_URL
  const reasoning = (input.reasoning || '').trim()

  const typeWord = roleCount === 1 ? 'expert type' : 'expert types'
  const summary = total + ' people across ' + roleCount + ' ' + typeWord + '.'

  const blocks = fields.map((f, i) => fieldBlock(f, i === fields.length - 1)).join('')

  const confirmUrl = input.confirmUrl

  const preheader = confirmUrl
    ? 'One quick step: confirm your choices so they count. Your breakdown is inside.'
    : "Your picks for AI verification are in. Here's the breakdown, and a link to revise it."

  const subject = confirmUrl
    ? 'Confirm your 100 experts choices'
    : '100 experts for AI verification'

  const html =
'<!doctype html>' +
'<html lang="en"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<meta name="x-apple-disable-message-reformatting">' +
'<title>' + esc(subject) + '</title>' +
'<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Hanken+Grotesk:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">' +
'<style>body{margin:0;padding:0;}a{text-decoration:none;}@media (max-width:620px){.pw-shell{width:100%!important;}.pw-pad{padding-left:24px!important;padding-right:24px!important;}}</style>' +
'</head>' +
'<body style="margin:0;padding:0;background:' + C.paper + ';">' +
// preheader (hidden)
'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.paper + ';font-size:1px;line-height:1px;">' + esc(preheader) + '</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.paper + ';">' +
'<tr><td align="center" style="padding:36px 16px;">' +
'<table role="presentation" class="pw-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">' +

// ── Card ──
'<tr><td>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.panel + ';border:1px solid ' + C.line + ';border-radius:16px;">' +

// header / title
'<tr><td class="pw-pad" style="padding:40px 40px 0;">' +
'<div style="font:600 12px/1 ' + MONO + ';letter-spacing:.14em;text-transform:uppercase;color:' + C.accent + ';padding:0 0 18px;">100 experts exercise</div>' +
'<h1 style="margin:0;font:500 32px/1.1 ' + SERIF + ';letter-spacing:-.02em;color:' + C.ink + ';">' + (confirmUrl ? 'Confirm your 100 experts.' : 'Your 100 experts are in.') + '</h1>' +
'<p style="margin:14px 0 0;font:400 16px/1.55 ' + SANS + ';color:' + C.inkSoft + ';">' + (confirmUrl ? 'Thanks, ' + esc(firstName(input.name)) + '. Your picks are below. Confirm them and your choices are recorded.' : 'Thanks, ' + esc(firstName(input.name)) + '. Here’s how you’d put 100 people to work full-time on AI verification.') + '</p>' +
'</td></tr>' +

// summary stat
'<tr><td class="pw-pad" style="padding:24px 40px 0;">' +
'<div style="font:500 13px/1.4 ' + MONO + ';color:' + C.inkFaint + ';letter-spacing:.01em;">' + esc(summary) + '</div>' +
'</td></tr>' +

// hero bar
'<tr><td class="pw-pad" style="padding:14px 40px 0;">' + heroBar(fields, total) + '</td></tr>' +

// breakdown
'<tr><td class="pw-pad" style="padding:6px 40px 0;">' + blocks + '</td></tr>' +

// reasoning (optional)
(reasoning ? '<tr><td class="pw-pad" style="padding:0 40px;">' + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + reasoningBlock(reasoning) + '</table></td></tr>' : '') +

// CTA
'<tr><td class="pw-pad" style="padding:34px 40px 4px;">' +
'<div style="height:1px;background:' + C.line + ';font-size:1px;line-height:1px;">&nbsp;</div>' +
'</td></tr>' +
'<tr><td class="pw-pad" style="padding:26px 40px 40px;">' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
'<td style="border-radius:10px;background:' + C.accent + ';">' +
'<a href="' + esc(confirmUrl || surveyUrl) + '" style="display:inline-block;padding:13px 26px;font:600 15px ' + SANS + ';color:#FCFAF4;border-radius:10px;">' + (confirmUrl ? 'Confirm my submission &rarr;' : 'Adjust your choices &rarr;') + '</a>' +
'</td></tr></table>' +
(confirmUrl
  ? '<p style="margin:16px 0 0;font:400 14px/1.5 ' + SANS + ';color:' + C.inkFaint + ';">Your choices aren’t recorded until you confirm.</p>'
  : '<p style="margin:16px 0 0;font:400 14px/1.5 ' + SANS + ';color:' + C.inkFaint + ';">Changed your mind? You can revise and resubmit any time; only your most recent confirmed choices are recorded.</p>') +
'</td></tr>' +

'</table>' + // end card
'</td></tr>' +

// ── Footer ──
'<tr><td class="pw-pad" style="padding:26px 40px 0;">' +
'<p style="margin:0;font:400 13px/1.6 ' + SANS + ';color:' + C.inkFaint + ';">Someone submitted answers to an online exercise using this email address. If that wasn’t you, email <a href="mailto:benjamin@proofworks.cc" style="color:' + C.accent + ';text-decoration:underline;">benjamin@proofworks.cc</a>.</p>' +
'</td></tr>' +

'</table>' + // end shell
'</td></tr></table>' +
'</body></html>'

  return { subject, html }
}
