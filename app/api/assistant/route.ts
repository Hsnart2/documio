import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type AssistantAttachment = {
  title?: string;
  type?: string;
  fileName?: string;
  paymentDate?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  notes?: string | null;
};

type AssistantDocument = {
  id: string;
  practiceId?: string | null;
  title?: string;
  fileName?: string;
  category?: string;
  summary?: string;
  keywords?: string[];
  expiryDate?: string | null;
  paymentStatus?: string | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  remainingAmount?: number | null;
  paymentMethod?: string | null;
  attachments?: AssistantAttachment[];
};

type AssistantPractice = {
  id: string;
  title?: string;
  practiceType?: string;
  description?: string | null;
  status?: string | null;
  openedAt?: string | null;
  documents?: AssistantDocument[];
};

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTerms(question: string) {
  const ignored = new Set([
    "cerca",
    "cercami",
    "trova",
    "trovami",
    "fammi",
    "vedere",
    "aprimi",
    "apri",
    "pratica",
    "documento",
    "documenti",
    "allegato",
    "allegati",
    "quella",
    "quello",
    "che",
    "della",
    "dello",
    "delle",
    "degli",
    "del",
    "di",
    "la",
    "il",
    "lo",
    "le",
    "i",
    "un",
    "una",
    "the",
    "find",
    "show",
    "open",
    "case",
    "document",
    "documents",
    "attachment",
    "attachments",
  ]);

  return normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !ignored.has(term));
}

