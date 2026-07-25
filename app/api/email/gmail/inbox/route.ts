import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptEmailSecret, encryptEmailSecret } from "@/lib/email-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function decodeHeader(value?: string) {
  return value ?? "";
}

function classifyMessage(input: { subject: string; from: string; snippet: string; labelIds: string[] }) {
  const text = `${input.subject} ${input.from} ${input.snippet}`.toLowerCase();
  const hasAny = (terms: string[]) => terms.some((term) => text.includes(term));

  if (input.labelIds.includes("SPAM") || hasAny(["unsubscribe", "annulla iscrizione", "newsletter", "promozione", "offerta speciale"])) {
    return { category: "pubblicita", importance: "low", suggestedAction: "review_trash" };
  }
  if (hasAny(["fattura", "invoice", "bolletta", "scadenza", "pagamento", "rata", "sollecito", "multa"])) {
    return { category: "pagamenti", importance: "high", suggestedAction: "review_document" };
  }
  if (hasAny(["appuntamento", "prenotazione", "visita", "meeting", "conferma appuntamento"])) {
    return { category: "appuntamenti", importance: "high", suggestedAction: "review_calendar" };
  }
  if (hasAny(["contratto", "polizza", "documento", "allegato", "ricevuta", "quietanza"])) {
    return { category: "documenti", importance: "medium", suggestedAction: "review_document" };
  }
  return { category: "altro", importance: input.labelIds.includes("IMPORTANT") ? "high" : "medium", suggestedAction: "none" };
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_EMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_EMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Credenziali Google mancanti");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? "Rinnovo Gmail fallito");
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const range = requestUrl.searchParams.get("range") ?? "14d";
    const pageToken = requestUrl.searchParams.get("pageToken") ?? "";
    const token = getBearerToken(request);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Configurazione o sessione mancante." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: connection, error: connectionError } = await admin
      .from("email_connections")
      .select("id,email_address,access_token_encrypted,refresh_token_encrypted,token_expires_at")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();

    if (connectionError || !connection) {
      return NextResponse.json({ connected: false, messages: [] });
    }

    let accessToken = decryptEmailSecret(connection.access_token_encrypted);
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
    if (expiresAt < Date.now() + 60_000) {
      if (!connection.refresh_token_encrypted) throw new Error("Ricollega Gmail per continuare");
      const refreshed = await refreshAccessToken(decryptEmailSecret(connection.refresh_token_encrypted));
      accessToken = refreshed.accessToken;
      await admin.from("email_connections").update({
        access_token_encrypted: encryptEmailSecret(accessToken),
        token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", connection.id);
    }

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", "50");
    if (range !== "all") listUrl.searchParams.set("q", `newer_than:${range}`);
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const listData = await listResponse.json() as { messages?: Array<{ id: string }>; nextPageToken?: string; resultSizeEstimate?: number };
    if (!listResponse.ok) throw new Error("Lettura Gmail non riuscita");

    const messages = await Promise.all((listData.messages ?? []).map(async ({ id }) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const message = await response.json() as {
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const headers = message.payload?.headers ?? [];
      const getHeader = (name: string) => decodeHeader(headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value);
      const subject = getHeader("Subject");
      const from = getHeader("From");
      const date = getHeader("Date");
      const classification = classifyMessage({ subject, from, snippet: message.snippet ?? "", labelIds: message.labelIds ?? [] });
      return {
        id: message.id,
        threadId: message.threadId,
        subject,
        from,
        date,
        snippet: message.snippet ?? "",
        labelIds: message.labelIds ?? [],
        ...classification,
      };
    }));

    await admin.from("email_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);

    const summary = {
      total: messages.length,
      important: messages.filter((item) => item.importance === "high").length,
      documents: messages.filter((item) => item.category === "documenti" || item.category === "pagamenti").length,
      advertising: messages.filter((item) => item.category === "pubblicita").length,
    };

    return NextResponse.json({
      connected: true,
      emailAddress: connection.email_address,
      summary,
      messages,
      nextPageToken: listData.nextPageToken ?? null,
      resultSizeEstimate: listData.resultSizeEstimate ?? messages.length,
      range,
    });
  } catch (error) {
    console.error("Gmail inbox failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore Gmail." }, { status: 500 });
  }
}
