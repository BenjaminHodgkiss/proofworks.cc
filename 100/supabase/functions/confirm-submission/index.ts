import { handleCors } from '../_shared/cors.ts'
import { redirectResponse } from '../_shared/responses.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'

// Confirms a "100 Experts" submission from the link emailed to the respondent.
// Flips `confirmed` on the matching row (service role) so it starts counting in
// the public results and the analyst views. Public (verify_jwt = false): the
// unguessable single-use token IS the authorisation, exactly like an email
// verification link.
//
// SURVEY_URL is where the static result pages live. Defaults to the launch path;
// override it as a function secret while the survey is served from a different
// path (e.g. a localhost tunnel during testing).
const SURVEY_URL = Deno.env.get('SURVEY_URL') || 'https://proofworks.cc/100'
const OK_PAGE = `${SURVEY_URL}/confirmed.html`
const ERR_PAGE = `${SURVEY_URL}/confirm-error.html`

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return redirectResponse(ERR_PAGE)
  }

  const supabase = getSupabaseClient()

  const { data: row, error: fetchError } = await supabase
    .from('submissions')
    .select('id, email, confirmed, confirmation_token_expires_at')
    .eq('confirmation_token', token)
    .single()

  if (fetchError || !row) {
    return redirectResponse(ERR_PAGE)
  }

  // Already confirmed → treat a repeat click as success (idempotent).
  if (row.confirmed) {
    return redirectResponse(OK_PAGE)
  }

  if (row.confirmation_token_expires_at &&
      new Date(row.confirmation_token_expires_at) < new Date()) {
    return redirectResponse(ERR_PAGE)
  }

  const { error: updateError } = await supabase
    .from('submissions')
    .update({ confirmed: true, confirmed_at: new Date().toISOString() })
    .eq('id', row.id)

  if (updateError) {
    console.error('Database error (confirm):', updateError)
    return redirectResponse(ERR_PAGE)
  }

  // Keep only the most recent answer: now that this row is confirmed, drop every
  // other row for this email — the previous confirmed answer it supersedes plus
  // any stale pending rows. Non-fatal: the new row already counts, and the
  // latest-per-email views ignore stragglers anyway.
  const { error: pruneError } = await supabase
    .from('submissions')
    .delete()
    .eq('email', row.email)
    .neq('id', row.id)

  if (pruneError) {
    console.error('Database error (prune older):', pruneError)
  }

  return redirectResponse(OK_PAGE)
})
