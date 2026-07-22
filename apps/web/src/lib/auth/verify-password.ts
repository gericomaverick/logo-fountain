import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Confirms a password belongs to the given account without disturbing the
 * caller's session. Uses an isolated client (no cookie/storage persistence) so
 * the verification sign-in never overwrites the user's active session, and
 * revokes the throwaway session it creates. GoTrue rate-limits these attempts,
 * which gives brute-force protection on the current-password check for free.
 */
export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase URL or anon key for password verification");
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return false;
  }

  try {
    await client.auth.signOut();
  } catch {
    // Best-effort cleanup of the transient verification session.
  }

  return true;
}
