import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 4;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

type ArchiveFile = {
  documentId: string;
  practiceId: string | null;
  kind: "document" | "attachment";
  title: string;
  fileName: string;
  storagePath: string | null;
  metadataText: string;
  score: number;
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
  expiry_date: string | null;
  payment_status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  payment_method: string | null;
};

type AttachmentRow = {
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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function termsFrom(question: string) {
  const ignored = new Set([
    "cerca", "cercami", "trova", "trovami", "fammi", "vedere", "aprimi",
    "apri", "pratica", "pratiche", "documento", "documenti", "allegato",
    "allegati", "quella", "quello", "che", "della", "dello", "delle",
    "degli", "del", "di", "la", "il", "lo", "le", "i", "un", "una",
    "the", "find", "show", "open", "case", "document", "documents",
    "attachment", "attachments",
  ]);
  return normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !ignored.has(term));
}

function score(text: string, terms: string[]) {
  const source = normalize(text);
  return terms.reduce((total, term) => {
    if (!source.includes(term)) return total;
    const exact = new RegExp(`(^|\\s)${term}(\\s|$)`).test(source);
    return total + (exact ? 4 : 2);
  }, 0);
}

function mimeType(fileName: string, fallback?: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "file.pdf";
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
      return NextResponse.json(
        { error: "Configurazione server incompleta." },
        { status: 500 },
      );
    }

    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Token mancante." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      question?: string;
      language?: "it" | "en";
    } | null;
    const question = String(body?.question ?? "").trim();
    const language = body?.language === "en" ? "en" : "it";

    if (!question) {
      return NextResponse.json(
        { error: language === "it" ? "Domanda mancante." : "Missing question." },
        { status: 400 },
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
      return NextResponse.json(
        { error: language === "it" ? "Sessione non valida." : "Invalid session." },
        { status: 401 },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [practiceResult, documentResult, attachmentResult] = await Promise.all([
      admin
        .from("practices")
        .select("id,title,practice_type,description,status,opened_at")
        .eq("user_id", user.id)
        .limit(250),
      admin
        .from("documents")
        .select(
          "id,practice_id,title,file_name,storage_path,category,summary,keywords,expiry_date,payment_status,total_amount,paid_amount,remaining_amount,payment_method",
        )
        .eq("user_id", user.id)
        .limit(1000),
      admin
        .from("document_attachments")
        .select(
          "document_id,title,attachment_type,file_name,storage_path,payment_date,amount,payment_method,notes",
        )
        .eq("user_id", user.id)
        .limit(2500),
    ]);

    if (practiceResult.error || documentResult.error || attachmentResult.error) {
      console.error("Assistant archive read failed", {
        userId: user.id,
        practices: practiceResult.error?.message,
        documents: documentResult.error?.message,
        attachments: attachmentResult.error?.message,
      });
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "Non riesco a leggere l'archivio."
              : "I cannot read the archive.",
        },
        { status: 500 },
      );
    }

    const practices = (practiceResult.data ?? []) as PracticeRow[];
    const documents = (documentResult.data ?? []) as DocumentRow[];
    const attachments = (attachmentResult.data ?? []) as AttachmentRow[];
    const practiceMap = new Map(practices.map((item) => [item.id, item]));
    const terms = termsFrom(question);

    const attachmentMap = new Map<string, AttachmentRow[]>();
    for (const attachment of attachments) {
      const current = attachmentMap.get(attachment.document_id) ?? [];
      current.push(attachment);
      attachmentMap.set(attachment.document_id, current);
    }

    const archiveFiles: ArchiveFile[] = [];
    const structuredDocuments = documents.map((document) => {
      const practice = document.practice_id
        ? practiceMap.get(document.practice_id)
        : undefined;
      const linkedAttachments = attachmentMap.get(document.id) ?? [];
      const keywords = Array.isArray(document.keywords) ? document.keywords : [];
      const documentText = [
        document.title,
        document.file_name,
        document.category,
        document.summary,
        keywords.join(" "),
        practice?.title,
        practice?.description,
      ].join(" ");
      const documentScore = score(documentText, terms);

      archiveFiles.push({
        documentId: document.id,
        practiceId: document.practice_id,
        kind: "document",
        title: document.title ?? document.file_name ?? "Documento",
        fileName: document.file_name ?? "documento.pdf",
        storagePath: document.storage_path,
        metadataText: documentText,
        score: documentScore + (document.storage_path ? 1 : 0),
      });

      const structuredAttachments = linkedAttachments.map((attachment) => {
        const attachmentText = [
          attachment.title,
          attachment.attachment_type,
          attachment.file_name,
          attachment.notes,
          practice?.title,
          document.title,
        ].join(" ");
        archiveFiles.push({
          documentId: document.id,
          practiceId: document.practice_id,
          kind: "attachment",
          title: attachment.title ?? attachment.file_name ?? "Allegato",
          fileName: attachment.file_name ?? "allegato.pdf",
          storagePath: attachment.storage_path,
          metadataText: attachmentText,
          score: score(attachmentText, terms) + (attachment.storage_path ? 1 : 0),
        });
        return {
          title: attachment.title,
          type: attachment.attachment_type,
          fileName: attachment.file_name,
          paymentDate: attachment.payment_date,
          amount: attachment.amount,
          paymentMethod: attachment.payment_method,
          notes: attachment.notes,
        };
      });

      return {
        id: document.id,
        practiceId: document.practice_id,
        practiceTitle: practice?.title ?? null,
        title: document.title,
        fileName: document.file_name,
        category: document.category,
        summary: document.summary,
        keywords,
        expiryDate: document.expiry_date,
        paymentStatus: document.payment_status,
        totalAmount: document.total_amount,
        paidAmount: document.paid_amount,
        remainingAmount: document.remaining_amount,
        paymentMethod: document.payment_method,
        attachments: structuredAttachments,
        score: documentScore,
      };
    });

    const rankedDocuments = structuredDocuments
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    const rankedPractices = practices
      .map((practice) => {
        const linked = structuredDocuments.filter(
          (document) => document.practiceId === practice.id,
        );
        const primary = score(
          [practice.title, practice.practice_type, practice.description, practice.status].join(" "),
          terms,
        );
        const linkedScore = Math.max(0, ...linked.map((item) => item.score));
        return { practice, linked, score: primary * 3 + linkedScore };
      })
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const candidateFiles = archiveFiles
      .filter(
        (file) =>
          file.storagePath &&
          file.storagePath.startsWith(`${user.id}/`) &&
          (file.score > 0 || terms.length === 0),
      )
      .sort((a, b) => b.score - a.score);

    const selectedFiles: Array<{
      info: ArchiveFile;
      dataUrl: string;
      mime: string;
    }> = [];
    let totalBytes = 0;

    for (const candidate of candidateFiles) {
      if (selectedFiles.length >= MAX_FILES) break;
      if (!candidate.storagePath) continue;

      const { data, error } = await admin.storage
        .from("documents")
        .download(candidate.storagePath);
      if (error || !data) {
        console.warn("Assistant skipped unreadable file", {
          userId: user.id,
          storagePath: candidate.storagePath,
          message: error?.message,
        });
        continue;
      }

      const bytes = Buffer.from(await data.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) continue;
      if (totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;

      const detectedMime = mimeType(candidate.fileName, data.type);
      if (![
        "application/pdf",
        "image/jpeg",
        "image/png",
      ].includes(detectedMime)) {
        continue;
      }

      selectedFiles.push({
        info: candidate,
        mime: detectedMime,
        dataUrl: `data:${detectedMime};base64,${bytes.toString("base64")}`,
      });
      totalBytes += bytes.length;
    }

    const archive = {
      practices: rankedPractices.map(({ practice, linked }) => ({
        id: practice.id,
        title: practice.title,
        practiceType: practice.practice_type,
        description: practice.description,
        status: practice.status,
        openedAt: practice.opened_at,
        documents: linked.slice(0, 20).map(({ score: _score, ...document }) => document),
      })),
      documents: rankedDocuments.map(({ score: _score, ...document }) => document),
      filesRead: selectedFiles.map(({ info }) => ({
        documentId: info.documentId,
        practiceId: info.practiceId,
        kind: info.kind,
        title: info.title,
        fileName: info.fileName,
      })),
    };

    const instructions =
      language === "it"
        ? `Sei DocuMio Assistant, un assistente amministrativo personale.\nRispondi usando esclusivamente l'archivio strutturato e il contenuto dei file allegati a questa richiesta.\n\nRegole:\n- Cerca nelle pratiche, nei documenti, negli allegati e nel testo reale dei file forniti.\n- I file forniti sono una selezione privata dei risultati più pertinenti dell'utente autenticato.\n- Se trovi una parola, un nome, un codice o una frase dentro un file, indica il titolo del documento o allegato in cui compare.\n- Se l'utente chiede una pratica, indica nome esatto, stato e documenti collegati rilevanti.\n- Non inventare informazioni e segnala chiaramente ciò che non è disponibile.\n- Sii breve, concreto e prudente.\n- Restituisci solo ID realmente utili.\n- Non dare consulenza legale, medica o finanziaria definitiva.\n\nDomanda:\n${question}\n\nArchivio:\n${JSON.stringify(archive)}`
        : `You are DocuMio Assistant, a personal administrative assistant.\nAnswer only from the structured archive and the actual contents of files attached to this request.\n\nRules:\n- Search cases, documents, attachments, and the actual text inside supplied files.\n- Supplied files are a private selection of the authenticated user's most relevant results.\n- When a word, name, code, or phrase is found inside a file, name that document or attachment.\n- For case questions, state the exact case title, status, and relevant linked documents.\n- Never invent missing information.\n- Be brief, concrete, and careful.\n- Return only genuinely useful IDs.\n- Do not provide definitive legal, medical, or financial advice.\n\nQuestion:\n${question}\n\nArchive:\n${JSON.stringify(archive)}`;

    const content: Array<Record<string, unknown>> = [
      { type: "input_text", text: instructions },
      ...selectedFiles.map(({ info, dataUrl, mime }) =>
        mime.startsWith("image/")
          ? { type: "input_image", image_url: dataUrl }
          : {
              type: "input_file",
              filename: safeFileName(info.fileName),
              file_data: dataUrl,
            },
      ),
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "documio_assistant_fulltext_answer",
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
      console.error("Assistant OpenAI error", result.error?.message);
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
              ? "La risposta non era leggibile."
              : "The response could not be read.",
        },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(outputText) as {
      answer?: string;
      documentIds?: string[];
      practiceIds?: string[];
    };
    const validDocumentIds = new Set(documents.map((item) => item.id));
    const validPracticeIds = new Set(practices.map((item) => item.id));
    const practiceIds = (parsed.practiceIds ?? [])
      .filter((id) => validPracticeIds.has(id))
      .slice(0, 10);
    const linkedIds = structuredDocuments
      .filter((document) => practiceIds.includes(document.practiceId ?? ""))
      .map((document) => document.id);
    const documentIds = Array.from(
      new Set([
        ...(parsed.documentIds ?? []).filter((id) => validDocumentIds.has(id)),
        ...linkedIds,
      ]),
    ).slice(0, 10);

    return NextResponse.json({
      answer: parsed.answer || "",
      documentIds,
      practiceIds,
      filesInspected: selectedFiles.length,
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
