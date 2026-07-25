import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isWebPushConfigured, sendPendingPushNotifications } from "@/lib/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() ?? null
  );
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Sessione o configurazione mancante." }, { status: 401 });
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Le chiavi VAPID non sono ancora configurate su Vercel." },
      { status: 503 },
    );
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: insertError } = await admin
    .from("automation_notifications")
    .insert({
      user_id: user.id,
      type: "push_test",
      severity: "info",
      title: "Notifiche DocuMio attive",
      body: "Questa è una notifica di prova ricevuta dalla web app, anche quando è chiusa.",
      dedupe_key: `push-test:${Date.now()}:${crypto.randomUUID()}`,
      metadata: { source: "manual_test" },
    });

  if (insertError) {
    return NextResponse.json(
      {
        error: insertError.message.includes("push_sent_at")
          ? "Applica prima la migrazione SQL delle notifiche push."
          : insertError.message,
      },
      { status: 500 },
    );
  }

  const result = await sendPendingPushNotifications(admin, user.id);
  if (result.deviceDeliveries === 0) {
    return NextResponse.json(
      {
        error:
          result.errors[0] ??
          "Nessun dispositivo push attivo. Disattiva e riattiva le notifiche su questo dispositivo.",
        result,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, result });
}
