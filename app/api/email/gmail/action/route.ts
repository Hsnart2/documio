import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptEmailSecret } from "@/lib/email-crypto";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    const body = await request.json().catch(() => null) as {
      messageIds?: string[];
      action?: "archive" | "trash";
      confirmed?: boolean;
    } | null;

    if (!token || !body?.confirmed || !body.action || !body.messageIds?.length) {
      return NextResponse.json(
        { error: "Azione, messaggi e conferma esplicita sono obbligatori." },
        { status: 400 },
      );
    }

    const messageIds = Array.from(new Set(body.messageIds)).slice(0, 50);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: connection } = await admin
      .from("email_connections")
      .select("access_token_encrypted")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();
    if (!connection) return NextResponse.json({ error: "Gmail non collegata." }, { status: 404 });

    const accessToken = decryptEmailSecret(connection.access_token_encrypted);
    const results = await Promise.all(messageIds.map(async (messageId) => {
      const endpoint = body.action === "trash"
        ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`
        : `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: body.action === "archive" ? JSON.stringify({ removeLabelIds: ["INBOX"] }) : undefined,
      });
      return { messageId, success: response.ok };
    }));

    return NextResponse.json({
      action: body.action,
      changed: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).map((item) => item.messageId),
    });
  } catch (error) {
    console.error("Gmail action failed", error);
    return NextResponse.json({ error: "Non riesco a modificare i messaggi Gmail." }, { status: 500 });
  }
}
