import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { POST as runAssistant } from "../assistant/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const FOLLOWUP_COOKIE = "documio-insurance-followup";

type InsuranceDocument = {
  id: string;
  title: string;
  fileName: string;
  category: string;
  summary: string;
  keywords: string[];
  expiryDate: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function hasPendingFollowup(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .some((part) => part.trim() === `${FOLLOWUP_COOKIE}=1`);
}

function isInsuranceDocument(document: InsuranceDocument) {
  const category = normalize(document.category);
  const text = normalize(
    [
      document.title,
      document.fileName,
      document.category,
      document.summary,
      document.keywords.join(" "),
    ].join(" "),
  );

  return (
    category.includes("assicur") ||
    [
      "assicurazione",
      "polizza",
      "rca",
      "responsabilita civile auto",
      "certificato assicurazione",
      "attestato di rischio",
      "copertura assicurativa",
    ].some((term) => text.includes(term))
  );
}

function selectorTerms(question: string) {
  const ignored = new Set([
    "quando",
    "scade",
    "scadenza",
    "data",
    "fino",
    "validita",
    "assicurazione",
    "assicurazioni",
    "polizza",
    "polizze",
    "rca",
    "quale",
    "quella",
    "quello",
    "della",
    "dello",
    "del",
    "dei",
    "degli",
    "di",
    "la",
    "il",
    "lo",
    "le",
    "un",
    "una",
    "mio",
    "mia",
    "per",
  ]);

  return normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !ignored.has(term));
}

function matchScore(document: InsuranceDocument, terms: string[]) {
  const title = normalize(document.title);
  const summary = normalize(document.summary);
  const keywords = normalize(document.keywords.join(" "));
  const fileName = normalize(document.fileName);

  return terms.reduce((score, term) => {
    if (title.includes(term)) score += 8;
    if (keywords.includes(term)) score += 5;
    if (summary.includes(term)) score += 3;
    if (fileName.includes(term)) score += 2;
    return score;
  }, 0);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function archiveListResponse(
  documents: InsuranceDocument[],
  language: "it" | "en",
  prefix?: string,
) {
  const titles = documents.slice(0, 10).map((document) => `- ${document.title}`);
  const answer =
    language === "it"
      ? `${prefix ? `${prefix}\n\n` : ""}Ho trovato queste assicurazioni nel tuo archivio:\n${titles.join("\n")}\n\nQuale vuoi controllare? Puoi scrivere il nome che vedi nell’elenco.`
      : `${prefix ? `${prefix}\n\n` : ""}I found these insurance documents in your archive:\n${titles.join("\n")}\n\nWhich one should I check? Type the name shown in the list.`;

  const response = NextResponse.json(
    {
      answer,
      documentIds: documents.slice(0, 10).map((document) => document.id),
      practiceIds: [],
      filesInspected: 0,
      mode: "insurance-clarification",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
  response.cookies.set(FOLLOWUP_COOKIE, "1", cookieOptions(10 * 60));
  return response;
}

function clearFollowupCookie(response: NextResponse) {
  response.cookies.set(FOLLOWUP_COOKIE, "", cookieOptions(0));
  return response;
}

export async function POST(request: Request) {
  const body = (await request.clone().json().catch(() => null)) as {
    question?: unknown;
    language?: unknown;
  } | null;
  const question = String(body?.question ?? "").trim();
  const language = body?.language === "en" ? "en" : "it";

  if (!question) {
    return NextResponse.json(
      { error: language === "it" ? "Domanda mancante." : "Missing question." },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const token = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          language === "it"
            ? "Configurazione o sessione non disponibile."
            : "Configuration or session unavailable.",
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
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
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("documents")
    .select("id,title,file_name,category,summary,keywords,expiry_date")
    .eq("user_id", user.id)
    .limit(1000);

  if (error) {
    console.error("Insurance archive lookup failed", error.message);
    return NextResponse.json(
      {
        error:
          language === "it"
            ? "Non riesco a leggere le assicurazioni nell’archivio."
            : "I cannot read insurance documents in the archive.",
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const insuranceDocuments = (data ?? [])
    .map<InsuranceDocument>((item) => ({
      id: String(item.id),
      title: String(item.title ?? item.file_name ?? "Documento assicurativo"),
      fileName: String(item.file_name ?? ""),
      category: String(item.category ?? ""),
      summary: String(item.summary ?? ""),
      keywords: Array.isArray(item.keywords)
        ? item.keywords.map((keyword) => String(keyword))
        : [],
      expiryDate: item.expiry_date ? String(item.expiry_date) : null,
    }))
    .filter(isInsuranceDocument)
    .sort((a, b) => a.title.localeCompare(b.title, "it"));

  if (!insuranceDocuments.length) {
    const response = NextResponse.json(
      {
        answer:
          language === "it"
            ? "Non trovo ancora documenti assicurativi nel tuo archivio. Carica la polizza o il certificato e poi potrò leggerne la scadenza."
            : "I cannot find insurance documents in your archive yet.",
        documentIds: [],
        practiceIds: [],
        filesInspected: 0,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
    return clearFollowupCookie(response);
  }

  const terms = selectorTerms(question);
  const pendingFollowup = hasPendingFollowup(request);
  let selected: InsuranceDocument | null = null;

  if (insuranceDocuments.length === 1) {
    selected = insuranceDocuments[0];
  } else if (terms.length > 0) {
    const ranked = insuranceDocuments
      .map((document) => ({ document, score: matchScore(document, terms) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];

    if (best && best.score > 0 && (!second || best.score > second.score)) {
      selected = best.document;
    }
  }

  if (!selected) {
    const prefix =
      pendingFollowup && terms.length > 0
        ? language === "it"
          ? `Non riesco a collegare “${question}” con sicurezza a una sola polizza.`
          : `I cannot safely match “${question}” to one policy.`
        : undefined;
    return archiveListResponse(insuranceDocuments, language, prefix);
  }

  const enrichedQuestion =
    language === "it"
      ? `${question}\n\nISTRUZIONE OBBLIGATORIA: usa esclusivamente il documento assicurativo intitolato “${selected.title}”. Ignora TARI, bollette, rate, quietanze non assicurative e tutti gli altri documenti. Leggi il file reale e trova la data di fine copertura indicata come scadenza, validità fino al, copertura fino al oppure periodo assicurato. Non confondere la data del pagamento o della quietanza con la scadenza della copertura. Rispondi nominando esattamente la polizza “${selected.title}”. Se la data non compare davvero nel documento, dichiaralo chiaramente.`
      : `${question}\n\nMANDATORY INSTRUCTION: use only the insurance document titled “${selected.title}”. Read the actual file and find the coverage end date. Do not confuse payment or receipt dates with policy expiry.`;

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      question: enrichedQuestion,
      language,
    }),
  });

  const response = await runAssistant(forwardedRequest);
  const payload = await response.clone().json().catch(() => null);
  if (!payload) return response;

  const finalResponse = NextResponse.json(payload, {
    status: response.status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
  return clearFollowupCookie(finalResponse);
}
