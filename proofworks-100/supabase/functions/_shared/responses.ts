// Standardized response helpers for edge functions

import { corsHeaders } from './cors.ts'

export function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        ...extraHeaders
      }
    }
  )
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

export function successResponse(message: string, data: Record<string, unknown> = {}): Response {
  return jsonResponse({ success: true, message, ...data })
}

export function redirectResponse(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { 'Location': url }
  })
}
