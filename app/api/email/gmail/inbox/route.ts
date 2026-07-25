import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptEmailSecret, encryptEmailSecret } from "@/lib/email-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

type EmailCategory = "pagamenti" | "documenti" | "appuntamenti" | "pubblicita" | "altro";
type EmailImportance = "high" | "medium" | "low";

type RawMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
};

type AiClassification = {
  id: string;
  category: EmailCategory;
  importance: EmailImportance;
  suggestedAction: string;
  reason: string;
  documentType: string | null;
  amount: number | null;
  dueDate: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  senderName: string | null;
};

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function decodeHeader(value?: string) {
  return value ?? "";
}

function classifyMessageFallback(input: { subject: string; from: string; snippet: string; labelIds: string[] }) {
  const text = `${input.subject} ${input.from} ${input.snippet}`.toLowerCase();
  const hasAny = (terms: string[]) => terms.some((term) => text.includes(term));

  if (input.labelIds.includes("SPAM") || hasAny(["unsubscribe", "annulla iscrizione", "newsletter", "promozione", "offerta speciale"])) {
    return { category: "pubblicita" as const, importance: "low" as const, suggestedAction: "review_trash", reason: "Messaggio promozionale o newsletter." };
  }
  if (hasAny(["fattura", "invoice", "bolletta", "scadenza", "pagamento", "rata", "sollecito", "multa"])) {
    return { category: "pagamenti" as const, importance: "high" as const, suggestedAction: "review_document", reason: "Possibile pagamento, fattura o scadenza." };
  }
  if (hasAny(["appuntamento", "prenotazione", "visita", "meeting", "conferma appuntamento"])) {
    return { category: "appuntamenti" as const, importance: "high" as const, suggestedAction: "review_calendar", reason: "Possibile appuntamento o prenotazione." };
  }
  if (hasAny(["contratto", "polizza", "documento", "allegato", "ricevuta", "quietanza"])) {
    return { category: "documenti" as const, importance: "medium" as const, suggestedAction: "review_document", reason: "Possibile documento utile da conservare." };
  }
  return {
    category: "altro" as const,
    importance: input.labelIds.includes("IMPORTANT") ? "high" as const : "medium" as const,
    suggestedAction: "none",
    reason: input.labelIds.includes("IMPORTANT") ? "Gmail la considera importante." : "Nessuna azione urgente riconosciuta.",
  };
}

async function classifyMessagesWithAi(messages: RawMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || messages.length === 0) return new Map<string, AiClassification>();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: [
              "Sei il motore di comprensione email di DocuMio.",
              "Analizza il significato reale di ogni email come farebbe un assistente umano prudente.",
              "Distingui pagamenti/scadenze, documenti, appuntamenti, pubblicità e altro.",
              "Non inventare importi o date. Usa null quando non sono chiaramente presenti.",
              "Una conferma di pagamento già effettuato non è una nuova scadenza: può essere documento/ricevuta.",
              "Le notifiche tecniche, di sicurezza o social non sono automaticamente importanti per DocuMio.",
              "Segna high solo quando richiede davvero attenzione, azione, pagamento o appuntamento.",
              "Scrivi reason in italiano, massimo 12 parole.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(messages.map((message) => ({
              id: message.id,
              subject: message.subject.slice(0, 300),
              from: message.from.slice(0, 250),
              date: message.date,
              snippet: message.snippet.slice(0, 700),
              labelIds: message.labelIds,
            }))),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "documio_email_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      category: { type: "string", enum: ["pagamenti", "documenti", "appuntamenti", "pubblicita", "altro"] },
                      importance: { type: "string", enum: ["high", "medium", "low"] },
                      suggestedAction: { type: "string", enum: ["review_document", "review_calendar", "review_trash", "none"] },
                      reason: { type: "string" },
                      documentType: { type: ["string", "null"] },
                      amount: { type: ["number", "null"] },
                      dueDate: { type: ["string", "null"] },
                      appointmentDate: { type: ["string", "null"] },
                      appointmentTime: { type: ["string", "null"] },
                      senderName: { type: ["string", "null"] },
                    },
                    required: ["id", "category", "importance", "suggestedAction", "reason", "documentType", "amount", "dueDate", "appointmentDate", "appointmentTime", "senderName"],
                  },
                },
              },
              required: ["results"],
            },
          },
        },
      }),
    });

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(data.error?.message ?? "Analisi IA non riuscita");

    const content = data.choices?.[0]?.message?.content;
    if (!content) return new Map<string, AiClassification>();
    const parsed = JSON.parse(content) as { results?: AiClassification[] };
    return new Map((parsed.results ?? []).map((item) => [item.id, item]));
  } catch (error) {
    console.error("Gmail AI classification failed", error);
    return new Map<string, AiClassification>();
  }
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

    const rawMessages: RawMessage[] = await Promise.all((listData.messages ?? []).map(async ({ id }) => {
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
      return {
        id: message.id,
        threadId: message.threadId,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        date: getHeader("Date"),
        snippet: message.snippet ?? "",
        labelIds: message.labelIds ?? [],
      };
    }));

    const aiResults = await classifyMessagesWithAi(rawMessages);
    const messages = rawMessages.map((message) => {
      const ai = aiResults.get(message.id);
      const fallback = classifyMessageFallback(message);
      return {
        ...message,
        category: ai?.category ?? fallback.category,
        importance: ai?.importance ?? fallback.importance,
        suggestedAction: ai?.suggestedAction ?? fallback.suggestedAction,
        reason: ai?.reason ?? fallback.reason,
        documentType: ai?.documentType ?? null,
        amount: ai?.amount ?? null,
        dueDate: ai?.dueDate ?? null,
        appointmentDate: ai?.appointmentDate ?? null,
        appointmentTime: ai?.appointmentTime ?? null,
        senderName: ai?.senderName ?? null,
        analyzedByAi: Boolean(ai),
      };
    });

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
      aiEnabled: Boolean(process.env.OPENAI_API_KEY),
    });
  } catch (error) {
    console.error("Gmail inbox failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore Gmail." }, { status: 500 });
  }
}
