import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { POST as legacyAssistantPost } from "../assistant/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_ATTACHMENT_TYPES = new Set(["Ricevuta", "Quietanza", "Pagamento"]);

type DocumentRow = {
  id: string;
  title: string | null;
  expiry_date: string | null;
  payment_status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  financing_total_amount: number | null;
  first_installment_date: string | null;
  is_financing: boolean | null;
  paid_installments: number | null;
};

type AttachmentRow = {
  document_id: string;
  attachment_type: string | null;
  amount: number | null;
  payment_date: string | null;
  uploaded_at: string | null;
};

type PaymentState = {
  id: string;
  title: string;
  total: number | null;
  paid: number;
  remaining: number | null;
  settled: boolean;
  disputed: boolean;
  receiptCount: number;
  lastReceiptDate: string | null;
  dueDate: Date | null;
  originalExpiry: Date | null;
};

function getBearerToken(request: Request) {
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

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonthsPreservingDay(value: string | null, months: number) {
  const first = parseDate(value);
  if (!first) return null;
  const originalDay = first.getDate();
  const target = new Date(first.getFullYear(), first.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return target;
}

function euro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateLabel(date: Date) {
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function titleMatchScore(question: string, title: string) {
  const titleTerms = normalize(title)
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !/^202\d$/.test(term));
  return titleTerms.reduce(
    (score, term) => score + (question.includes(term) ? 1 : 0),
    0,
  );
}

function computePaymentStates(
  documents: DocumentRow[],
  attachments: AttachmentRow[],
): PaymentState[] {
  const attachmentsByDocument = new Map<string, AttachmentRow[]>();
  for (const attachment of attachments) {
    const current = attachmentsByDocument.get(attachment.document_id) ?? [];
    current.push(attachment);
    attachmentsByDocument.set(attachment.document_id, current);
  }

  return documents.map((document) => {
    const linked = attachmentsByDocument.get(document.id) ?? [];
    const receipts = linked.filter((attachment) =>
      PAYMENT_ATTACHMENT_TYPES.has(attachment.attachment_type ?? ""),
    );
    const receiptPaid = receipts.reduce(
      (sum, attachment) => sum + Math.max(0, Number(attachment.amount) || 0),
      0,
    );
    const storedPaid = Math.max(0, Number(document.paid_amount) || 0);
    const paid = Math.max(storedPaid, receiptPaid);
    const installmentCount = Math.max(0, Number(document.installment_count) || 0);
    const installmentAmount = Math.max(0, Number(document.installment_amount) || 0);
    const financingTotal = Math.max(0, Number(document.financing_total_amount) || 0);
    const declaredTotal = Math.max(0, Number(document.total_amount) || 0);
    const total =
      financingTotal ||
      (installmentCount > 0 && installmentAmount > 0
        ? installmentCount * installmentAmount
        : declaredTotal) ||
      null;
    const storedRemaining = Number(document.remaining_amount);
    const remaining =
      total != null
        ? Math.max(0, total - paid)
        : Number.isFinite(storedRemaining)
          ? Math.max(0, storedRemaining)
          : null;
    const settled =
      document.payment_status === "Pagato" ||
      (total != null && paid + 0.01 >= total) ||
      (remaining != null && remaining <= 0.01 && paid > 0);
    const disputed = document.payment_status === "Contestato";
    const paidInstallments = Math.max(
      0,
      Number(document.paid_installments) || 0,
      receipts.filter((receipt) => (Number(receipt.amount) || 0) > 0).length,
    );
    const nextInstallment =
      !settled && installmentCount > paidInstallments
        ? addMonthsPreservingDay(document.first_installment_date, paidInstallments)
        : null;
    const originalExpiry = parseDate(document.expiry_date);
    const dueDate = settled || disputed
      ? null
      : [nextInstallment, originalExpiry]
          .filter((date): date is Date => Boolean(date))
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const lastReceipt = [...receipts].sort((a, b) =>
      String(b.payment_date ?? b.uploaded_at ?? "").localeCompare(
        String(a.payment_date ?? a.uploaded_at ?? ""),
      ),
    )[0];

    return {
      id: document.id,
      title: document.title ?? "Documento",
      total,
      paid,
      remaining,
      settled,
      disputed,
      receiptCount: receipts.length,
      lastReceiptDate: lastReceipt?.payment_date ?? lastReceipt?.uploaded_at?.slice(0, 10) ?? null,
      dueDate,
      originalExpiry,
    };
  });
}

function buildLocalAnswer(question: string, states: PaymentState[]) {
  const normalizedQuestion = normalize(question);
  const asksWeek = normalizedQuestion.includes("questa settimana") || normalizedQuestion.includes("prossimi 7 giorni");
  const asksDeadlines =
    normalizedQuestion.includes("scad") ||
    normalizedQuestion.includes("prossimi 30 giorni") ||
    normalizedQuestion.includes("entro 30 giorni");
  const asksToDo = normalizedQuestion.includes("devo fare") || normalizedQuestion.includes("cosa fare");
  const asksPayments =
    normalizedQuestion.includes("quanto devo pagare") ||
    normalizedQuestion.includes("da pagare") ||
    normalizedQuestion.includes("debito") ||
    normalizedQuestion.includes("saldo dovuto");
  const asksMissingReceipts =
    (normalizedQuestion.includes("ricevut") || normalizedQuestion.includes("quietanz")) &&
    normalizedQuestion.includes("manc");
  const asksPaidStatus =
    normalizedQuestion.includes("pagat") ||
    normalizedQuestion.includes("saldat") ||
    normalizedQuestion.includes("ho pagato");

  const today = startOfToday();
  const horizonDays = asksWeek ? 7 : 30;
  const horizon = new Date(today.getTime() + horizonDays * DAY_MS);
  const openUpcoming = states
    .filter(
      (state) =>
        !state.settled &&
        !state.disputed &&
        state.dueDate &&
        state.dueDate >= today &&
        state.dueDate <= horizon,
    )
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const overdue = states
    .filter(
      (state) =>
        !state.settled &&
        !state.disputed &&
        state.dueDate &&
        state.dueDate < today,
    )
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const settledInWindow = states.filter(
    (state) =>
      state.settled &&
      state.originalExpiry &&
      state.originalExpiry >= today &&
      state.originalExpiry <= horizon,
  );
  const unpaid = states.filter(
    (state) =>
      !state.settled &&
      !state.disputed &&
      state.remaining != null &&
      state.remaining > 0.01,
  );
  const missingReceipts = states.filter(
    (state) => state.settled && state.receiptCount === 0,
  );

  if (asksPaidStatus) {
    const matched = states
      .map((state) => ({ state, score: titleMatchScore(normalizedQuestion, state.title) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.state;

    if (matched) {
      if (matched.settled) {
        const details = [
          matched.total != null ? `importo dovuto ${euro(matched.total)}` : null,
          matched.paid > 0 ? `pagamento registrato ${euro(matched.paid)}` : null,
          matched.lastReceiptDate
            ? `ricevuta del ${dateLabel(parseDate(matched.lastReceiptDate) ?? today)}`
            : null,
        ].filter(Boolean);
        return {
          answer: `${matched.title} risulta saldato per intero. ${details.join(" · ")}. Residuo: ${euro(0)}. Non devono essere considerate altre rate o scadenze aperte.`,
          documentIds: [matched.id],
        };
      }

      return {
        answer: `${matched.title} non risulta ancora saldato. Residuo registrato: ${euro(matched.remaining ?? 0)}${matched.dueDate ? ` · prossima scadenza ${dateLabel(matched.dueDate)}` : ""}.`,
        documentIds: [matched.id],
      };
    }
  }

  if (asksMissingReceipts) {
    if (!missingReceipts.length) {
      return {
        answer: "Non risultano pagamenti saldati senza ricevuta o quietanza collegata.",
        documentIds: [],
      };
    }
    return {
      answer: `Manca una ricevuta o quietanza per:\n${missingReceipts
        .slice(0, 8)
        .map((state) => `- ${state.title}`)
        .join("\n")}`,
      documentIds: missingReceipts.slice(0, 8).map((state) => state.id),
    };
  }

  if (asksPayments && !asksDeadlines && !asksToDo) {
    if (!unpaid.length) {
      return {
        answer: "Non risultano importi ancora da pagare nei documenti registrati.",
        documentIds: [],
      };
    }
    const total = unpaid.reduce((sum, state) => sum + (state.remaining ?? 0), 0);
    return {
      answer: `Risultano ${unpaid.length} pagamenti ancora aperti, per un residuo complessivo di ${euro(total)}:\n${unpaid
        .slice(0, 8)
        .map(
          (state) =>
            `- ${state.title}: ${euro(state.remaining ?? 0)}${state.dueDate ? ` · ${dateLabel(state.dueDate)}` : ""}`,
        )
        .join("\n")}`,
      documentIds: unpaid.slice(0, 8).map((state) => state.id),
    };
  }

  if (asksDeadlines || asksToDo || asksWeek) {
    const lines: string[] = [];
    if (overdue.length && asksToDo) {
      lines.push(
        ...overdue.slice(0, 5).map(
          (state) => `- SCADUTO: ${state.title} · ${dateLabel(state.dueDate!)} · residuo ${euro(state.remaining ?? 0)}`,
        ),
      );
    }
    lines.push(
      ...openUpcoming.slice(0, 8).map(
        (state) => `- ${state.title} · ${dateLabel(state.dueDate!)}${state.remaining != null ? ` · residuo ${euro(state.remaining)}` : ""}`,
      ),
    );

    const settledNote = settledInWindow.length
      ? `\n\nNon considero come scadenze aperte questi documenti perché risultano già saldati:\n${settledInWindow
          .slice(0, 5)
          .map(
            (state) =>
              `- ${state.title}: pagamento ${euro(state.paid)}${state.total != null ? ` su ${euro(state.total)}` : ""}, residuo ${euro(0)}`,
          )
          .join("\n")}`
      : "";

    if (!lines.length) {
      return {
        answer: `Non risultano scadenze o rate aperte ${asksWeek ? "nei prossimi 7 giorni" : "nei prossimi 30 giorni"}.${settledNote}`,
        documentIds: settledInWindow.slice(0, 5).map((state) => state.id),
      };
    }

    return {
      answer: `${asksToDo ? "Attività da gestire" : "Scadenze aperte"} ${asksWeek ? "nei prossimi 7 giorni" : "nei prossimi 30 giorni"}:\n${lines.join("\n")}${settledNote}`,
      documentIds: Array.from(
        new Set([
          ...overdue.slice(0, 5).map((state) => state.id),
          ...openUpcoming.slice(0, 8).map((state) => state.id),
          ...settledInWindow.slice(0, 5).map((state) => state.id),
        ]),
      ).slice(0, 10),
    };
  }

  return null;
}

export async function POST(request: Request) {
  const legacyRequest = request.clone();

  try {
    const body = (await request.json().catch(() => null)) as {
      question?: string;
      language?: "it" | "en";
    } | null;
    const question = String(body?.question ?? "").trim();
    const language = body?.language === "en" ? "en" : "it";

    if (!question || language !== "it") {
      return legacyAssistantPost(legacyRequest);
    }

    const token = getBearerToken(request);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

    if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
      return legacyAssistantPost(legacyRequest);
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return legacyAssistantPost(legacyRequest);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [documentResult, attachmentResult] = await Promise.all([
      admin
        .from("documents")
        .select(
          "id,title,expiry_date,payment_status,total_amount,paid_amount,remaining_amount,installment_count,installment_amount,financing_total_amount,first_installment_date,is_financing,paid_installments",
        )
        .eq("user_id", user.id)
        .limit(1000),
      admin
        .from("document_attachments")
        .select("document_id,attachment_type,amount,payment_date,uploaded_at")
        .eq("user_id", user.id)
        .limit(2500),
    ]);

    if (documentResult.error || attachmentResult.error) {
      return legacyAssistantPost(legacyRequest);
    }

    const states = computePaymentStates(
      (documentResult.data ?? []) as DocumentRow[],
      (attachmentResult.data ?? []) as AttachmentRow[],
    );
    const localAnswer = buildLocalAnswer(question, states);

    if (!localAnswer) {
      return legacyAssistantPost(legacyRequest);
    }

    return NextResponse.json({
      answer: localAnswer.answer,
      documentIds: localAnswer.documentIds,
      practiceIds: [],
      filesInspected: 0,
      mode: "authoritative-payment-state",
    });
  } catch (error) {
    console.error("Payment-aware assistant guard failed", error);
    return legacyAssistantPost(legacyRequest);
  }
}
