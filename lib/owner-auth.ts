// Solo server: nessuna chiave privilegiata deve essere importata nel browser.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const DOCUMIO_OWNER_EMAIL = "nextmindsoftware@gmail.com";

const privateOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function authenticatedUser(request: Request): Promise<{
  user: User;
  client: SupabaseClient;
  token: string;
} | null> {
  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !token) return null;
  const client = createClient(url, key, {
    ...privateOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  return { user, client, token };
}

export function verifiedOwner(user: User) {
  return user.email?.trim().toLowerCase() === DOCUMIO_OWNER_EMAIL &&
    Boolean(user.email_confirmed_at);
}

export function privilegedClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, privateOptions);
}
