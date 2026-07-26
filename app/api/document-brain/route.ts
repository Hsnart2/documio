import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DOCUMENTS = 300;
const MAX_ATTACHMENTS = 1500;
const MAX_SELECTED_DOCUMENTS = 8;
const MAX_FILES = 6;
const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_BYTES = 22 * 1024 * 1024;

type ConversationMessage = {
  role: "user" | "assistant";
  text: string;
};

type PracticeRow = {
  id: string;
  title: string | null;
  practice_type: string | null;
  description: string | null;
  status: string | null;
  opened_at: string | null;
};

type DocumentRow = {
  id: string;
  practice_id: string | null;
  title: string | null;
  file_name: string | null;
  storage_path: string | null;
  category: string | null;
  summary: string | null;
  keywords: unknown;
  uploaded_at: string | null;
  expiry_date: string | null;
  payment_status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  payment_method: string | null;
};

type AttachmentRow = {
  id: string;
  document_id: string;
  title: string | null;
  attachment_type: string | null;
  file_name: string | null;
  storage_path: string | null;
  payment_date: string | null;
  amount: number | null;
  payment_method: string | null;
  notes: string | null;
};

type PlannerResult = {
  intent: string;
  normalizedQuestion: string;
  needsClarification: boolean;
  clarifyingQuestion: string;
  documentIds: string[];
  practiceIds: string[];
  reason: string;
};

type AnswerResult = {
  answer: string;
  documentIds: string[];
  practiceIds: string[];
  confidence: "high" | "medium" | "low";
  needsClarification: boolean;
};

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

type FileInput = {
  documentId: string;
  practiceId: string | null;
  title: string;
  fileName: string;
  storagePath: string;
  priority: number;
};

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: unknown, max = 320) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function keywordList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => compact(item, 60)).filter(Boolean).slice(0, 12);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  return [];
}

function sanitizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-12)
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const text = compact(item?.text, 900);
      return text ? { role, text } : null;
    })
    .filter((item): item is ConversationMessage => Boolean(item));
}

function getMimeType(fileName: string, fallback?: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "documento.pdf";
}

function outputText(result: OpenAIResponse) {
  return result.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "output_text")?.text;
}

async function structuredResponse<T>(args: {
  apiKey: string;
  schemaName: string;
  schema: Record<string, unknown>;
  prompt: string;
  files?: Array<{ mime: string; fileName: string; dataUrl: string }>;
  reasoning?: "minimal" | "low" | "medium";
}): Promise<T> {
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: args.prompt },
    ...(args.files ?? []).map((file) =>
      file.mime.startsWith("image/")
        ? { type: "input_image", image_url: file.dataUrl }
        : {
            type: "input_file",
            filename: safeFileName(file.fileName),
            file_data: file.dataUrl,
          },
    ),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      reasoning: { effort: args.reasoning ?? "low" },
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
    }),
  });

  const result = (await response.json()) as OpenAIResponse;
  const text = outputText(result);
  if (!response.ok || !text) {
    throw new Error(result.error?.message || "Risposta IA non disponibile.");
  }
  return JSON.parse(text) as T;
}

