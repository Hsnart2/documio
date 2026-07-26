import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const FOLLOWUP_COOKIE = "documio-insurance-followup";
const MAX_FILES = 6;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

type InsuranceDocument = {
  id: string;
  title: string;
  fileName: string;
  storagePath: string | null;
  category: string;
  summary: string;
  keywords: string[];
  expiryDate: string | null;
};

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
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
  const identity = normalize(`${document.title} ${document.fileName}`);

  // La categoria o una citazione nel riepilogo non bastano: un contratto,
  // una fattura o una pratica auto possono parlare di assicurazione senza
  // essere una polizza. Il titolo o il nome file devono identificarla davvero.
  return [
    "assicurazione",
    "assicurativo",
    "polizza",
    "rca",
    "responsabilita civile auto",
    "attestato di rischio",
    "carta verde",
    "quietanza assicurativa",
    "certificato assicurazione",
  ].some((term) => identity.includes(term));
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
    "assicurativa",
    "assicurative",
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
    "mie",
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
  const fileName = normalize(document.fileName);
  const summary = normalize(document.summary);
  const keywords = normalize(document.keywords.join(" "));

  return terms.reduce((score, term) => {
    if (title.includes(term)) score += 10;
    if (fileName.includes(term)) score += 8;
    if (keywords.includes(term)) score += 3;
    if (summary.includes(term)) score += 1;
    return score;
  }, 0);
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "polizza.pdf";
}

