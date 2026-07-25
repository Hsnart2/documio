import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { encryptEmailSecret, verifyEmailOauthState } from "@/lib/email-crypto";

export const runtime = "nodejs";

type OauthState = {
  userId: string;
  provider: "gmail";
  expiresAt: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  try {
    if (!code || !stateValue) throw new Error("Parametri OAuth mancanti");

    const state = verifyEmailOauthState<OauthState>(stateValue);
    if (state.provider !== "gmail" || state.expiresAt < Date.now()) {
      throw new Error("Autorizzazione OAuth scaduta");
    }

    const clientId = process.env.GOOGLE_EMAIL_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_EMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_EMAIL_REDIRECT_URI;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    const missingConfiguration = [
      ["GOOGLE_EMAIL_CLIENT_ID", clientId],
      ["GOOGLE_EMAIL_CLIENT_SECRET", clientSecret],
      ["GOOGLE_EMAIL_REDIRECT_URI", redirectUri],
      ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY", serviceRoleKey],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missingConfiguration.length > 0) {
      throw new Error(`Configurazione server incompleta: ${missingConfiguration.join(", ")}`);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? "Google non ha restituito il token");
    }

    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileResponse.json() as { emailAddress?: string };

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existing } = await admin
      .from("email_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", state.userId)
      .eq("provider", "gmail")
      .maybeSingle();

    const { error } = await admin.from("email_connections").upsert({
      user_id: state.userId,
      provider: "gmail",
      email_address: profile.emailAddress ?? null,
      access_token_encrypted: encryptEmailSecret(tokenData.access_token),
      refresh_token_encrypted: tokenData.refresh_token
        ? encryptEmailSecret(tokenData.refresh_token)
        : existing?.refresh_token_encrypted ?? null,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString(),
      scopes: tokenData.scope?.split(" ") ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });

    if (error) throw error;
    return NextResponse.redirect(`${appUrl}/email?gmail=connected`);
  } catch (error) {
    console.error("Gmail callback failed", error);
    return NextResponse.redirect(`${appUrl}/email?gmail=error`);
  }
}