function lexicalFallback(question: string, documents: Array<{ id: string; text: string }>) {
  const ignored = new Set([
    "cerca", "trova", "mostra", "apri", "dimmi", "documento", "documenti",
    "quale", "quali", "quando", "quanto", "come", "dove", "della", "dello",
    "delle", "degli", "questo", "questa", "quello", "quella", "sono", "che",
    "con", "per", "una", "uno", "del", "dei", "nel", "nella", "mia", "miei",
  ]);
  const terms = normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 2 && !ignored.has(term));
  return documents
    .map((document) => {
      const source = normalize(document.text);
      const score = terms.reduce((total, term) => total + (source.includes(term) ? 1 : 0), 0);
      return { id: document.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SELECTED_DOCUMENTS)
    .map((item) => item.id);
}

function stripTechnicalIds(answer: string) {
  return answer
    .replace(/\s*[—-]?\s*ID\s*:\s*[0-9a-f]{8}-[0-9a-f-]{27,36}/gi, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

    if (!apiKey || !supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const token = bearerToken(request);
    if (!token) return NextResponse.json({ error: "Sessione mancante." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      question?: unknown;
      language?: unknown;
      conversation?: unknown;
    } | null;
    const question = String(body?.question ?? "").trim();
    const language = body?.language === "en" ? "en" : "it";
    const conversation = sanitizeConversation(body?.conversation);

    if (!question) {
      return NextResponse.json({ error: language === "it" ? "Domanda mancante." : "Missing question." }, { status: 400 });
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: language === "it" ? "Sessione non valida." : "Invalid session." }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [practiceResult, documentResult, attachmentResult] = await Promise.all([
      admin
        .from("practices")
        .select("id,title,practice_type,description,status,opened_at")
        .eq("user_id", user.id)
        .order("opened_at", { ascending: false, nullsFirst: false })
        .limit(200),
      admin
        .from("documents")
        .select("id,practice_id,title,file_name,storage_path,category,summary,keywords,uploaded_at,expiry_date,payment_status,total_amount,paid_amount,remaining_amount,payment_method")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false, nullsFirst: false })
        .limit(MAX_DOCUMENTS),
      admin
        .from("document_attachments")
        .select("id,document_id,title,attachment_type,file_name,storage_path,payment_date,amount,payment_method,notes")
        .eq("user_id", user.id)
        .limit(MAX_ATTACHMENTS),
    ]);

    if (practiceResult.error || documentResult.error || attachmentResult.error) {
      console.error("Document brain archive error", {
        practices: practiceResult.error?.message,
        documents: documentResult.error?.message,
        attachments: attachmentResult.error?.message,
      });
      return NextResponse.json({ error: "Non riesco a leggere il tuo archivio." }, { status: 500 });
    }

    const practices = (practiceResult.data ?? []) as PracticeRow[];
    const documents = (documentResult.data ?? []) as DocumentRow[];
    const attachments = (attachmentResult.data ?? []) as AttachmentRow[];

    if (!documents.length && !practices.length) {
      return NextResponse.json({
        answer: language === "it"
          ? "Il tuo archivio è ancora vuoto. Carica un documento e potrò leggerlo, collegarlo ad altri file e rispondere alle tue domande."
          : "Your archive is empty. Upload a document and I will be able to read and analyse it.",
        documentIds: [],
        practiceIds: [],
        filesInspected: 0,
        mode: "document-brain",
        confidence: "high",
      });
    }

    const practiceById = new Map(practices.map((practice) => [practice.id, practice]));
    const attachmentsByDocument = new Map<string, AttachmentRow[]>();
    for (const attachment of attachments) {
      attachmentsByDocument.set(attachment.document_id, [
        ...(attachmentsByDocument.get(attachment.document_id) ?? []),
        attachment,
      ]);
    }

    const catalog = documents.map((document) => {
      const practice = document.practice_id ? practiceById.get(document.practice_id) : null;
      const linked = attachmentsByDocument.get(document.id) ?? [];
      return {
        id: document.id,
        title: document.title || document.file_name || "Documento senza titolo",
        category: document.category || "",
        summary: compact(document.summary, 360),
        keywords: keywordList(document.keywords),
        uploadedAt: document.uploaded_at,
        expiryDate: document.expiry_date,
        paymentStatus: document.payment_status,
        totalAmount: document.total_amount,
        paidAmount: document.paid_amount,
        remainingAmount: document.remaining_amount,
        paymentMethod: document.payment_method,
        practiceId: document.practice_id,
        practiceTitle: practice?.title || "",
        attachmentTitles: linked.slice(0, 8).map((item) => item.title || item.file_name || item.attachment_type || "Allegato"),
      };
    });

    const practicesCatalog = practices.map((practice) => ({
      id: practice.id,
      title: practice.title || "Pratica senza titolo",
      type: practice.practice_type || "",
      description: compact(practice.description, 260),
      status: practice.status || "",
      documentCount: documents.filter((document) => document.practice_id === practice.id).length,
    }));

    const transcript = conversation.length
      ? conversation.map((message) => `${message.role === "user" ? "Utente" : "DocuMio"}: ${message.text}`).join("\n")
      : "Nessuna conversazione precedente.";

    const plannerSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        intent: {
          type: "string",
          enum: ["answer", "list", "summarize", "compare", "extract", "deadline", "payment", "practice", "clarify"],
        },
        normalizedQuestion: { type: "string" },
        needsClarification: { type: "boolean" },
        clarifyingQuestion: { type: "string" },
        documentIds: { type: "array", items: { type: "string" }, maxItems: MAX_SELECTED_DOCUMENTS },
        practiceIds: { type: "array", items: { type: "string" }, maxItems: 3 },
        reason: { type: "string" },
      },
      required: ["intent", "normalizedQuestion", "needsClarification", "clarifyingQuestion", "documentIds", "practiceIds", "reason"],
    };

    const plannerPrompt = language === "it"
      ? `Sei il motore di ricerca semantica di DocuMio. Devi capire il significato della domanda e scegliere soltanto i documenti realmente utili dall'archivio dell'utente.

REGOLE:
- ragiona sul senso completo della domanda e sulla conversazione, non su una singola parola;
- non associare documenti solo perché condividono parole generiche come pagamento, certificato o documento;
- una denuncia di smarrimento non è collegata a un'assicurazione, salvo richiesta esplicita;
- una quietanza non è automaticamente la scadenza della polizza;
- per domande successive come “quando scade?”, “quanto costa?” o “che documenti contiene?”, conserva il soggetto citato nei messaggi precedenti;
- se esistono più risultati plausibili, chiedi quale usando i titoli REALI dell'archivio;
- se il dato non sembra presente, non inventare: seleziona i documenti più plausibili e lascia che l'assistente dica che non lo trova;
- scegli massimo ${MAX_SELECTED_DOCUMENTS} documenti e 3 pratiche;
- gli ID devono provenire esclusivamente dal catalogo.

CONVERSAZIONE:
${transcript}

DOMANDA ATTUALE:
${question}

PRATICHE:
${JSON.stringify(practicesCatalog)}

DOCUMENTI:
${JSON.stringify(catalog)}`
      : `You are DocuMio's semantic retrieval engine. Select only archive items genuinely relevant to the question and conversation. Never invent IDs or facts. Ask a clarification based on actual archive titles when necessary.

Conversation:\n${transcript}\n\nQuestion:\n${question}\n\nCases:\n${JSON.stringify(practicesCatalog)}\n\nDocuments:\n${JSON.stringify(catalog)}`;

    let plan: PlannerResult;
    try {
      plan = await structuredResponse<PlannerResult>({
        apiKey,
        schemaName: "documio_document_plan",
        schema: plannerSchema,
        prompt: plannerPrompt,
        reasoning: "medium",
      });
    } catch (plannerError) {
      console.error("Document brain planner error", plannerError);
      const fallbackIds = lexicalFallback(
        `${transcript} ${question}`,
        catalog.map((item) => ({ id: item.id, text: JSON.stringify(item) })),
      );
      plan = {
        intent: "answer",
        normalizedQuestion: question,
        needsClarification: false,
        clarifyingQuestion: "",
        documentIds: fallbackIds,
        practiceIds: [],
        reason: "fallback",
      };
    }

    const allowedDocumentIds = new Set(documents.map((document) => document.id));
    const allowedPracticeIds = new Set(practices.map((practice) => practice.id));
    const plannedPracticeIds = Array.from(new Set(plan.practiceIds ?? []))
      .filter((id) => allowedPracticeIds.has(id))
      .slice(0, 3);
    let plannedDocumentIds = Array.from(new Set(plan.documentIds ?? []))
      .filter((id) => allowedDocumentIds.has(id))
      .slice(0, MAX_SELECTED_DOCUMENTS);

    for (const practiceId of plannedPracticeIds) {
      for (const document of documents.filter((item) => item.practice_id === practiceId)) {
        if (plannedDocumentIds.length >= MAX_SELECTED_DOCUMENTS) break;
        if (!plannedDocumentIds.includes(document.id)) plannedDocumentIds.push(document.id);
      }
    }

    if (plan.needsClarification && plan.clarifyingQuestion.trim()) {
      return NextResponse.json({
        answer: stripTechnicalIds(plan.clarifyingQuestion),
        documentIds: plannedDocumentIds,
        practiceIds: plannedPracticeIds,
        filesInspected: 0,
        mode: "document-brain-clarification",
        confidence: "medium",
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const selectedDocuments = plannedDocumentIds
      .map((id) => documents.find((document) => document.id === id))
      .filter((document): document is DocumentRow => Boolean(document));

    const fileCandidates: FileInput[] = [];
    selectedDocuments.forEach((document, documentIndex) => {
      if (document.storage_path?.startsWith(`${user.id}/`)) {
        fileCandidates.push({
          documentId: document.id,
          practiceId: document.practice_id,
          title: document.title || document.file_name || "Documento",
          fileName: document.file_name || "documento.pdf",
          storagePath: document.storage_path,
          priority: documentIndex * 10,
        });
      }
      (attachmentsByDocument.get(document.id) ?? []).forEach((attachment, attachmentIndex) => {
        if (!attachment.storage_path?.startsWith(`${user.id}/`)) return;
        fileCandidates.push({
          documentId: document.id,
          practiceId: document.practice_id,
          title: attachment.title || attachment.file_name || "Allegato",
          fileName: attachment.file_name || "allegato.pdf",
          storagePath: attachment.storage_path,
          priority: documentIndex * 10 + attachmentIndex + 1,
        });
      });
    });

    const loadedFiles: Array<{ info: FileInput; mime: string; fileName: string; dataUrl: string }> = [];
    let totalBytes = 0;
    for (const candidate of fileCandidates.sort((a, b) => a.priority - b.priority)) {
      if (loadedFiles.length >= MAX_FILES) break;
      const { data, error } = await admin.storage.from("documents").download(candidate.storagePath);
      if (error || !data) continue;
      const bytes = Buffer.from(await data.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES || totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;
      const mime = getMimeType(candidate.fileName, data.type);
      if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) continue;
      loadedFiles.push({
        info: candidate,
        mime,
        fileName: candidate.fileName,
        dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      });
      totalBytes += bytes.length;
    }

    const selectedCatalog = catalog.filter((item) => plannedDocumentIds.includes(item.id));
    const selectedPractices = practicesCatalog.filter((item) => plannedPracticeIds.includes(item.id));
    const sourceMap = loadedFiles.map((file, index) => ({
      source: `F${index + 1}`,
      documentId: file.info.documentId,
      title: file.info.title,
    }));

    const answerSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        documentIds: { type: "array", items: { type: "string" }, maxItems: MAX_SELECTED_DOCUMENTS },
        practiceIds: { type: "array", items: { type: "string" }, maxItems: 3 },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        needsClarification: { type: "boolean" },
      },
      required: ["answer", "documentIds", "practiceIds", "confidence", "needsClarification"],
    };

    const answerPrompt = language === "it"
      ? `Sei DocuMio AI Documentale: un assistente molto intelligente, ma confinato esclusivamente nell'archivio dell'utente.

OBIETTIVO:
Comprendi la domanda nel contesto della conversazione, leggi i documenti selezionati e rispondi come un assistente umano esperto di documenti.

REGOLE ASSOLUTE:
- usa soltanto dati presenti nei metadati o nei file allegati a questa richiesta;
- non usare il web e non aggiungere conoscenze esterne come se provenissero dai documenti;
- non inventare date, importi, soggetti, scadenze, obblighi o collegamenti;
- distingui chiaramente tra dato certo, possibile interpretazione e dato non trovato;
- non includere documenti estranei solo perché hanno una parola simile;
- considera la conversazione precedente per capire riferimenti come “quello”, “quando scade?”, “quanto ho pagato?”;
- per confronti, evidenzia differenze concrete documento per documento;
- per scadenze, non confondere la data del pagamento con la fine della copertura o validità;
- per pratiche, usa soltanto i documenti realmente collegati;
- se la risposta non è presente, scrivi chiaramente “Non trovo questa informazione nei documenti disponibili”;
- non mostrare UUID, percorsi tecnici o nomi Storage;
- restituisci nei campi documentIds e practiceIds soltanto le fonti realmente usate;
- rispondi in italiano naturale, concreto e non prolisso.

CONVERSAZIONE:
${transcript}

DOMANDA:
${question}

INTENTO INTERPRETATO:
${plan.intent} — ${plan.normalizedQuestion}

PRATICHE SELEZIONATE:
${JSON.stringify(selectedPractices)}

DOCUMENTI SELEZIONATI:
${JSON.stringify(selectedCatalog)}

MAPPA DEI FILE LETTI:
${JSON.stringify(sourceMap)}

Se non sono stati selezionati documenti, puoi rispondere soltanto sulle pratiche o sull'assenza di risultati nell'archivio.`
      : `You are DocuMio Document AI, an intelligent assistant strictly limited to the user's archive. Use only supplied metadata and files, keep conversational context, never invent facts, and clearly say when information is not found.

Conversation:\n${transcript}\n\nQuestion:\n${question}\n\nSelected cases:\n${JSON.stringify(selectedPractices)}\n\nSelected documents:\n${JSON.stringify(selectedCatalog)}\n\nFiles read:\n${JSON.stringify(sourceMap)}`;

    let answerResult: AnswerResult;
    try {
      answerResult = await structuredResponse<AnswerResult>({
        apiKey,
        schemaName: "documio_document_answer",
        schema: answerSchema,
        prompt: answerPrompt,
        files: loadedFiles.map((file) => ({ mime: file.mime, fileName: file.fileName, dataUrl: file.dataUrl })),
        reasoning: "medium",
      });
    } catch (answerError) {
      console.error("Document brain answer error", answerError);
      const titles = selectedCatalog.map((item) => item.title).slice(0, 5);
      answerResult = {
        answer: titles.length
          ? `Ho trovato questi documenti pertinenti: ${titles.join("; ")}. Non riesco però a leggere una risposta affidabile in questo momento.`
          : "Non trovo documenti sufficientemente pertinenti per rispondere con sicurezza.",
        documentIds: plannedDocumentIds.slice(0, 5),
        practiceIds: plannedPracticeIds,
        confidence: "low",
        needsClarification: false,
      };
    }

    const finalDocumentIds = Array.from(new Set(answerResult.documentIds ?? []))
      .filter((id) => plannedDocumentIds.includes(id))
      .slice(0, MAX_SELECTED_DOCUMENTS);
    const finalPracticeIds = Array.from(new Set(answerResult.practiceIds ?? []))
      .filter((id) => plannedPracticeIds.includes(id))
      .slice(0, 3);

    return NextResponse.json({
      answer: stripTechnicalIds(answerResult.answer || "Non ho trovato informazioni sufficienti."),
      documentIds: finalDocumentIds.length ? finalDocumentIds : plannedDocumentIds.slice(0, 4),
      practiceIds: finalPracticeIds.length ? finalPracticeIds : plannedPracticeIds,
      filesInspected: loadedFiles.length,
      mode: "document-brain",
      confidence: answerResult.confidence,
      needsClarification: answerResult.needsClarification,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Document brain route error", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Errore imprevisto dell'assistente documentale.",
    }, { status: 500 });
  }
}
