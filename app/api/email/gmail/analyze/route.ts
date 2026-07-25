import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 15;
const OPENAI_TIMEOUT_MS = 45_000;

type EmailCategory = "pagamenti" | "documenti" | "appuntamenti" | "pubblicita" | "altro";
type EmailImportance = "high" | "medium" | "low";

type EmailInput = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
};

type EmailAnalysis = {
  id: string;
  category: EmailCategory;
  importance: EmailImportance;
  suggestedAction: "review_document" | "review_calendar" | "review_trash" | "none";
  reason: string;
  documentType: string | null;
  amount: number | null;
  dueDate: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  senderName: string | null;
};

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function normalizeMessages(value: unknown): EmailInput[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_MESSAGES).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const message = item as Record<string, unknown>;
    if (typeof message.id !== "string" || !message.id.trim()) return [];

    return [{
      id: message.id.trim(),
      subject: typeof message.subject === "string" ? message.subject.slice(0, 300) : "",
      from: typeof message.from === "string" ? message.from.slice(0, 250) : "",
      date: typeof message.date === "string" ? message.date.slice(0, 120) : "",
      snippet: typeof message.snippet === "string" ? message.snippet.slice(0, 800) : "",
      labelIds: Array.isArray(message.labelIds)
        ? message.labelIds.filter((label): label is string => typeof label === "string").slice(0, 30)
        : [],
    }];
  });
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const token = getBearerToken(request);
    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!token || !apiKey || !supabaseUrl || !publishableKey) {
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

    const body = await request.json() as { messages?: unknown };
    const messages = normalizeMessages(body.messages);
    if (messages.length === 0) {
      return NextResponse.json({ error: "Nessuna email da analizzare." }, { status: 400 });
    }

    const currentDate = new Date().toISOString().slice(0, 10);
    const instructions = `Sei l'assistente email di DocuMio. Oggi è ${currentDate}.
Analizza ogni email come farebbe una persona prudente, usando oggetto, mittente, data, anteprima ed etichette.
Classifica in una sola categoria: pagamenti, documenti, appuntamenti, pubblicita, altro.
Segna importanza high solo quando serve davvero un'azione, un pagamento, una risposta, un appuntamento o c'è un rischio concreto.
Una ricevuta o conferma di pagamento già effettuato è un documento, non una nuova scadenza.
Le notifiche tecniche, sociali e di sicurezza non sono automaticamente importanti per DocuMio.
Non inventare importi, date, orari o nomi: usa null quando non sono chiaramente presenti.
Per date e appuntamenti usa YYYY-MM-DD; per l'orario usa HH:MM.
Scrivi reason in italiano, chiaro e massimo 16 parole.
Restituisci un risultato per ogni id ricevuto.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instructions },
              { type: "input_text", text: JSON.stringify(messages) },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "documio_email_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  minItems: messages.length,
                  maxItems: messages.length,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      category: {
                        type: "string",
                        enum: ["pagamenti", "documenti", "appuntamenti", "pubblicita", "altro"],
                      },
                      importance: { type: "string", enum: ["high", "medium", "low"] },
                      suggestedAction: {
                        type: "string",
                        enum: ["review_document", "review_calendar", "review_trash", "none"],
                      },
                      reason: { type: "string" },
                      documentType: { anyOf: [{ type: "string" }, { type: "null" }] },
                      amount: { anyOf: [{ type: "number" }, { type: "null" }] },
                      dueDate: {
                        anyOf: [
                          { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                          { type: "null" },
                        ],
                      },
                      appointmentDate: {
                        anyOf: [
                          { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                          { type: "null" },
                        ],
                      },
                      appointmentTime: {
                        anyOf: [
                          { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
                          { type: "null" },
                        ],
                      },
                      senderName: { anyOf: [{ type: "string" }, { type: "null" }] },
                    },
                    required: [
                      "id",
                      "category",
                      "importance",
                      "suggestedAction",
                      "reason",
                      "documentType",
                      "amount",
                      "dueDate",
                      "appointmentDate",
                      "appointmentTime",
                      "senderName"
                    ],
                  },
                },
              },
              required: ["results"],
            },
          },
        },
      }),
    });

    const result = await response.json() as OpenAIResponse;
    if (!response.ok) {
      return NextResponse.json(
        { error: result.error?.message ?? "Analisi IA non riuscita." },
        { status: response.status },
      );
    }

    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (!outputText) {
      return NextResponse.json(
        { error: "L'IA ha risposto, ma il risultato non era leggibile." },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(outputText) as { results?: EmailAnalysis[] };
    const allowedIds = new Set(messages.map((message) => message.id));
    const results = (parsed.results ?? []).filter(
      (item) => item && typeof item.id === "string" && allowedIds.has(item.id),
    );

    return NextResponse.json({ results, analyzed: results.length });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "L'analisi sta impiegando troppo tempo. Riprova tra poco." },
        { status: 504 },
      );
    }

    console.error("Manual Gmail AI analysis failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analisi email non riuscita." },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