function getMimeType(fileName: string, fallback?: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
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

export async function POST(request: Request) {
  try {
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
    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

    if (!token || !apiKey || !supabaseUrl || !publishableKey || !serviceRoleKey) {
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
      .select(
        "id,title,file_name,storage_path,category,summary,keywords,expiry_date",
      )
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
        storagePath: item.storage_path ? String(item.storage_path) : null,
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
              ? "Non trovo vere polizze o certificati assicurativi nel tuo archivio. I contratti, le fatture e le pratiche che citano soltanto un’assicurazione non vengono considerati polizze."
              : "I cannot find genuine insurance policies or certificates in your archive.",
          documentIds: [],
          practiceIds: [],
          filesInspected: 0,
          mode: "insurance",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
      return clearFollowupCookie(response);
    }

    const terms = selectorTerms(question);
    let candidates = insuranceDocuments;

    if (terms.length > 0 && insuranceDocuments.length > 1) {
      const ranked = insuranceDocuments
        .map((document) => ({ document, score: matchScore(document, terms) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const second = ranked[1];

      if (best && best.score > 0 && (!second || best.score > second.score)) {
        candidates = [best.document];
      }
    }

    candidates = candidates.slice(0, MAX_FILES);

    const selectedFiles: Array<{
      document: InsuranceDocument;
      dataUrl: string;
      mime: string;
    }> = [];
    let totalBytes = 0;

    for (const document of candidates) {
      if (
        !document.storagePath ||
        !document.storagePath.startsWith(`${user.id}/`)
      ) {
        continue;
      }

      const { data: fileData, error: downloadError } = await admin.storage
        .from("documents")
        .download(document.storagePath);
      if (downloadError || !fileData) continue;

      const bytes = Buffer.from(await fileData.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) continue;
      if (totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;

      const mime = getMimeType(document.fileName, fileData.type);
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) continue;

      selectedFiles.push({
        document,
        mime,
        dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      });
      totalBytes += bytes.length;
    }

    if (!selectedFiles.length) {
      const response = NextResponse.json(
        {
          answer:
            language === "it"
              ? `Ho trovato ${candidates.length === 1 ? "questo documento assicurativo" : "questi documenti assicurativi"}, ma non riesco ad aprire il file originale per controllare cosa copre e quando scade.`
              : "I found insurance documents, but I cannot open their original files.",
          documentIds: candidates.map((document) => document.id),
          practiceIds: [],
          filesInspected: 0,
          mode: "insurance",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
      return clearFollowupCookie(response);
    }

    const archiveMap = selectedFiles.map(({ document }) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      storedExpiryDate: document.expiryDate,
    }));
    const genericOverview = selectedFiles.length > 1;

    const instructions =
      language === "it"
        ? `Sei l’assistente assicurazioni di DocuMio. Analizza esclusivamente i file allegati a questa richiesta: non hai il permesso di usare o citare altri documenti dell’archivio.

Domanda dell’utente: ${question}

Mappa esatta dei file allegati:
${JSON.stringify(archiveMap)}

Regole obbligatorie:
- apri e leggi ogni file allegato;
- verifica prima che il file sia davvero una polizza, un certificato o una quietanza assicurativa; escludi qualsiasi contratto commerciale, fattura, pratica di importazione, documento di vendita, impianto fotovoltaico o altro documento non assicurativo;
- identifica cosa viene assicurato usando solo ciò che compare nel file: veicolo con marca, modello e targa; casa o immobile con indirizzo; persona, viaggio o altro bene;
- indica la compagnia assicurativa quando è leggibile;
- trova la vera data di fine copertura o scadenza; non usare come scadenza la data di pagamento, quietanza, emissione o caricamento;
- non inventare dati mancanti;
- non mostrare ID tecnici nel testo;
- restituisci in documentIds soltanto gli ID dei file che hai verificato essere realmente assicurativi.

Formato della risposta:
${genericOverview ? 'Inizia con “Ho trovato queste assicurazioni nel tuo archivio:” e usa una riga per ogni vera assicurazione: “• [nome chiaro]: assicurazione di [bene/persona] — compagnia [nome, se presente] — scade il [data]”. Non chiedere quale scegliere.' : 'Rispondi in una frase completa indicando che cosa copre, la compagnia e la scadenza. Se la scadenza non è indicata, scrivilo chiaramente.'}`
        : `You are DocuMio's insurance assistant. Analyze only the files attached to this request. Verify which files are genuine insurance documents, identify what each covers, the insurer, and the real coverage expiry date. Exclude every unrelated document and return only verified document IDs.\n\nFile map:\n${JSON.stringify(archiveMap)}\n\nUser question: ${question}`;

    const content: Array<Record<string, unknown>> = [
      { type: "input_text", text: instructions },
      ...selectedFiles.map(({ document, dataUrl, mime }) =>
        mime.startsWith("image/")
          ? { type: "input_image", image_url: dataUrl }
          : {
              type: "input_file",
              filename: safeFileName(document.fileName),
              file_data: dataUrl,
            },
      ),
    ];

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
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
            name: "documio_insurance_answer",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                documentIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: MAX_FILES,
                },
              },
              required: ["answer", "documentIds"],
            },
          },
        },
      }),
    });

    const result = (await openAIResponse.json()) as OpenAIResponse;
    if (!openAIResponse.ok) {
      console.error("Insurance OpenAI error", result.error?.message);
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            (language === "it"
              ? "Analisi delle assicurazioni non disponibile."
              : "Insurance analysis unavailable."),
        },
        { status: openAIResponse.status },
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
              ? "La risposta sulle assicurazioni non era leggibile."
              : "The insurance answer could not be read.",
        },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(outputText) as {
      answer?: string;
      documentIds?: string[];
    };
    const allowedIds = new Set(selectedFiles.map(({ document }) => document.id));
    const verifiedIds = (parsed.documentIds ?? [])
      .filter((id) => allowedIds.has(id))
      .slice(0, MAX_FILES);

    const finalResponse = NextResponse.json(
      {
        answer: String(parsed.answer ?? "").trim(),
        documentIds: verifiedIds,
        practiceIds: [],
        filesInspected: selectedFiles.length,
        mode: "insurance",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
    return clearFollowupCookie(finalResponse);
  } catch (error) {
    console.error("Insurance assistant error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto nell’analisi delle assicurazioni.",
      },
      { status: 500 },
    );
  }
}
