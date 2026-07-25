import { NextRequest, NextResponse } from "next/server";

const PROTECTED_API_PATHS = new Set(["/api/analyze"]);
const MAX_MULTIPART_BYTES = 21 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

function unauthorized(message: string) {
  return jsonError(message, 401);
}

function getExtension(value: string) {
  const cleanValue = value.split(/[?#]/, 1)[0].toLowerCase();
  const lastPart = cleanValue.split("/").pop() ?? "";
  const dot = lastPart.lastIndexOf(".");
  return dot >= 0 ? lastPart.slice(dot + 1) : "";
}

function hasUnsafeCharacters(value: string) {
  return /[\u0000-\u001f\u007f\\]/.test(value);
}

function normalizedQuestion(question: unknown) {
  return String(question ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function needsAssistantContext(question: unknown) {
  const normalized = normalizedQuestion(question);
  const capabilityQuestion = [
    "cosa sai fare",
    "cosa puoi fare",
    "come mi puoi aiutare",
    "come puoi aiutarmi",
    "a cosa servi",
    "che funzioni hai",
  ].some((term) => normalized.includes(term));

  if (capabilityQuestion) return true;
  if (!normalized.includes("pratic")) return false;

  const asksForSpecificWork = [
    "riepilogo",
    "riassunto",
    "sintesi",
    "stato pratica",
    "prepara pratica",
    "apri pratica",
    "dettagli pratica",
    "parlami della pratica",
    "controlla pratica",
  ].some((term) => normalized.includes(term));
  if (asksForSpecificWork) return false;

  return (
    normalized === "pratiche" ||
    normalized.startsWith("pratica ") ||
    [
      "quali pratic",
      "quante pratic",
      "qualche pratic",
      "che pratic",
      "elenco pratic",
      "lista pratic",
      "mostra pratic",
      "fammi vedere le pratic",
      "pratiche ho",
      "pratica ho",
      "ho una pratica",
      "ho delle pratic",
      "ci sono pratic",
      "pratiche disponibili",
      "pratiche risultano",
      "pratica la ho",
      "sbaglio",
    ].some((term) => normalized.includes(term))
  );
}

function needsAuthoritativePaymentState(question: unknown) {
  const normalized = normalizedQuestion(question);

  return [
    "scad",
    "questa settimana",
    "prossimi 7 giorni",
    "prossimi 30 giorni",
    "devo fare",
    "cosa fare",
    "quanto devo pagare",
    "da pagare",
    "debito",
    "saldo dovuto",
    "ricevut",
    "quietanz",
    "pagat",
    "saldat",
    "ho pagato",
  ].some((term) => normalized.includes(term));
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/assistant") {
    const destination = request.nextUrl.clone();
    const body = (await request.clone().json().catch(() => null)) as {
      question?: unknown;
      language?: unknown;
    } | null;
    const italian = body?.language !== "en";
    const useContext = italian && needsAssistantContext(body?.question);
    const usePaymentGuard =
      italian && !useContext && needsAuthoritativePaymentState(body?.question);
    destination.pathname = useContext
      ? "/api/assistant-context"
      : usePaymentGuard
        ? "/api/assistant-safe"
        : "/api/assistant-clean";
    return NextResponse.rewrite(destination);
  }

  if (!PROTECTED_API_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.method !== "POST") {
    return jsonError("Metodo non consentito.", 405);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const isJson = contentType.includes("application/json");
  const isMultipart = contentType.includes("multipart/form-data");

  if (!isJson && !isMultipart) {
    return jsonError("Tipo di richiesta non supportato.", 415);
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : null;
  const requestLimit = isJson ? MAX_JSON_BYTES : MAX_MULTIPART_BYTES;

  if (
    contentLength !== null &&
    (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > requestLimit)
  ) {
    return jsonError("Richiesta troppo grande.", 413);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1]?.trim();

  if (!token) {
    return unauthorized("Sessione mancante.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonError("Configurazione server incompleta.", 500);
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!authResponse.ok) {
      return unauthorized("Sessione non valida o scaduta.");
    }
  } catch (error) {
    console.error("DocuMio middleware auth error:", error);
    return jsonError(
      "Servizio di autenticazione temporaneamente non disponibile.",
      503,
    );
  }

  if (isJson) {
    try {
      const body = (await request.clone().json()) as {
        storagePath?: unknown;
        fileName?: unknown;
        userNote?: unknown;
      };

      const storagePath =
        typeof body.storagePath === "string" ? body.storagePath.trim() : "";
      const fileName =
        typeof body.fileName === "string" ? body.fileName.trim() : "";
      const userNote = typeof body.userNote === "string" ? body.userNote : "";

      if (!storagePath || storagePath.length > 500 || hasUnsafeCharacters(storagePath)) {
        return jsonError("Percorso del file non valido.", 400);
      }

      if (!fileName || fileName.length > 200 || hasUnsafeCharacters(fileName)) {
        return jsonError("Nome del file non valido.", 400);
      }

      if (userNote.length > 4000) {
        return jsonError("Nota troppo lunga.", 400);
      }

      const fileExtension = getExtension(fileName);
      const storageExtension = getExtension(storagePath);

      if (
        !ALLOWED_FILE_EXTENSIONS.has(fileExtension) ||
        !ALLOWED_FILE_EXTENSIONS.has(storageExtension) ||
        fileExtension !== storageExtension
      ) {
        return jsonError("Sono ammessi solo file PDF, JPG e PNG.", 415);
      }
    } catch {
      return jsonError("Corpo JSON non valido.", 400);
    }
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/api/analyze", "/api/assistant"],
};
