import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  const lookupKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/.test(lookupKey)) {
    return noStore(
      NextResponse.json({ error: "Chiave push non valida." }, { status: 400 }),
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return noStore(
      NextResponse.json({ error: "Configurazione incompleta." }, { status: 500 }),
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: subscription, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id,user_id")
    .eq("lookup_key", lookupKey)
    .eq("enabled", true)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return noStore(new NextResponse(null, { status: 204 }));
  }

  const { data: delivery, error: deliveryError } = await admin
    .from("push_deliveries")
    .select(
      "id,notification_id,automation_notifications!inner(id,title,body,severity,document_id,metadata,created_at)",
    )
    .eq("subscription_id", subscription.id)
    .not("sent_at", "is", null)
    .is("pulled_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (deliveryError || !delivery) {
    return noStore(new NextResponse(null, { status: 204 }));
  }

  const notificationValue = delivery.automation_notifications as
    | {
        id: string;
        title: string;
        body: string;
        severity: "info" | "warning" | "urgent";
        document_id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }
    | Array<{
        id: string;
        title: string;
        body: string;
        severity: "info" | "warning" | "urgent";
        document_id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }>;
  const notification = Array.isArray(notificationValue)
    ? notificationValue[0]
    : notificationValue;
  if (!notification) {
    return noStore(new NextResponse(null, { status: 204 }));
  }

  const now = new Date().toISOString();
  await Promise.all([
    admin
      .from("push_deliveries")
      .update({ pulled_at: now })
      .eq("id", delivery.id)
      .is("pulled_at", null),
    admin
      .from("push_subscriptions")
      .update({ last_used_at: now })
      .eq("id", subscription.id),
  ]);

  const practiceId =
    typeof notification.metadata?.practiceId === "string"
      ? notification.metadata.practiceId
      : null;
  const url = practiceId
    ? `/?practice=${encodeURIComponent(practiceId)}&notification=${encodeURIComponent(notification.id)}`
    : notification.document_id
      ? `/?document=${encodeURIComponent(notification.document_id)}&notification=${encodeURIComponent(notification.id)}`
      : `/?settings=automation&notification=${encodeURIComponent(notification.id)}`;

  return noStore(
    NextResponse.json({
      id: notification.id,
      deliveryId: delivery.id,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      tag: `documio-${notification.id}`,
      url,
      createdAt: notification.created_at,
    }),
  );
}
