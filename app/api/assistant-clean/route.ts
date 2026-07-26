import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { POST as runAssistant } from "../assistant/route";

export const runtime = "nodejs";
export const maxDuration = 60;

type AssistantPayload = {
  answer?: string;
  documentIds?: string[];
  practiceIds?: string[];
  filesInspected?: number;
  error?: string;
};

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function bearerToken(request: Request) {
  const match = (request.headers.get("authorization") ?? "").match(
    /^Bearer\s+(.+)$/i,
  );
  return match?.[1]?.trim() ?? null;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDecorativeDocument(title: string, question: string) {
  const normalizedTitle = normalize(title);
  const normalizedQuestion = normalize(question);
  const asksForMedia = /\b(logo|icona|immagine|grafica)\b/.test(normalizedQuestion);

  if (asksForMedia) return false;

  return (
    /\b(logo|icona)\b/.test(normalizedTitle) ||
    normalizedTitle.includes("nessun documento riconoscibile")
  );
}

function isLostDocumentQuestion(question: string) {
  const value = normalize(question);
  const asksLoss = [
    "denuncia",
    "smarrimento",
    "documenti persi",
    "documenti smarriti",
    "carta identita persa",
    "tessera sanitaria persa",
  ].some((term) => value.includes(term));
  const explicitlyAsksInsurance = ["assicurazione", "polizza", "allianz", "rca"].some(
    (term) => value.includes(term),
  );
  return asksLoss && !explicitlyAsksInsurance;
}

function isRelevantToLostDocuments(document: {
  title: string;
  summary: string;
  category: string;
}) {
  const value = normalize(`${document.title} ${document.summary} ${document.category}`);
  const relevant = [
    "denuncia",
    "smarrimento",
    "smarrit",
    "carta d identita",
    "carta identita",
    "tessera sanitaria",
    "carabinieri",
    "questura",
    "documenti persi",
  ].some((term) => value.includes(term));
  const unrelatedInsurance = [
    "assicurazione",
    "polizza",
    "quietanza",
    "rc auto",
    "allianz",
  ].some((term) => value.includes(term));
  return relevant && !unrelatedInsurance;
}

export async function POST(request: Request) {
  const requestForBody = request.clone();
  const body = (await requestForBody.json().catch(() => null)) as {
    question?: string;
    language?: "it" | "en";
  } | null;
  const question = String(body?.question ?? "").trim();
  const language = body?.language === "en" ? "en" : "it";

  const originalResponse = await runAssistant(request);
  const originalPayload = (await originalResponse
    .clone()
    .json()
    .catch(() => null)) as AssistantPayload | null;

  if (!originalResponse.ok || !originalPayload) {
    return originalResponse;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const token = bearerToken(requestForBody);

  if (!apiKey || !supabaseUrl || !serviceRoleKey || !token) {
    return NextResponse.json(originalPayload, {
      status: originalResponse.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const documentIds = Array.from(new Set(originalPayload.documentIds ?? [])).slice(
    0,
    10,
  );
  const practiceIds = Array.from(new Set(originalPayload.practiceIds ?? [])).slice(
    0,
    10,
  );

  const [documentResult, practiceResult] = await Promise.all([
    documentIds.length
      ? admin
          .from("documents")
          .select("id,title,summary,category")
          .in("id", documentIds)
      : Promise.resolve({ data: [], error: null }),
    practiceIds.length
      ? admin
          .from("practices")
          .select("id,title,status,practice_type")
          .in("id", practiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const allDocuments = (documentResult.data ?? [])
    .map((item) => ({
      id: String(item.id),
      title: String(item.title ?? "Documento"),
      summary: String(item.summary ?? ""),
      category: String(item.category ?? ""),
    }))
    .filter((item) => !isDecorativeDocument(item.title, question));

  const lostDocumentIntent = isLostDocumentQuestion(question);
  const lostDocumentMatches = lostDocumentIntent
    ? allDocuments.filter(isRelevantToLostDocuments)
    : [];
  const documents =
    lostDocumentIntent && lostDocumentMatches.length > 0
      ? lostDocumentMatches
      : allDocuments;

  const practices = (practiceResult.data ?? []).map((item) => ({
    id: String(item.id),
    title: String(item.title ?? "Pratica"),
    status: String(item.status ?? ""),
    practiceType: String(item.practice_type ?? ""),
  }));

  const relevanceRule = lostDocumentIntent
    ? language === "it"
      ? "- La domanda riguarda una denuncia o documenti smarriti: cita esclusivamente verbali di denuncia, carta d’identità, tessera sanitaria o documenti direttamente collegati allo smarrimento. Non citare assicurazioni, polizze o quietanze salvo richiesta esplicita."
      : "- The question concerns lost documents: include only reports and documents directly related to the loss. Do not mention insurance policies or receipts unless explicitly requested."
    : "";

  const cleanupInstructions =
    language === "it"
      ? `Riscrivi la risposta di DocuMio in italiano semplice e professionale.

Regole obbligatorie:
- massimo 120 parole;
- non mostrare UUID, ID tecnici, percorsi Storage o nomi file;
- non dire mai di indicare un ID per aprire un documento;
- non citare logo, icone o immagini decorative, salvo richiesta esplicita;
- mostra solo la pratica e i documenti realmente utili alla domanda;
${relevanceRule}
- non ripetere informazioni;
- usa al massimo un breve elenco;
- non inventare nulla;
- restituisci soltanto gli ID dei risultati che citi davvero nella risposta.

Domanda utente:
${question}

Risposta tecnica da ripulire:
${originalPayload.answer ?? ""}

Pratiche disponibili:
${JSON.stringify(practices)}

Documenti disponibili:
${JSON.stringify(documents)}`
      : `Rewrite the DocuMio answer in clear, professional English.

Mandatory rules:
- maximum 120 words;
- never show UUIDs, technical IDs, Storage paths, or filenames;
- never ask the user to provide an ID to open a document;
- omit logos, icons, and decorative images unless explicitly requested;
- include only the case and documents genuinely relevant to the question;
${relevanceRule}
- avoid repetition;
- use at most one short list;
- invent nothing;
- return only IDs for results actually mentioned in the answer.

User question:
${question}

Technical answer to clean:
${originalPayload.answer ?? ""}

Available cases:
${JSON.stringify(practices)}

Available documents:
${JSON.stringify(documents)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        input: cleanupInstructions,
        text: {
          format: {
            type: "json_schema",
            name: "documio_clean_answer",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                documentIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 5,
                },
                practiceIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 3,
                },
              },
              required: ["answer", "documentIds", "practiceIds"],
            },
          },
        },
      }),
    });

    const result = (await response.json()) as OpenAIResponse;
    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (!response.ok || !outputText) {
      throw new Error(result.error?.message || "Assistant cleanup failed");
    }

    const cleaned = JSON.parse(outputText) as AssistantPayload;
    const allowedDocumentIds = new Set(documents.map((item) => item.id));
    const allowedPracticeIds = new Set(practices.map((item) => item.id));

    return NextResponse.json(
      {
        answer: cleaned.answer || originalPayload.answer || "",
        documentIds: (cleaned.documentIds ?? []).filter((id) =>
          allowedDocumentIds.has(id),
        ),
        practiceIds: (cleaned.practiceIds ?? []).filter((id) =>
          allowedPracticeIds.has(id),
        ),
        filesInspected: originalPayload.filesInspected ?? 0,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Assistant cleanup error:", error);

    if (lostDocumentIntent && lostDocumentMatches.length > 0) {
      return NextResponse.json(
        {
          answer: `Ho trovato ${lostDocumentMatches.length === 1 ? "questo documento" : "questi documenti"} collegato${lostDocumentMatches.length === 1 ? "" : "i"} alla denuncia di smarrimento:\n${lostDocumentMatches
            .slice(0, 5)
            .map((item) => `- ${item.title}`)
            .join("\n")}`,
          documentIds: lostDocumentMatches.slice(0, 5).map((item) => item.id),
          practiceIds: [],
          filesInspected: originalPayload.filesInspected ?? 0,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    return NextResponse.json(
      {
        ...originalPayload,
        documentIds: documents.slice(0, 3).map((item) => item.id),
        practiceIds: practices.slice(0, 2).map((item) => item.id),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
