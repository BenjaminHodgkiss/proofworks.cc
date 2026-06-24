// Resend API wrapper for the 100 Experts survey project.
// Mirrors the root project's _shared/send-email.ts; kept local because the
// survey runs in its OWN Supabase project, so its functions can't import from
// the root tree. RESEND_API_KEY must be set as a secret on THIS project
// (ekyzrnhoxutcnnqrvszp), and the proofworks.cc sender domain verified in Resend.

const FROM_ADDRESS = '100 experts exercise <updates@proofworks.cc>'
const BCC_ADDRESS = 'benjamin@proofworks.cc'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: options.to,
        bcc: BCC_ADDRESS,
        subject: options.subject,
        html: options.html
      })
    })

    if (response.ok) {
      const data = await response.json()
      return { success: true, id: data.id }
    } else {
      const errorText = await response.text()
      console.error('Resend API error:', errorText)
      return { success: false, error: errorText }
    }
  } catch (error) {
    console.error('Failed to send email:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
