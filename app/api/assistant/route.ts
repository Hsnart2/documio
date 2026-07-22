import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 4;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

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

type ArchiveFile = {
  documentId: string;
  practiceId: string | null;
  title: string;
  fileName: string;
  storagePath: string | null;
  score: number;
};

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function getBearerToken(request: Request) {
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

function isSummaryRequest(question: string) {
  const normalized = normalize(question);
  return [
    "riepilogo",
    "riassunto pratica",
    "sintesi pratica",
    "stato pratica",
    "prepara pratica",
    "commercialista",
    "caf",
    "dossier",
  ].some((term) => normalized.includes(term));
}

function getTerms(question: string) {
  const ignored = new Set([
    "cerca", "cercami", "trova", "trovami", "fammi", "vedere", "aprimi",
    "apri", "pratica", "pratiche", "documento", "documenti", "allegato",
    "allegati", "riepilogo", "riassunto", "sintesi", "stato", "prepara",
    "commercialista", "caf", "dossier", "quella", "quello", "che", "della",
    "dello", "delle", "degli", "del", "di", "la", "il", "lo", "le", "i",
    "un", "una", "the", "find", "show", "open", "case", "document",
    "documents", "attachment", "attachments",
  ]);

  return normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !ignored.has(term));
}

function scoreText(text: string, terms: string[]) {
  const source = normalize(text);
  return terms.reduce((total, term) => {
    if (!source.includes(term)) return total;
    const exact = new RegExp(`(^|\\s)${term}(\\s|$)`).test(source);
    return total + (exact ? 4 : 2);
  }, 0);
}

function getMimeType(fileName: string, fallback?: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "file.pdf";
}

