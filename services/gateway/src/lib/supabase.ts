import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Admin client — uses service_role key, bypasses RLS.
// Used for all server-side DB operations (insert, update, delete).
let adminClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!adminClient) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }

    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

// Auth client — uses anon key for user-facing auth operations
// (signInWithPassword, signUp, refreshSession).
// Separate from admin to avoid session contamination.
let authClient: SupabaseClient | null = null;

export function getAuthSupabase(): SupabaseClient {
  if (!authClient) {
    const url = process.env["SUPABASE_URL"];
    const anonKey = process.env["SUPABASE_ANON_KEY"];

    if (!url || !anonKey) {
      throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
    }

    authClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return authClient;
}
