import { NextRequest, NextResponse } from "next/server";

const PROTECTED_API_PATHS = new Set(["/api/analyze"]);
const MAX_MULTIPART_BYTES = 21 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

type SupportedFileType = "pdf" | "jpeg" | "png";

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

function expectedFileType(extension: string): SupportedFileType | null {
  if (extension === "pdf") return "pdf";
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  return null;
}

function detectFileType(bytes: Uint8Array): SupportedFileType | null {
  const isPdf =
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;

  if (isPdf) return "pdf";

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  if (isJpeg) return "jpeg";

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng =
    bytes.length >= pngSignature.length &&
    pngSignature.every((value, index) => bytes[index] === value);

  return isPng ? "png" : null;
}

function signatureMatches(bytes: Uint8Array, extension: string) {
  const expected = expectedFileType(extension);
  return expected !== null && detectFileType(bytes) === expected;
}

function encodeStoragePath(storagePath: string) {
  return storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function middleware(request: NextRequest) {
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

      const storageResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/authenticated/documents/${encodeStoragePath(storagePath)}`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${token}`,
            Range: "bytes=0-15",
          },
          cache: "no-store",
        },
      );

      if (!storageResponse.ok) {
        return jsonError("File non disponibile per la verifica.", 404);
      }

      const signatureBytes = new Uint8Array(await storageResponse.arrayBuffer()).slice(0, 16);

      if (!signatureMatches(signatureBytes, fileExtension)) {
        return jsonError(
          "Il contenuto del file non corrisponde al formato dichiarato.",
          415,
        );
      }
    } catch (error) {
      console.error("DocuMio JSON file validation error:", error);
      return jsonError("Impossibile verificare il file.", 400);
    }
  }

  if (isMultipart) {
    try {
      const formData = await request.clone().formData();
      const incomingFile = formData.get("file");

      if (!(incomingFile instanceof File)) {
        return jsonError("File mancante.", 400);
      }

      const extension = getExtension(incomingFile.name);

      if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
        return jsonError("Sono ammessi solo file PDF, JPG e PNG.", 415);
      }

      const signatureBytes = new Uint8Array(
        await incomingFile.slice(0, 16).arrayBuffer(),
      );

      if (!signatureMatches(signatureBytes, extension)) {
        return jsonError(
          "Il contenuto del file non corrisponde al formato dichiarato.",
          415,
        );
      }
    } catch (error) {
      console.error("DocuMio multipart file validation error:", error);
      return jsonError("Impossibile verificare il file.", 400);
    }
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/api/analyze"],
};
