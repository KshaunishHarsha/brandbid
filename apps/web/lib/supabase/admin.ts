import { createClient } from '@supabase/supabase-js';
import type { Database } from '@brandbid/db';

// Service-role client. Bypasses RLS. Server only (API routes, /go, worker). NEVER import from client code.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars are not set');
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
