import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getVapidPublicKey,
  isWebPushConfigured,
  lookupKeyForSubscription,
} from "@/lib/push-server";

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

async function authenticatedContext(request: NextRequest) {
  const token = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser(token);
  if (error || !user) return null;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { user, admin };
}

export async function GET(request: NextRequest) {
  const context = await authenticatedContext(request);
  if (!context) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const { count, error } = await context.admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id)
    .eq("enabled", true);

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("push_subscriptions")
          ? "Applica prima la migrazione SQL delle notifiche push."
          : error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey: getVapidPublicKey(),
    subscriptionCount: count ?? 0,
  });
}

export async function POST(request: NextRequest) {
  const context = await authenticatedContext(request);
  if (!context) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Le chiavi VAPID non sono ancora configurate su Vercel." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
        userAgent?: string;
        deviceLabel?: string;
      }
    | null;
  const endpoint = body?.endpoint?.trim() ?? "";
  const p256dh = body?.keys?.p256dh?.trim() ?? "";
  const authSecret = body?.keys?.auth?.trim() ?? "";

  if (
    !endpoint.startsWith("https://") ||
    endpoint.length > 3000 ||
    p256dh.length < 20 ||
    authSecret.length < 8
  ) {
    return NextResponse.json(
      { error: "Sottoscrizione push non valida." },
      { status: 400 },
    );
  }

  const { data, error } = await context.admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: context.user.id,
        endpoint,
        p256dh,
        auth_secret: authSecret,
        lookup_key: lookupKeyForSubscription(endpoint, authSecret),
        user_agent: body?.userAgent?.slice(0, 600) || null,
        device_label: body?.deviceLabel?.slice(0, 160) || null,
        enabled: true,
        failure_count: 0,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    )
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Salvataggio push non riuscito." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, subscriptionId: data.id });
}

export async function DELETE(request: NextRequest) {
  const context = await authenticatedContext(request);
  if (!context) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { endpoint?: string }
    | null;
  const endpoint = body?.endpoint?.trim() ?? "";
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint mancante." }, { status: 400 });
  }

  const { error } = await context.admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", context.user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
