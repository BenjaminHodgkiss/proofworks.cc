// Email sending utilities

const { EMAIL_RATE_LIMIT_MS, EMAIL_FROM, RESEND_API_URL } = require('./config');

/**
 * Send a single email via Resend API
 */
async function sendEmail(to, subject, html, apiKey) {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email: ${errorText}`);
  }

  return response.json();
}

/**
 * Send bulk emails with rate limiting
 * Returns { successCount, errorCount }
 */
async function sendBulkEmails(subscribers, generateHtml, subject, apiKey) {
  let successCount = 0;
  let errorCount = 0;

  for (const subscriber of subscribers) {
    const html = generateHtml(subscriber);

    try {
      await sendEmail(subscriber.email, subject, html, apiKey);
      successCount++;
      console.log(`Sent email to ${subscriber.email}`);
    } catch (error) {
      errorCount++;
      console.error(`Failed to send to ${subscriber.email}: ${error.message}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, EMAIL_RATE_LIMIT_MS));
  }

  return { successCount, errorCount };
}

/**
 * Fetch subscribers from Supabase with given filters
 */
async function fetchSubscribers(supabaseUrl, serviceRoleKey, frequency) {
  const url = `${supabaseUrl}/rest/v1/subscribers?is_active=eq.true&email_verified=eq.true&email_frequency=eq.${frequency}&select=email,unsubscribe_token,preferences_token`;

  const response = await fetch(url, {
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch subscribers: ${errorText}`);
  }

  return response.json();
}

module.exports = {
  sendEmail,
  sendBulkEmails,
  fetchSubscribers
};