function isDecorativeDocument(title: string, fileName: string) {
  const value = normalize(`${title} ${fileName}`);
  return ["logo", "icona", "icon", "immagine grafica"].some((term) =>
    value.includes(term),
  );
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

    const token = getBearerToken(request);
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
    const attachmentsByDocument = new Map<string, AttachmentRow[]>();

    for (const attachment of attachments) {
      const list = attachmentsByDocument.get(attachment.document_id) ?? [];
      list.push(attachment);
      attachmentsByDocument.set(attachment.document_id, list);
    }

    const terms = getTerms(question);
    const summaryMode = isSummaryRequest(question);
    const archiveFiles: ArchiveFile[] = [];

    const structuredDocuments = documents.map((document) => {
      const practice = document.practice_id
        ? practiceMap.get(document.practice_id)
        : undefined;
      const linkedAttachments = attachmentsByDocument.get(document.id) ?? [];
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
      const documentScore = scoreText(documentText, terms);

      if (!isDecorativeDocument(document.title ?? "", document.file_name ?? "")) {
        archiveFiles.push({
          documentId: document.id,
          practiceId: document.practice_id,
          title: document.title ?? document.file_name ?? "Documento",
          fileName: document.file_name ?? "documento.pdf",
          storagePath: document.storage_path,
          score: documentScore + (document.storage_path ? 1 : 0),
        });
      }

      const structuredAttachments = linkedAttachments.map((attachment) => {
        const attachmentText = [
          attachment.title,
          attachment.attachment_type,
          attachment.file_name,
          attachment.notes,
          practice?.title,
          document.title,
        ].join(" ");
        if (
          !isDecorativeDocument(
            attachment.title ?? "",
            attachment.file_name ?? "",
          )
        ) {
          archiveFiles.push({
            documentId: document.id,
            practiceId: document.practice_id,
            title: attachment.title ?? attachment.file_name ?? "Allegato",
            fileName: attachment.file_name ?? "allegato.pdf",
            storagePath: attachment.storage_path,
            score: scoreText(attachmentText, terms) +
              (attachment.storage_path ? 1 : 0),
          });
        }
        return {
          title: attachment.title,
          type: attachment.attachment_type,
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

    const rankedPractices = practices
      .map((practice) => {
        const linked = structuredDocuments.filter(
          (document) => document.practiceId === practice.id,
        );
        const primaryScore = scoreText(
          [
            practice.title,
            practice.practice_type,
            practice.description,
            practice.status,
          ].join(" "),
          terms,
        );
        const linkedScore = Math.max(0, ...linked.map((item) => item.score));
        return {
          practice,
          linked,
          score: primaryScore * 3 + linkedScore,
        };
      })
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, summaryMode ? 5 : 20);

    const rankedDocuments = structuredDocuments
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, summaryMode ? 30 : 50);

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
      if (error || !data) continue;

      const bytes = Buffer.from(await data.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) continue;
      if (totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;

      const mime = getMimeType(candidate.fileName, data.type);
      if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
        continue;
      }

      selectedFiles.push({
        info: candidate,
        mime,
        dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
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
        documents: linked.slice(0, 30).map(({ score: _score, ...document }) =>
          document,
        ),
      })),
      documents: rankedDocuments.map(({ score: _score, ...document }) => document),
      filesRead: selectedFiles.map(({ info }) => ({
        documentId: info.documentId,
        practiceId: info.practiceId,
        title: info.title,
      })),
    };

    const summaryRules = summaryMode
      ? language === "it"
        ? `\nMODALITÀ RIEPILOGO PRATICA:\n- Scegli una sola pratica, quella più pertinente.\n- Usa questo ordine: Pratica; Stato; Documenti presenti; Pagamenti e importi; Scadenze; Allegati o prove mancanti; Controlli consigliati.\n- Elenca massimo 6 documenti importanti.\n- Calcola i totali solo quando i dati sono chiaramente disponibili.\n- Segnala come mancante una ricevuta o prova di pagamento solo per documenti che risultano pagati o che normalmente la richiedono.\n- Non dichiarare incompleto un documento puramente informativo, una visura, un certificato o una comunicazione solo perché non ha ricevute.\n- Evidenzia incongruenze tra importo totale, pagato e residuo.\n- Scrivi come un riepilogo professionale destinato a commercialista o CAF.\n- Massimo 180 parole.`
        : `\nCASE SUMMARY MODE:\n- Choose only the most relevant case.\n- Use this order: Case; Status; Available documents; Payments and amounts; Deadlines; Missing attachments or proofs; Recommended checks.\n- List at most 6 important documents.\n- Compute totals only when clearly supported.\n- Mark a receipt or payment proof as missing only when the document is paid or normally requires one.\n- Do not mark informational records, certificates, or notices incomplete merely because they lack receipts.\n- Highlight inconsistencies between total, paid, and remaining amounts.\n- Write for an accountant or tax assistance office.\n- Maximum 180 words.`
      : "";

    const instructions =
      language === "it"
        ? `Sei DocuMio Assistant, un assistente amministrativo personale.\nRispondi esclusivamente usando l'archivio e il contenuto reale dei file forniti.\n\nRegole:\n- Cerca in pratiche, documenti, allegati e testo interno dei file.\n- Non mostrare mai UUID, ID tecnici, percorsi Storage o nomi file casuali.\n- Cita solo titoli leggibili delle pratiche e dei documenti.\n- Non includere logo, icone o immagini decorative salvo richiesta esplicita.\n- Restituisci soltanto ID utili nei campi strutturati, mai nel testo.\n- Non inventare dati.\n- Sii concreto e leggibile.\n- Non dare consulenza legale, medica o finanziaria definitiva.${summaryRules}\n\nDomanda:\n${question}\n\nArchivio:\n${JSON.stringify(archive)}`
        : `You are DocuMio Assistant, a personal administrative assistant.\nAnswer only from the archive and actual supplied file contents.\n\nRules:\n- Search cases, documents, attachments, and text inside files.\n- Never display UUIDs, technical IDs, Storage paths, or random file names.\n- Mention only readable case and document titles.\n- Ignore logos, icons, and decorative images unless explicitly requested.\n- Return useful IDs only in structured fields, never in the answer text.\n- Never invent data.\n- Be concrete and readable.\n- Do not provide definitive legal, medical, or financial advice.${summaryRules}\n\nQuestion:\n${question}\n\nArchive:\n${JSON.stringify(archive)}`;

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
      .slice(0, summaryMode ? 1 : 3);
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
      mode: summaryMode ? "practice-summary" : "search",
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
