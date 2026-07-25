import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

    if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { connected: false, error: "Configurazione o sessione mancante." },
        { status: 401 },
      );
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { connected: false, error: "Sessione non valida." },
        { status: 401 },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: connection, error: connectionError } = await admin
      .from("email_connections")
      .select("email_address,last_sync_at")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();

    if (connectionError) {
      console.error("Gmail status failed", connectionError);
      return NextResponse.json(
        { connected: false, error: "Controllo Gmail non disponibile." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      connected: Boolean(connection),
      emailAddress: connection?.email_address ?? undefined,
      lastSyncAt: connection?.last_sync_at ?? undefined,
    });
  } catch (error) {
    console.error("Gmail status failed", error);
    return NextResponse.json(
      { connected: false, error: "Controllo Gmail non disponibile." },
      { status: 500 },
    );
  }
}
