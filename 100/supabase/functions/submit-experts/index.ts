import { handleCors } from '../_shared/cors.ts'
import { errorResponse, successResponse } from '../_shared/responses.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'
import { sendEmail } from '../_shared/send-email.ts'
import { renderConfirmationEmail } from '../_shared/confirmation-email.ts'

// Keep-latest "100 Experts" submissions. The public page POSTs here instead of
// writing to the table directly, so the anon key has no DB write access and we
// can enforce validity + the double-opt-in gate server-side. Each email keeps
// only its most recent answer: the prior pending row is cleared here, and older
// rows are pruned by confirm-submission once the new one is confirmed.

const MAX_REASONING = 10000        // chars; matches the DB validate trigger
const MAX_ENTRIES = 200            // sanity cap on allocation array length
const TOTAL = 100                  // allocations must sum to exactly this
const CONFIRM_EXPIRY_DAYS = 7      // how long the email confirmation link stays valid

// Public base for the confirm link emailed to respondents. Inside the deployed
// function SUPABASE_URL resolves to an internal host (fine for DB calls, wrong for
// an emailed link), so the project's public Functions URL is set explicitly.
const PUBLIC_FUNCTIONS_URL = 'https://ekyzrnhoxutcnnqrvszp.supabase.co/functions/v1'

interface Allocation {
  id: string
  label: string
  group: string
  count: number
  custom: boolean
}

// Validate the allocations array shape and that counts sum to 100.
// Returns an error string, or null if valid.
function validateAllocations(allocations: unknown): string | null {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return 'allocations must be a non-empty array'
  }
  if (allocations.length > MAX_ENTRIES) {
    return 'too many allocation entries'
  }
  let sum = 0
  for (const a of allocations as Allocation[]) {
    if (!a || typeof a !== 'object') return 'invalid allocation entry'
    if (typeof a.id !== 'string' || !a.id) return 'allocation id missing'
    if (typeof a.label !== 'string') return 'allocation label missing'
    if (typeof a.group !== 'string') return 'allocation group missing'
    if (typeof a.custom !== 'boolean') return 'allocation custom flag missing'
    if (!Number.isInteger(a.count) || a.count < 0 || a.count > TOTAL) {
      return 'allocation count out of range'
    }
    sum += a.count
  }
  if (sum !== TOTAL) return `allocations must sum to ${TOTAL} (got ${sum})`
  return null
}

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Verify a Cloudflare Turnstile token server-side. Fails CLOSED: if the secret
// is not configured or the call errors, the request is treated as not-human so
// the anti-bot gate can never be silently bypassed.
async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY not configured')
    return false
  }
  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', token)
  if (remoteIp) form.set('remoteip', remoteIp)
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form })
    const data = await res.json()
    return data?.success === true
  } catch (err) {
    console.error('Turnstile verification error:', err)
    return false
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const { name, email, allocations, reasoning, meta, turnstileToken } = await req.json()

    if (!name || typeof name !== 'string' || !name.trim()) {
      return errorResponse('Name is required')
    }
    if (!email || typeof email !== 'string') {
      return errorResponse('Email is required')
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format')
    }
    if (reasoning != null && typeof reasoning !== 'string') {
      return errorResponse('Invalid reasoning')
    }
    if (typeof reasoning === 'string' && reasoning.length > MAX_REASONING) {
      return errorResponse(`Reasoning is too long (max ${MAX_REASONING} characters)`)
    }

    // Anti-bot gate: reject anything without a valid Turnstile token before we
    // touch the database or send any email. Verified server-side so a forged
    // client can't skip it.
    if (!turnstileToken || typeof turnstileToken !== 'string') {
      return errorResponse('Verification required', 403)
    }
    const remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const human = await verifyTurnstile(turnstileToken, remoteIp)
    if (!human) {
      return errorResponse('Verification failed. Please try again.', 403)
    }

    const allocError = validateAllocations(allocations)
    if (allocError) return errorResponse(allocError)

    const cleanName = name.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const supabase = getSupabaseClient()

    // Keep only the most recent answer per email: clear any previous UNCONFIRMED
    // row for this email before inserting the new one. A still-confirmed row is
    // left in place so the respondent keeps counting until they confirm this new
    // one (confirm-submission then prunes it), so an email holds at most one
    // confirmed + one pending row.
    const { error: clearError } = await supabase
      .from('submissions')
      .delete()
      .eq('email', normalizedEmail)
      .eq('confirmed', false)

    if (clearError) {
      console.error('Database error (clear pending):', clearError)
      return errorResponse('Failed to submit', 500)
    }

    const cleanReasoning = typeof reasoning === 'string' && reasoning.trim() ? reasoning.trim() : null

    // Double-opt-in: store the row UNCONFIRMED with a single-use token and email
    // the respondent a link to confirm. Only confirmed rows are counted/analysed,
    // which binds each response to a real, owned email address (anti-impersonation).
    const confirmationToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + CONFIRM_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('submissions')
      .insert({
        name: cleanName,
        email: normalizedEmail,
        allocations,
        reasoning: cleanReasoning,
        meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
        confirmed: false,
        confirmation_token: confirmationToken,
        confirmation_token_expires_at: expiresAt
      })

    if (error) {
      console.error('Database error (insert):', error)
      return errorResponse('Failed to submit', 500)
    }

    // Email the confirmation link (with a receipt of their picks). The row is
    // already stored, so a mail failure must never fail the request — log and
    // move on. Run it after the response when the Edge runtime supports it, so
    // the POST isn't held open waiting on Resend.
    const confirmUrl = `${PUBLIC_FUNCTIONS_URL}/confirm-submission?token=${confirmationToken}`
    const { subject, html } = renderConfirmationEmail({
      name: cleanName,
      allocations,
      reasoning: cleanReasoning,
      confirmUrl
    })
    const emailTask = sendEmail({ to: normalizedEmail, subject, html })
      .then((r) => { if (!r.success) console.error('Confirmation email failed:', r.error) })
      .catch((e) => { console.error('Confirmation email error:', e) })

    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
    if (typeof edgeRuntime?.waitUntil === 'function') {
      edgeRuntime.waitUntil(emailTask)
    } else {
      await emailTask
    }

    return successResponse('Submission saved. Check your email to confirm it.', { requiresConfirmation: true })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse('Internal server error', 500)
  }
})
