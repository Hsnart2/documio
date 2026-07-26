import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { POST as runAssistant } from "../assistant/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const FOLLOWUP_COOKIE = "documio-insurance-followup";
const MAX_INSURANCE_FILES = 4;

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
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() ?? null
  );
}

function isInsuranceDocument(document: InsuranceDocument) {
  const category = normalize(document.category);
  const identityText = normalize(
    [document.title, document.fileName, document.category].join(" "),
  );
  const supportingText = normalize(
    [document.summary, document.keywords.join(" ")].join(" "),
  );

  const clearlyUnrelated = [
    "importazione",
    "documenti vendita",
    "vendita e targhe",
    "immatricolazione",
    "fattura",
    "bolletta",
    "tari",
  ].some((term) => identityText.includes(term));

  if (clearlyUnrelated && !category.includes("assicur")) return false;

  const strongIdentity = [
    "assicurazione",
    "polizza",
    "rca",
    "responsabilita civile auto",
    "certificato assicurazione",
    "attestato di rischio",
    "copertura assicurativa",
  ].some((term) => identityText.includes(term));

  const structuredInsuranceEvidence = [
    "numero polizza",
    "contraente",
    "compagnia assicurativa",
    "premio assicurativo",
    "periodo assicurato",
    "decorrenza copertura",
  ].some((term) => supportingText.includes(term));

  return (
    category.includes("assicur") ||
    strongIdentity ||
    structuredInsuranceEvidence
  );
}

function selectorTerms(question: string) {
  const ignored = new Set([
    "quando",
    "scade",
    "scadono",
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
    "tutte",
    "tutti",
    "archivio",
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

function clearFollowupCookie(response: NextResponse) {
  response.cookies.set(FOLLOWUP_COOKIE, "", cookieOptions(0));
  return response;
}

async function forwardToArchiveAssistant(
  request: Request,
  body: { question?: unknown; language?: unknown } | null,
  question: string,
  language: "it" | "en",
) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      question,
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

async function buildInsuranceOverview(
  request: Request,
  body: { question?: unknown; language?: unknown } | null,
  documents: InsuranceDocument[],
  language: "it" | "en",
) {
  const candidates = documents.slice(0, MAX_INSURANCE_FILES);
  const candidateList = candidates
    .map(
      (document, index) =>
        `${index + 1}. ${document.title}${
          document.expiryDate
            ? ` (data registrata nell’archivio: ${document.expiryDate})`
            : ""
        }`,
    )
    .join("\n");

  const analysisQuestion =
    language === "it"
      ? `Analizza tutte le assicurazioni presenti nel mio archivio.

DOCUMENTI CANDIDATI DA APRIRE E VERIFICARE:
${candidateList}

ISTRUZIONI OBBLIGATORIE:
- apri e leggi il file reale di ogni candidato, non fermarti al titolo o al riepilogo;
- verifica che sia davvero una polizza, un certificato o una quietanza assicurativa; se non lo è, escludilo completamente dalla risposta;
- per ogni vera assicurazione identifica con precisione che cosa copre: veicolo con marca, modello e targa quando presenti; casa o immobile con indirizzo quando presente; persona, viaggio o altro bene assicurato;
- indica la compagnia assicurativa quando presente;
- trova la data reale di fine copertura o scadenza; non confonderla con la data di pagamento, emissione, quietanza o caricamento;
- rispondi iniziando esattamente con “Ho trovato queste assicurazioni nel tuo archivio:”;
- poi usa una riga per ogni assicurazione nel formato “• [nome riconoscibile]: assicurazione di [cosa copre] — compagnia [nome] — scade il [data]”;
- se la compagnia non è indicata, ometti quel pezzo;
- se la scadenza non è scritta nel documento, scrivi “scadenza non indicata nel documento”;
- non chiedere quale assicurazione voglio controllare;
- non limitarti a ripetere i titoli e non includere documenti non assicurativi.`
      : `Analyze every real insurance document in my archive.

CANDIDATES TO OPEN AND VERIFY:
${candidateList}

For every genuine insurance document, identify exactly what it covers, the insurer, and the real coverage expiry date. Exclude non-insurance documents. Start with “I found these insurance policies in your archive:” and give one complete line for each policy. Do not ask me to choose one.`;

  return forwardToArchiveAssistant(
    request,
    body,
    analysisQuestion,
    language,
  );
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
            ? "Non trovo ancora vere polizze o certificati assicurativi nel tuo archivio. Carica il documento assicurativo e poi potrò dirti cosa copre e quando scade."
            : "I cannot find genuine insurance policies or certificates in your archive yet.",
        documentIds: [],
        practiceIds: [],
        filesInspected: 0,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
    return clearFollowupCookie(response);
  }

  const terms = selectorTerms(question);

  if (terms.length === 0) {
    return buildInsuranceOverview(
      request,
      body,
      insuranceDocuments,
      language,
    );
  }

  let selected: InsuranceDocument | null = null;

  if (insuranceDocuments.length === 1) {
    selected = insuranceDocuments[0];
  } else {
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
    return buildInsuranceOverview(
      request,
      body,
      insuranceDocuments,
      language,
    );
  }

  const enrichedQuestion =
    language === "it"
      ? `${question}

ISTRUZIONE OBBLIGATORIA: usa esclusivamente il documento assicurativo intitolato “${selected.title}”. Apri e leggi il file reale. Verifica prima che sia davvero assicurativo. Identifica con precisione che cosa copre, includendo veicolo, marca, modello e targa oppure immobile e indirizzo quando presenti; indica la compagnia; trova la data reale di fine copertura. Non confondere pagamento, emissione o quietanza con la scadenza. Rispondi in una frase completa nel formato: “${selected.title}: assicurazione di ... — compagnia ... — scade il ...”. Se la scadenza non compare davvero, dichiaralo chiaramente.`
      : `${question}

MANDATORY INSTRUCTION: use only the insurance document titled “${selected.title}”. Open the actual file, identify exactly what it covers, the insurer and the real coverage expiry date. Do not confuse payment or issue dates with policy expiry.`;

  return forwardToArchiveAssistant(
    request,
    body,
    enrichedQuestion,
    language,
  );
}
