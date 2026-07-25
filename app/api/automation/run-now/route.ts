import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function getBearerToken(request: NextRequest) {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() ?? null
  );
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    const cronSecret = process.env.CRON_SECRET;

    if (
      !token ||
      !supabaseUrl ||
      !publishableKey ||
      !serviceRoleKey ||
      !cronSecret
    ) {
      return NextResponse.json(
        { error: "Configurazione o sessione mancante." },
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
      return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      mode?: "advanced" | "standard";
    } | null;
    if (body?.mode !== "advanced") {
      return NextResponse.json(
        {
          error:
            "Il controllo immediato è disponibile soltanto nella versione IA avanzata.",
        },
        { status: 400 },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: preferenceError } = await admin
      .from("automation_preferences")
      .upsert(
        {
          user_id: user.id,
          ui_mode: "advanced",
          daily_email_enabled: true,
        },
        { onConflict: "user_id" },
      );

    if (preferenceError) {
      return NextResponse.json(
        { error: preferenceError.message },
        { status: 500 },
      );
    }

    const cronUrl = new URL("/api/cron/daily-automation", request.nextUrl.origin);
    cronUrl.searchParams.set("userId", user.id);
    const cronResponse = await fetch(cronUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      cache: "no-store",
    });
    const result = (await cronResponse.json().catch(() => null)) as
      | {
          ok?: boolean;
          processed?: number;
          results?: Array<{
            ok?: boolean;
            summary?: {
              analyzed?: number;
              imported?: number;
              trashed?: number;
              notifications?: number;
              skipped?: number;
              warnings?: string[];
            };
          }>;
          error?: string;
        }
      | null;

    if (!cronResponse.ok) {
      return NextResponse.json(
        { error: result?.error ?? "Controllo automatico non riuscito." },
        { status: cronResponse.status },
      );
    }

    const userResult = result?.results?.[0];
    if (!userResult) {
      return NextResponse.json(
        {
          error:
            "Nessun controllo è stato eseguito. Verifica che IA avanzata e controllo quotidiano siano attivi.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: userResult.ok !== false,
      summary: userResult.summary ?? {},
    });
  } catch (error) {
    console.error("Manual daily automation failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Controllo automatico non riuscito.",
      },
      { status: 500 },
    );
  }
}
