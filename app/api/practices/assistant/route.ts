import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PracticeRow = {
  id: string;
  title: string;
  practice_type: string | null;
  description: string | null;
  status: string | null;
  opened_at: string | null;
  closed_at: string | null;
};

type DocumentRow = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  keywords: string[] | null;
  uploaded_at: string;
  expiry_date: string | null;
  payment_status: string | null;
  paid_amount: number | null;
  total_amount: number | null;
  remaining_amount: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  financing_total_amount: number | null;
  first_installment_date: string | null;
  paid_installments: number | null;
  is_financing: boolean | null;
};

type AttachmentRow = {
  id: string;
  document_id: string;
  title: string;
  attachment_type: string;
  uploaded_at: string;
  payment_date: string | null;
  amount: number | null;
  notes: string | null;
};

type DerivedDocument = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  uploadedAt: string;
  expiryDate: string | null;
  paymentStatus: string | null;
  totalAmount: number | null;
  paidAmount: number;
  remainingAmount: number | null;
  nextInstallmentDate: string | null;
  attachments: Array<{
    title: string;
    type: string;
    paymentDate: string | null;
    amount: number | null;
    notes: string | null;
  }>;
};

function bearerToken(request: NextRequest) {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() ?? null
  );
}

function addMonths(date: string, months: number) {
  const source = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(source.getTime())) return null;
  const originalDay = source.getUTCDate();
  const target = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, 12),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return target.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function directFallback(
  practice: PracticeRow,
  documents: DerivedDocument[],
  question: string,
  missingReceipts: DerivedDocument[],
) {
  const paid = documents.reduce((sum, item) => sum + item.paidAmount, 0);
  const remaining = documents.reduce(
    (sum, item) => sum + (item.remainingAmount ?? 0),
    0,
  );
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = documents
    .flatMap((item) => [item.nextInstallmentDate, item.expiryDate])
    .filter((date): date is string => Boolean(date && date >= today))
    .sort();
  const normalized = question.toLowerCase();

  if (normalized.includes("quanto") || normalized.includes("pagat")) {
    return `Nella pratica “${practice.title}” risultano pagamenti registrati per ${money(paid)} e un residuo calcolabile di ${money(remaining)}. Il calcolo usa soltanto i documenti e le ricevute collegati a questa pratica.`;
  }
  if (normalized.includes("manca") || normalized.includes("complet")) {
    if (!documents.length) {
      return `La pratica “${practice.title}” è ancora vuota: non risultano documenti collegati.`;
    }
    if (missingReceipts.length) {
      return `La pratica contiene ${documents.length} documenti. Mancano ricevute o quietanze per: ${missingReceipts.map((item) => item.title).join(", ")}.`;
    }
    return `La pratica contiene ${documents.length} documenti e non emergono ricevute mancanti evidenti. La completezza definitiva dipende dai documenti richiesti per questa specifica pratica.`;
  }
  if (normalized.includes("scad")) {
    return deadlines.length
      ? `La prima scadenza futura della pratica “${practice.title}” risulta il ${new Date(`${deadlines[0]}T12:00:00`).toLocaleDateString("it-IT")}.`
      : `Non risultano scadenze future certe nei documenti collegati alla pratica “${practice.title}”.`;
  }
  return `Pratica “${practice.title}” — stato: ${practice.status ?? "non indicato"}. Contiene ${documents.length} documenti. Pagamenti registrati: ${money(paid)}. Residuo calcolabile: ${money(remaining)}.${deadlines.length ? ` Prima scadenza futura: ${new Date(`${deadlines[0]}T12:00:00`).toLocaleDateString("it-IT")}.` : ""}`;
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);
    const body = (await request.json().catch(() => null)) as {
      practiceId?: string;
      question?: string;
      language?: "it" | "en";
    } | null;
    const practiceId = String(body?.practiceId ?? "").trim();
    const question = String(body?.question ?? "Fammi un riepilogo della pratica.").trim();
    const language = body?.language === "en" ? "en" : "it";

    if (!token || !practiceId) {
      return NextResponse.json(
        { error: language === "it" ? "Sessione o pratica mancante." : "Missing session or case." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: practiceData, error: practiceError } = await admin
      .from("practices")
      .select("id,title,practice_type,description,status,opened_at,closed_at")
      .eq("id", practiceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (practiceError || !practiceData) {
      return NextResponse.json(
        { error: language === "it" ? "Pratica non trovata." : "Case not found." },
        { status: 404 },
      );
    }
    const practice = practiceData as PracticeRow;

    const { data: documentData, error: documentError } = await admin
      .from("documents")
      .select(
        "id,title,category,summary,keywords,uploaded_at,expiry_date,payment_status,paid_amount,total_amount,remaining_amount,installment_count,installment_amount,financing_total_amount,first_installment_date,paid_installments,is_financing",
      )
      .eq("user_id", user.id)
      .eq("practice_id", practiceId)
      .order("uploaded_at", { ascending: false })
      .limit(250);
    if (documentError) {
      return NextResponse.json({ error: documentError.message }, { status: 500 });
    }
    const rawDocuments = (documentData ?? []) as DocumentRow[];

    const { data: attachmentData, error: attachmentError } = rawDocuments.length
      ? await admin
          .from("document_attachments")
          .select("id,document_id,title,attachment_type,uploaded_at,payment_date,amount,notes")
          .eq("user_id", user.id)
          .in(
            "document_id",
            rawDocuments.map((item) => item.id),
          )
          .order("uploaded_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };
    if (attachmentError) {
      return NextResponse.json({ error: attachmentError.message }, { status: 500 });
    }
    const rawAttachments = (attachmentData ?? []) as AttachmentRow[];
    const attachmentsByDocument = new Map<string, AttachmentRow[]>();
    for (const attachment of rawAttachments) {
      attachmentsByDocument.set(attachment.document_id, [
        ...(attachmentsByDocument.get(attachment.document_id) ?? []),
        attachment,
      ]);
    }

    const documents: DerivedDocument[] = rawDocuments.map((document) => {
      const linked = attachmentsByDocument.get(document.id) ?? [];
      const paymentAttachments = linked.filter((item) =>
        ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachment_type),
      );
      const attachmentPaid = paymentAttachments.reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0,
      );
      const paidAmount = Math.max(Number(document.paid_amount) || 0, attachmentPaid);
      const installmentTotal =
        document.installment_count && document.installment_amount
          ? Number(document.installment_count) * Number(document.installment_amount)
          : null;
      const totalAmount =
        Number(document.financing_total_amount) > 0
          ? Number(document.financing_total_amount)
          : installmentTotal && installmentTotal > 0
            ? installmentTotal
            : Number(document.total_amount) > 0
              ? Number(document.total_amount)
              : null;
      const remainingAmount =
        totalAmount != null
          ? Math.max(0, totalAmount - paidAmount)
          : document.remaining_amount != null
            ? Math.max(0, Number(document.remaining_amount))
            : null;
      const paidInstallments = Math.max(
        Number(document.paid_installments) || 0,
        paymentAttachments.filter((item) => Number(item.amount) > 0).length,
      );
      const nextInstallmentDate =
        document.first_installment_date &&
        document.installment_count &&
        paidInstallments < document.installment_count
          ? addMonths(document.first_installment_date, paidInstallments)
          : null;

      return {
        id: document.id,
        title: document.title,
        category: document.category,
        summary: document.summary,
        uploadedAt: document.uploaded_at,
        expiryDate: document.expiry_date,
        paymentStatus: document.payment_status,
        totalAmount,
        paidAmount,
        remainingAmount,
        nextInstallmentDate,
        attachments: linked.map((item) => ({
          title: item.title,
          type: item.attachment_type,
          paymentDate: item.payment_date,
          amount: item.amount,
          notes: item.notes,
        })),
      };
    });

    const missingReceipts = documents.filter((document) => {
      const hasPaymentProof = document.attachments.some((item) =>
        ["Ricevuta", "Quietanza", "Pagamento"].includes(item.type),
      );
      return (
        !hasPaymentProof &&
        (document.paymentStatus === "Pagato" || document.paidAmount > 0)
      );
    });
    const paidTotal = documents.reduce((sum, item) => sum + item.paidAmount, 0);
    const remainingTotal = documents.reduce(
      (sum, item) => sum + (item.remainingAmount ?? 0),
      0,
    );
    const today = new Date().toISOString().slice(0, 10);
    const deadlines = documents
      .flatMap((item) =>
        [
          item.expiryDate
            ? { documentId: item.id, title: item.title, date: item.expiryDate, type: "scadenza" }
            : null,
          item.nextInstallmentDate
            ? { documentId: item.id, title: item.title, date: item.nextInstallmentDate, type: "rata" }
            : null,
        ].filter(Boolean),
      )
      .filter(
        (item): item is { documentId: string; title: string; date: string; type: string } =>
          Boolean(item),
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const metrics = {
      documents: documents.length,
      attachments: rawAttachments.length,
      paidTotal,
      remainingTotal,
      overdue: deadlines.filter((item) => item.date < today).length,
      upcoming30Days: deadlines.filter((item) => {
        const days = Math.ceil(
          (Date.parse(`${item.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
            86_400_000,
        );
        return days >= 0 && days <= 30;
      }).length,
      missingReceipts: missingReceipts.length,
    };

    const archive = {
      practice,
      metrics,
      documents,
      deadlines,
      missingReceipts: missingReceipts.map((item) => ({ id: item.id, title: item.title })),
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        answer: directFallback(practice, documents, question, missingReceipts),
        metrics,
        documentIds: documents.slice(0, 6).map((item) => item.id),
      });
    }

    const instructions =
      language === "it"
        ? `Sei l'assistente dedicato a UNA SOLA pratica di DocuMio.
Rispondi soltanto usando i dati della pratica fornita. Non usare, citare o immaginare dati di altre pratiche o dell'archivio generale.
Regole obbligatorie:
- massimo 170 parole;
- italiano semplice e concreto;
- distingui documenti informativi da pagamenti e vere scadenze;
- una ricevuta è mancante solo quando i dati forniti la indicano;
- non dichiarare una pratica legalmente o amministrativamente completa: indica solo se emergono anomalie evidenti;
- non mostrare UUID o dati tecnici;
- restituisci soltanto gli ID dei documenti realmente citati.

Domanda: ${question}

Pratica isolata: ${JSON.stringify(archive)}`
        : `You are the assistant for ONE DocuMio case only.
Answer only from the supplied case. Never use or infer information from another case or the general archive.
Maximum 170 words. Do not show technical IDs. Return only IDs for documents actually mentioned.

Question: ${question}

Isolated case: ${JSON.stringify(archive)}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        input: instructions,
        text: {
          format: {
            type: "json_schema",
            name: "documio_practice_answer",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                documentIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 8,
                },
              },
              required: ["answer", "documentIds"],
            },
          },
        },
      }),
    });
    const result = (await response.json()) as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      error?: { message?: string };
    };
    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;
    if (!response.ok || !outputText) {
      return NextResponse.json({
        answer: directFallback(practice, documents, question, missingReceipts),
        metrics,
        documentIds: documents.slice(0, 6).map((item) => item.id),
        warning: result.error?.message ?? "Risposta IA non disponibile.",
      });
    }

    const parsed = JSON.parse(outputText) as { answer?: string; documentIds?: string[] };
    const allowedIds = new Set(documents.map((item) => item.id));
    return NextResponse.json({
      answer: parsed.answer || directFallback(practice, documents, question, missingReceipts),
      metrics,
      documentIds: (parsed.documentIds ?? []).filter((id) => allowedIds.has(id)),
    });
  } catch (error) {
    console.error("Practice assistant error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto dell'assistente pratica.",
      },
      { status: 500 },
    );
  }
}
