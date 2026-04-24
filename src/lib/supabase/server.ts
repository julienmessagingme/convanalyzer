import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Module-scoped singleton. The Supabase JS client is fetch-based and
 * stateless once configured (we disable session/refresh below), so it is
 * safe to share across requests within a single Vercel serverless instance.
 * Reusing it avoids re-instantiating auth machinery on every API call,
 * which matters most on cold starts.
 */
let cachedClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client using the service role key.
 * This client bypasses RLS and should only be used server-side.
 */
export function createServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL environment variable"
    );
  }
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
  }

  cachedClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedClient;
}