function scoreText(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return terms.reduce((score, term) => {
    if (!normalizedText.includes(term)) return score;
    const exactWord = new RegExp(`(^|\\s)${term}(\\s|$)`).test(normalizedText);
    return score + (exactWord ? 4 : 2);
  }, 0);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY non configurata." },
        { status: 500 },
      );
    }

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configurazione Supabase incompleta." },
        { status: 500 },
      );
    }

    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token di accesso mancante." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      question?: string;
      language?: "it" | "en";
    };

    const question = String(body.question || "").trim();
    const language = body.language === "en" ? "en" : "it";

    if (!question) {
      return NextResponse.json(
        {
          error:
            language === "it" ? "Domanda mancante." : "Missing question.",
        },
        { status: 400 },
      );
    }

    const supabaseAuth = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: language === "it" ? "Sessione non valida." : "Invalid session." },
        { status: 401 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [practiceResult, documentResult, attachmentResult] = await Promise.all([
      supabaseAdmin
        .from("practices")
        .select("id, title, practice_type, description, status, opened_at")
        .eq("user_id", user.id)
        .limit(250),
      supabaseAdmin
        .from("documents")
        .select(
          "id, practice_id, title, file_name, category, summary, keywords, expiry_date, payment_status, total_amount, paid_amount, remaining_amount, payment_method",
        )
        .eq("user_id", user.id)
        .limit(1000),
      supabaseAdmin
        .from("document_attachments")
        .select(
          "document_id, title, attachment_type, file_name, payment_date, amount, payment_method, notes",
        )
        .eq("user_id", user.id)
        .limit(2500),
    ]);

    if (practiceResult.error || documentResult.error || attachmentResult.error) {
      console.error("Assistant archive read failed", {
        practices: practiceResult.error?.message,
        documents: documentResult.error?.message,
        attachments: attachmentResult.error?.message,
        userId: user.id,
      });
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "Non riesco a leggere l'archivio in questo momento."
              : "I cannot read the archive right now.",
        },
        { status: 500 },
      );
    }

    const attachmentsByDocument = new Map<string, AssistantAttachment[]>();
    for (const row of attachmentResult.data ?? []) {
      const documentId = String(row.document_id);
      const current = attachmentsByDocument.get(documentId) ?? [];
      current.push({
        title: row.title ?? undefined,
        type: row.attachment_type ?? undefined,
        fileName: row.file_name ?? undefined,
        paymentDate: row.payment_date ?? null,
        amount: row.amount ?? null,
        paymentMethod: row.payment_method ?? null,
        notes: row.notes ?? null,
      });
      attachmentsByDocument.set(documentId, current);
    }

    const allDocuments: AssistantDocument[] = (documentResult.data ?? []).map(
      (row) => ({
        id: String(row.id),
        practiceId: row.practice_id ?? null,
        title: row.title ?? undefined,
        fileName: row.file_name ?? undefined,
        category: row.category ?? undefined,
        summary: row.summary ?? undefined,
        keywords: Array.isArray(row.keywords) ? row.keywords : [],
        expiryDate: row.expiry_date ?? null,
        paymentStatus: row.payment_status ?? null,
        totalAmount: row.total_amount ?? null,
        paidAmount: row.paid_amount ?? null,
        remainingAmount: row.remaining_amount ?? null,
        paymentMethod: row.payment_method ?? null,
        attachments: attachmentsByDocument.get(String(row.id)) ?? [],
      }),
    );

    const documentsByPractice = new Map<string, AssistantDocument[]>();
    for (const document of allDocuments) {
      if (!document.practiceId) continue;
      const current = documentsByPractice.get(document.practiceId) ?? [];
      current.push(document);
      documentsByPractice.set(document.practiceId, current);
    }

    const allPractices: AssistantPractice[] = (practiceResult.data ?? []).map(
      (row) => ({
        id: String(row.id),
        title: row.title ?? undefined,
        practiceType: row.practice_type ?? undefined,
        description: row.description ?? null,
        status: row.status ?? null,
        openedAt: row.opened_at ?? null,
        documents: documentsByPractice.get(String(row.id)) ?? [],
      }),
    );

    const terms = getTerms(question);
    const rankedPractices = allPractices
      .map((practice) => {
        const linkedText = (practice.documents ?? [])
          .map((document) => {
            const attachmentText = (document.attachments ?? [])
              .map(
                (attachment) =>
                  `${attachment.title ?? ""} ${attachment.type ?? ""} ${attachment.fileName ?? ""} ${attachment.notes ?? ""}`,
              )
              .join(" ");
            return `${document.title ?? ""} ${document.fileName ?? ""} ${document.summary ?? ""} ${(document.keywords ?? []).join(" ")} ${attachmentText}`;
          })
          .join(" ");
        const primaryText = `${practice.title ?? ""} ${practice.practiceType ?? ""} ${practice.description ?? ""} ${practice.status ?? ""}`;
        return {
          practice,
          score: scoreText(primaryText, terms) * 3 + scoreText(linkedText, terms),
        };
      })
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((item) => item.practice);

    const rankedDocuments = allDocuments
      .map((document) => {
        const attachmentText = (document.attachments ?? [])
          .map(
            (attachment) =>
              `${attachment.title ?? ""} ${attachment.type ?? ""} ${attachment.fileName ?? ""} ${attachment.notes ?? ""}`,
          )
          .join(" ");
        const practice = document.practiceId
          ? allPractices.find((item) => item.id === document.practiceId)
          : undefined;
        const text = `${document.title ?? ""} ${document.fileName ?? ""} ${document.category ?? ""} ${document.summary ?? ""} ${(document.keywords ?? []).join(" ")} ${attachmentText} ${practice?.title ?? ""} ${practice?.description ?? ""}`;
        return { document, score: scoreText(text, terms) };
      })
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((item) => item.document);

    const archive = {
      practices: rankedPractices.map((practice) => ({
        id: practice.id,
        title: practice.title,
        practiceType: practice.practiceType,
        description: practice.description,
        status: practice.status,
        openedAt: practice.openedAt,
        documents: (practice.documents ?? []).slice(0, 20).map((document) => ({
          id: document.id,
          title: document.title,
          fileName: document.fileName,
          summary: document.summary,
          keywords: document.keywords,
          attachments: document.attachments,
        })),
      })),
      documents: rankedDocuments,
    };

    const instructions =
      language === "it"
        ? `Sei DocuMio Assistant, un assistente amministrativo personale.
Rispondi esclusivamente usando i dati strutturati dell'archivio fornito.

Regole:
- Cerca sia nelle pratiche sia nei documenti e negli allegati.
- Se l'utente chiede una pratica, indica chiaramente il nome esatto della pratica trovata, il suo stato e i documenti collegati rilevanti.
- Se la corrispondenza deriva dal titolo o dalle note di un allegato, spiegalo brevemente.
- Sii breve, concreto e prudente.
- Non inventare informazioni assenti.
- Se un dato non è disponibile, dillo chiaramente.
- Cita nel testo i titoli delle pratiche e dei documenti usati.
- Restituisci negli ID soltanto pratiche e documenti davvero utili.
- Non dare consulenza legale, medica o finanziaria definitiva.

Domanda:
${question}

Archivio:
${JSON.stringify(archive)}`
        : `You are DocuMio Assistant, a personal administrative assistant.
Answer only from the structured archive data provided.

Rules:
- Search cases, documents, and attachments.
- When the user asks for a case, clearly state the exact case title, status, and relevant linked documents.
- Briefly explain when a match comes from an attachment title or notes.
- Be brief, concrete, and careful.
- Never invent missing information.
- Mention the case and document titles used.
- Return only genuinely useful case and document IDs.
- Do not provide definitive legal, medical, or financial advice.

Question:
${question}

Archive:
${JSON.stringify(archive)}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: instructions,
        text: {
          format: {
            type: "json_schema",
            name: "documio_assistant_answer",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                documentIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 10,
                },
                practiceIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 10,
                },
              },
              required: ["answer", "documentIds", "practiceIds"],
            },
          },
        },
      }),
    });

    const result = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            (language === "it"
              ? "Assistente IA non disponibile."
              : "AI assistant unavailable."),
        },
        { status: response.status },
      );
    }

    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (!outputText) {
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "La risposta dell'assistente non era leggibile."
              : "The assistant response could not be read.",
        },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(outputText) as {
      answer?: string;
      documentIds?: string[];
      practiceIds?: string[];
    };

    const validDocumentIds = new Set(allDocuments.map((document) => document.id));
    const validPracticeIds = new Set(allPractices.map((practice) => practice.id));
    const practiceIds = (parsed.practiceIds ?? []).filter((id) =>
      validPracticeIds.has(id),
    );
    const linkedDocumentIds = practiceIds.flatMap(
      (practiceId) =>
        documentsByPractice.get(practiceId)?.map((document) => document.id) ?? [],
    );
    const documentIds = Array.from(
      new Set([
        ...(parsed.documentIds ?? []).filter((id) => validDocumentIds.has(id)),
        ...linkedDocumentIds,
      ]),
    ).slice(0, 10);

    return NextResponse.json({
      answer: parsed.answer || "",
      documentIds,
      practiceIds,
    });
  } catch (error) {
    console.error("Assistant route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto dell'assistente.",
      },
      { status: 500 },
    );
  }
}
