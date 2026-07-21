import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;

  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: {
        experimental: { passkey: true },
      },
    });
  }

  return supabaseClient;
}
