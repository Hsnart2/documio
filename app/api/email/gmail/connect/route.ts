import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { signEmailOauthState } from "@/lib/email-crypto";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const clientId = process.env.GOOGLE_EMAIL_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_EMAIL_REDIRECT_URI;
    const token = getBearerToken(request);

    if (!supabaseUrl || !publishableKey || !clientId || !redirectUri) {
      return NextResponse.json({ error: "Configurazione Gmail incompleta." }, { status: 500 });
    }
    if (!token) return NextResponse.json({ error: "Sessione mancante." }, { status: 401 });

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error } = await authClient.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });

    const state = signEmailOauthState({
      userId: user.id,
      provider: "gmail",
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" "),
      state,
    });

    return NextResponse.json({
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  } catch (error) {
    console.error("Gmail connect failed", error);
    return NextResponse.json({ error: "Non riesco ad avviare il collegamento Gmail." }, { status: 500 });
  }
}
