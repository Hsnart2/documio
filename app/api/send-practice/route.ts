import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_EMAIL_BYTES = 20 * 1024 * 1024;

type SendPracticeBody = {
  practiceId?: unknown;
  to?: unknown;
  subject?: unknown;
  message?: unknown;
  language?: unknown;
};

type FileToSend = {
  storagePath: string;
  fileName: string;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanFileName(fileName: string) {
  const withoutUuid = fileName.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i,
    "",
  );

  return withoutUuid
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 160) || "documento";
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function uniqueFileName(fileName: string, used: Set<string>) {
  const clean = cleanFileName(fileName);
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }

  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const extension = dot > 0 ? clean.slice(dot) : "";

  let counter = 2;
  while (used.has(`${base}-${counter}${extension}`.toLowerCase())) {
    counter += 1;
  }

  const result = `${base}-${counter}${extension}`;
  used.add(result.toLowerCase());
  return result;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey =
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.REMINDER_EMAIL_FROM;

    if (!supabaseUrl || !publicKey || !serviceKey || !resendKey || !emailFrom) {
      return NextResponse.json(
        { error: "Configurazione server incompleta per l'invio email." },
        { status: 500 },
      );
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Sessione mancante." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Sessione non valida o scaduta." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as SendPracticeBody;
    const practiceId = cleanText(body.practiceId, 100);
    const to = cleanText(body.to, 320);
    const subject = cleanText(body.subject, 180);
    const message = cleanText(body.message, 4000);
    const language = body.language === "en" ? "en" : "it";

    if (!practiceId || !to || !subject) {
      return NextResponse.json(
        { error: language === "it" ? "Dati email incompleti." : "Incomplete email data." },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json(
        { error: language === "it" ? "Indirizzo email non valido." : "Invalid email address." },
        { status: 400 },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: practice, error: practiceError } = await admin
      .from("practices")
      .select("id, title, description, status")
      .eq("id", practiceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (practiceError) throw new Error(practiceError.message);
    if (!practice) {
      return NextResponse.json(
        { error: language === "it" ? "Pratica non trovata." : "Case not found." },
        { status: 404 },
      );
    }

    const { data: documents, error: documentError } = await admin
      .from("documents")
      .select("id, title, file_name, storage_path")
      .eq("user_id", user.id)
      .eq("practice_id", practiceId)
      .order("uploaded_at", { ascending: true });

    if (documentError) throw new Error(documentError.message);
    if (!documents?.length) {
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "La pratica non contiene documenti da inviare."
              : "The case contains no documents to send.",
        },
        { status: 400 },
      );
    }

    const documentIds = documents.map((document) => document.id);
    const { data: attachmentRows, error: attachmentError } = await admin
      .from("document_attachments")
      .select("document_id, file_name, storage_path")
      .eq("user_id", user.id)
      .in("document_id", documentIds);

    if (attachmentError) throw new Error(attachmentError.message);

    const files: FileToSend[] = [
      ...documents.flatMap((document) =>
        document.storage_path
          ? [{ storagePath: document.storage_path, fileName: document.file_name }]
          : [],
      ),
      ...(attachmentRows ?? []).flatMap((attachment) =>
        attachment.storage_path
          ? [{ storagePath: attachment.storage_path, fileName: attachment.file_name }]
          : [],
      ),
    ];

    if (!files.length) {
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "Nessun file disponibile nello Storage."
              : "No files are available in Storage.",
        },
        { status: 400 },
      );
    }

    const usedNames = new Set<string>();
    const emailAttachments: Array<{ filename: string; content: string }> = [];
    let totalBytes = 0;

    for (const file of files) {
      const { data, error } = await admin.storage
        .from("documents")
        .download(file.storagePath);

      if (error || !data) {
        throw new Error(
          `${language === "it" ? "Impossibile leggere" : "Unable to read"} ${cleanFileName(file.fileName)}.`,
        );
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      totalBytes += buffer.byteLength;

      if (totalBytes > MAX_EMAIL_BYTES) {
        return NextResponse.json(
          {
            error:
              language === "it"
                ? "La pratica supera 20 MB. Per ora riduci i file; nel prossimo passaggio aggiungeremo il link di download per le pratiche più pesanti."
                : "The case exceeds 20 MB. Reduce the files for now; a download-link option for larger cases will be added next.",
          },
          { status: 413 },
        );
      }

      emailAttachments.push({
        filename: uniqueFileName(file.fileName, usedNames),
        content: buffer.toString("base64"),
      });
    }

    const safeTitle = escapeHtml(practice.title);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
    const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#131a2d">
    <div style="max-width:640px;margin:0 auto;padding:28px 18px">
      <div style="background:#302c78;color:white;padding:24px;border-radius:18px 18px 0 0">
        <h1 style="margin:0;font-size:26px">DocuMio</h1>
        <p style="margin:8px 0 0;color:#d9dcff">${language === "it" ? "Condivisione pratica" : "Case sharing"}</p>
      </div>
      <div style="background:white;padding:24px;border-radius:0 0 18px 18px">
        <h2 style="margin:0 0 12px">${safeTitle}</h2>
        <p style="line-height:1.6;color:#4f5d75">${safeMessage || (language === "it" ? "In allegato trovi i documenti della pratica." : "The case documents are attached.")}</p>
        <p style="margin:20px 0 0;color:#73809a;font-size:13px">
          ${language === "it" ? `File allegati: ${emailAttachments.length}` : `Attached files: ${emailAttachments.length}`}
        </p>
      </div>
    </div>
  </body>
</html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [to],
        subject,
        html,
        attachments: emailAttachments,
      }),
    });

    const resendResult = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      return NextResponse.json(
        {
          error:
            resendResult?.message ||
            (language === "it"
              ? "Il servizio email ha rifiutato l'invio."
              : "The email service rejected the request."),
        },
        { status: resendResponse.status },
      );
    }

    return NextResponse.json({
      success: true,
      filesSent: emailAttachments.length,
      bytesSent: totalBytes,
    });
  } catch (error) {
    console.error("Send practice route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante l'invio della pratica.",
      },
      { status: 500 },
    );
  }
}
