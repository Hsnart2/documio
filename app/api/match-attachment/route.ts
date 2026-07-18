import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_RESULTS = 15;
const MAX_POOL_SIZE = 40;

type MatchAttachmentRequest = {
  title?: unknown;
  summary?: unknown;
  notes?: unknown;
  category?: unknown;
  keywords?: unknown;
  amount?: unknown;
  paymentDate?: unknown;
  documentTotalAmount?: unknown;
  limit?: unknown;
};

type DocumentRow = {
  id: string;
  title: string | null;
  category: string | null;
  file_name: string | null;
  uploaded_at: string | null;
  expiry_date: string | null;
  summary: string | null;
  keywords: string[] | null;
  payment_status: string | null;
  total_amount: number | string | null;
  remaining_amount: number | string | null;
  installment_count: number | null;
};

type Candidate = {
  id: string;
  title: string;
  category: string | null;
  fileName: string | null;
  summary: string | null;
  keywords: string[];
  expiryDate: string | null;
  paymentStatus: string | null;
  totalAmount: number | null;
  remainingAmount: number | null;
  installmentCount: number | null;
  score: number;
  reasons: string[];
};

function getEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase non configurato: controlla NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, key };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function createAuthenticatedClient(token: string) {
  const { url, key } = getEnvironment();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const normalized =
    typeof value === "string" ? value.replace(",", ".").trim() : value;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string") return null;

  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function cleanKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractUsefulTokens(values: string[]) {
  const ignored = new Set([
    "della",
    "delle",
    "degli",
    "dello",
    "alla",
    "alle",
    "agli",
    "allo",
    "con",
    "per",
    "tra",
    "fra",
    "del",
    "dei",
    "dal",
    "dai",
    "una",
    "uno",
    "the",
    "and",
    "payment",
    "pagamento",
    "ricevuta",
    "quietanza",
    "documento",
  ]);

  return Array.from(
    new Set(
      normalize(values.join(" "))
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !ignored.has(token)),
    ),
  ).slice(0, 10);
}

function escapePostgrestLike(value: string) {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function toFiniteNumber(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysBetween(first: string, second: string) {
  const a = new Date(`${first}T00:00:00Z`).getTime();
  const b = new Date(`${second}T00:00:00Z`).getTime();

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) / 86_400_000;
}

function addRows(target: Map<string, DocumentRow>, rows: DocumentRow[] | null) {
  for (const row of rows ?? []) {
    target.set(row.id, row);
  }
}

async function loadCandidatePool(
  supabase: SupabaseClient,
  userId: string,
  input: {
    amount: number | null;
    documentTotalAmount: number | null;
    category: string;
    tokens: string[];
  },
) {
  const selectFields = [
    "id",
    "title",
    "category",
    "file_name",
    "uploaded_at",
    "expiry_date",
    "summary",
    "keywords",
    "payment_status",
    "total_amount",
    "remaining_amount",
    "installment_count",
  ].join(",");

  const pool = new Map<string, DocumentRow>();

  const baseQuery = () =>
    supabase
      .from("documents")
      .select(selectFields)
      .eq("user_id", userId)
      .neq("payment_status", "Pagato");

  const queries: Array<PromiseLike<{ data: unknown; error: { message: string } | null }>> = [];

  const referenceAmount = input.documentTotalAmount ?? input.amount;

  if (referenceAmount !== null && referenceAmount > 0) {
    const tolerance = Math.max(1, referenceAmount * 0.03);

    queries.push(
      baseQuery()
        .gte("total_amount", referenceAmount - tolerance)
        .lte("total_amount", referenceAmount + tolerance)
        .limit(MAX_POOL_SIZE),
    );

    queries.push(
      baseQuery()
        .gte("remaining_amount", Math.max(0, referenceAmount - tolerance))
        .lte("remaining_amount", referenceAmount + tolerance)
        .limit(MAX_POOL_SIZE),
    );
  }

  if (input.category) {
    queries.push(
      baseQuery()
        .eq("category", input.category)
        .order("uploaded_at", { ascending: false })
        .limit(MAX_POOL_SIZE),
    );
  }

  const searchTokens = input.tokens
    .map(escapePostgrestLike)
    .filter(Boolean)
    .slice(0, 4);

  if (searchTokens.length > 0) {
    const orFilter = searchTokens
      .flatMap((token) => [
        `title.ilike.%${token}%`,
        `summary.ilike.%${token}%`,
        `file_name.ilike.%${token}%`,
      ])
      .join(",");

    queries.push(
      baseQuery()
        .or(orFilter)
        .order("uploaded_at", { ascending: false })
        .limit(MAX_POOL_SIZE),
    );
  }

  // Rete di sicurezza: prende solo un piccolo gruppo recente, mai l'intero archivio.
  queries.push(
    baseQuery()
      .order("uploaded_at", { ascending: false })
      .limit(MAX_POOL_SIZE),
  );

  const results = await Promise.all(queries);

  for (const result of results) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    addRows(pool, result.data as DocumentRow[] | null);
  }

  return Array.from(pool.values());
}

