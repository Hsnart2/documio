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

function permissionMessage(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("permission denied") &&
    normalized.includes("automation_preferences")
  ) {
    return "I permessi Supabase dell’automazione non sono ancora aggiornati. Esegui la migrazione dei permessi e riprova.";
  }
  return message;
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const cronSecret = process.env.CRON_SECRET;

    if (!token || !supabaseUrl || !publishableKey || !cronSecret) {
      return NextResponse.json(
        { error: "Configurazione o sessione mancante." },
        { status: 401 },
      );
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

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

    // La preferenza viene salvata con la sessione dell'utente e le policy RLS,
    // non con privilegi amministrativi.
    const { error: preferenceError } = await userClient
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
        { error: permissionMessage(preferenceError.message) },
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
        {
          error: permissionMessage(
            result?.error ?? "Controllo automatico non riuscito.",
          ),
        },
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
            ? permissionMessage(error.message)
            : "Controllo automatico non riuscito.",
      },
      { status: 500 },
    );
  }
}
