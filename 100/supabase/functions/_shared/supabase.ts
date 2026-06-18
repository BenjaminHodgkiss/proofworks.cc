import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseServiceKey)
}

export function getSupabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL')!
}