function scoreDocument(
  document: DocumentRow,
  input: {
    amount: number | null;
    documentTotalAmount: number | null;
    paymentDate: string | null;
    category: string;
    tokens: string[];
  },
): Candidate {
  let score = 0;
  const reasons: string[] = [];

  const totalAmount = toFiniteNumber(document.total_amount);
  const remainingAmount = toFiniteNumber(document.remaining_amount);
  const expectedAmount = input.documentTotalAmount ?? input.amount;

  if (expectedAmount !== null && expectedAmount > 0) {
    const candidates = [
      { label: "importo totale", value: totalAmount },
      { label: "residuo", value: remainingAmount },
    ].filter(
      (item): item is { label: string; value: number } => item.value !== null,
    );

    let bestDifference = Number.POSITIVE_INFINITY;
    let bestLabel = "";

    for (const candidate of candidates) {
      const difference = Math.abs(candidate.value - expectedAmount);
      if (difference < bestDifference) {
        bestDifference = difference;
        bestLabel = candidate.label;
      }
    }

    if (Number.isFinite(bestDifference)) {
      const relativeDifference = bestDifference / Math.max(expectedAmount, 1);

      if (relativeDifference <= 0.005) {
        score += 45;
        reasons.push(`${bestLabel} coincidente`);
      } else if (relativeDifference <= 0.03) {
        score += 35;
        reasons.push(`${bestLabel} molto vicino`);
      } else if (relativeDifference <= 0.1) {
        score += 18;
        reasons.push(`${bestLabel} compatibile`);
      }
    }

    if (
      input.amount !== null &&
      totalAmount !== null &&
      document.installment_count &&
      document.installment_count > 1
    ) {
      const estimatedInstallment = totalAmount / document.installment_count;
      const installmentDifference =
        Math.abs(estimatedInstallment - input.amount) /
        Math.max(input.amount, 1);

      if (installmentDifference <= 0.05) {
        score += 20;
        reasons.push("importo compatibile con una rata");
      }
    }
  }

  if (
    input.category &&
    normalize(document.category) === normalize(input.category)
  ) {
    score += 12;
    reasons.push("categoria coincidente");
  }

  const documentText = normalize(
    [
      document.title,
      document.file_name,
      document.summary,
      ...(document.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  const matchingTokens = input.tokens.filter((token) =>
    documentText.includes(normalize(token)),
  );

  if (matchingTokens.length > 0) {
    score += Math.min(30, matchingTokens.length * 7);
    reasons.push(
      `riferimenti comuni: ${matchingTokens.slice(0, 4).join(", ")}`,
    );
  }

  if (input.paymentDate) {
    const relevantDate = document.expiry_date ?? document.uploaded_at?.slice(0, 10);

    if (relevantDate) {
      const difference = daysBetween(input.paymentDate, relevantDate);

      if (difference !== null && difference <= 31) {
        score += 8;
        reasons.push("date vicine");
      } else if (difference !== null && difference <= 120) {
        score += 3;
        reasons.push("periodo compatibile");
      }
    }

    const paymentYear = input.paymentDate.slice(0, 4);
    if (documentText.includes(paymentYear)) {
      score += 5;
      reasons.push("anno coincidente");
    }
  }

  if (document.payment_status === "Non pagato") {
    score += 4;
  } else if (document.payment_status === "Parzialmente pagato") {
    score += 3;
  }

  return {
    id: document.id,
    title: document.title ?? "Documento senza titolo",
    category: document.category,
    fileName: document.file_name,
    summary: document.summary,
    keywords: document.keywords ?? [],
    expiryDate: document.expiry_date,
    paymentStatus: document.payment_status,
    totalAmount,
    remainingAmount,
    installmentCount: document.installment_count,
    score,
    reasons: reasons.slice(0, 5),
  };
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json(
        { error: "Sessione mancante o non valida." },
        { status: 401 },
      );
    }

    const supabase = createAuthenticatedClient(token);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sessione scaduta o non valida." },
        { status: 401 },
      );
    }

    let body: MatchAttachmentRequest;

    try {
      body = (await request.json()) as MatchAttachmentRequest;
    } catch {
      return NextResponse.json(
        { error: "Corpo della richiesta JSON non valido." },
        { status: 400 },
      );
    }

    const title = cleanText(body.title, 250);
    const summary = cleanText(body.summary, 1_000);
    const notes = cleanText(body.notes, 1_000);
    const category = cleanText(body.category, 100);
    const keywords = cleanKeywords(body.keywords);
    const amount = cleanNumber(body.amount);
    const documentTotalAmount = cleanNumber(body.documentTotalAmount);
    const paymentDate = cleanDate(body.paymentDate);
    const requestedLimit = Math.floor(cleanNumber(body.limit) ?? MAX_RESULTS);
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_RESULTS);

    const tokens = extractUsefulTokens([
      title,
      summary,
      notes,
      category,
      ...keywords,
    ]);

    if (
      amount === null &&
      documentTotalAmount === null &&
      tokens.length === 0 &&
      !category
    ) {
      return NextResponse.json(
        {
          error:
            "Dati insufficienti per cercare il documento collegato.",
        },
        { status: 400 },
      );
    }

    const pool = await loadCandidatePool(supabase, user.id, {
      amount,
      documentTotalAmount,
      category,
      tokens,
    });

    const candidates = pool
      .map((document) =>
        scoreDocument(document, {
          amount,
          documentTotalAmount,
          paymentDate,
          category,
          tokens,
        }),
      )
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({
      candidates,
      candidateCount: candidates.length,
      inspectedCount: pool.length,
      automaticLinkAllowed: false,
    });
  } catch (error) {
    console.error("match-attachment error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore durante la ricerca dei documenti candidati.",
      },
      { status: 500 },
    );
  }
}
