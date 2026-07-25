import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptEmailSecret, encryptEmailSecret } from "@/lib/email-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);
const MAX_MESSAGES = 20;
const MAX_ATTACHMENTS = 12;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: {
    attachmentId?: string;
    data?: string;
    size?: number;
  };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
};

type AnalysisResult = {
  title?: string;
  category?: string;
  summary?: string;
  keywords?: string[];
  expiryDate?: string | null;
  appointmentTime?: string | null;
  isAttachment?: boolean;
  attachmentType?: string;
  paymentDate?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  notes?: string;
  documentTotalAmount?: number | null;
  installmentCount?: number | null;
  installmentAmount?: number | null;
  financingTotalAmount?: number | null;
  firstInstallmentDate?: string | null;
  isFinancing?: boolean;
  isSinglePaymentOption?: boolean;
  suggestedDocumentId?: string | null;
  matchConfidence?: number;
  error?: string;
};

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "documento.pdf";
}

function extensionOf(value: string) {
  const clean = value.toLowerCase().split(/[?#]/, 1)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1) : "";
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + padding, "base64");
}

function collectAttachments(part: GmailPart | undefined, output: GmailPart[] = []) {
  if (!part) return output;
  const filename = part.filename?.trim() ?? "";
  const extension = extensionOf(filename);
  if (
    filename &&
    ALLOWED_EXTENSIONS.has(extension) &&
    (part.body?.attachmentId || part.body?.data)
  ) {
    output.push(part);
  }
  for (const child of part.parts ?? []) collectAttachments(child, output);
  return output;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_EMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_EMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Credenziali Google mancanti.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description ?? "Rinnovo Gmail non riuscito.");
  }
  return { accessToken: result.access_token, expiresIn: result.expires_in ?? 3600 };
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    const body = (await request.json().catch(() => null)) as {
      messageIds?: string[];
      mode?: "advanced" | "standard";
      confirmed?: boolean;
    } | null;
    const mode = body?.mode === "standard" ? "standard" : "advanced";
    const messageIds = Array.from(new Set(body?.messageIds ?? [])).slice(0, MAX_MESSAGES);

    if (!token || messageIds.length === 0) {
      return NextResponse.json({ error: "Sessione o messaggi mancanti." }, { status: 400 });
    }
    if (mode === "standard" && !body?.confirmed) {
      return NextResponse.json(
        { error: "Nella versione Standard serve una conferma esplicita." },
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
    const { data: connection, error: connectionError } = await admin
      .from("email_connections")
      .select("id,access_token_encrypted,refresh_token_encrypted,token_expires_at")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();
    if (connectionError || !connection) {
      return NextResponse.json({ error: "Gmail non collegata." }, { status: 404 });
    }

    let accessToken = decryptEmailSecret(connection.access_token_encrypted);
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;
    if (expiresAt < Date.now() + 60_000) {
      if (!connection.refresh_token_encrypted) {
        return NextResponse.json({ error: "Ricollega Gmail per continuare." }, { status: 401 });
      }
      const refreshed = await refreshAccessToken(
        decryptEmailSecret(connection.refresh_token_encrypted),
      );
      accessToken = refreshed.accessToken;
      await admin
        .from("email_connections")
        .update({
          access_token_encrypted: encryptEmailSecret(accessToken),
          token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
    }

    const { data: candidateRows } = await admin
      .from("documents")
      .select("id,title,summary,keywords,category,total_amount,installment_count")
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(60);
    const candidateDocuments = (candidateRows ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      keywords: item.keywords ?? [],
      category: item.category,
      totalAmount: item.total_amount,
      installmentCount: item.installment_count,
    }));

    let importedDocuments = 0;
    let linkedAttachments = 0;
    let skipped = 0;
    let inspectedAttachments = 0;
    const errors: string[] = [];

    for (const messageId of messageIds) {
      if (inspectedAttachments >= MAX_ATTACHMENTS) break;
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const message = (await messageResponse.json()) as GmailMessage & { error?: { message?: string } };
      if (!messageResponse.ok) {
        errors.push(message.error?.message ?? `Email ${messageId} non leggibile.`);
        continue;
      }

      const headers = message.payload?.headers ?? [];
      const subject =
        headers.find((item) => item.name.toLowerCase() === "subject")?.value ?? "Email Gmail";
      const sender =
        headers.find((item) => item.name.toLowerCase() === "from")?.value ?? "mittente sconosciuto";
      const parts = collectAttachments(message.payload).slice(
        0,
        Math.max(0, MAX_ATTACHMENTS - inspectedAttachments),
      );

      for (const part of parts) {
        inspectedAttachments += 1;
        const originalName = safeFileName(part.filename ?? "documento.pdf");
        const partIdentity = safeFileName(
          part.body?.attachmentId ?? part.partId ?? String(inspectedAttachments),
        );
        const storagePath = `${user.id}/email/${messageId}/${partIdentity}-${originalName}`;

        const [{ data: existingDocument }, { data: existingAttachment }] = await Promise.all([
          admin
            .from("documents")
            .select("id")
            .eq("user_id", user.id)
            .eq("storage_path", storagePath)
            .maybeSingle(),
          admin
            .from("document_attachments")
            .select("id")
            .eq("user_id", user.id)
            .eq("storage_path", storagePath)
            .maybeSingle(),
        ]);
        if (existingDocument || existingAttachment) {
          skipped += 1;
          continue;
        }

        let encoded = part.body?.data ?? "";
        if (!encoded && part.body?.attachmentId) {
          const attachmentResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const attachmentResult = (await attachmentResponse.json()) as {
            data?: string;
            error?: { message?: string };
          };
          if (!attachmentResponse.ok || !attachmentResult.data) {
            errors.push(
              attachmentResult.error?.message ?? `Allegato ${originalName} non scaricabile.`,
            );
            continue;
          }
          encoded = attachmentResult.data;
        }

        const fileBuffer = decodeBase64Url(encoded);
        if (!fileBuffer.length || fileBuffer.length > MAX_FILE_BYTES) {
          skipped += 1;
          continue;
        }

        const mimeType =
          part.mimeType ||
          (extensionOf(originalName) === "pdf"
            ? "application/pdf"
            : extensionOf(originalName) === "png"
              ? "image/png"
              : "image/jpeg");
        const { error: uploadError } = await admin.storage
          .from("documents")
          .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) {
          if (uploadError.message.toLowerCase().includes("already")) skipped += 1;
          else errors.push(uploadError.message);
          continue;
        }

        const analyzeResponse = await fetch(`${new URL(request.url).origin}/api/analyze`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storagePath,
            fileName: originalName,
            language: "it",
            mode: "document",
            userNote: `Importato automaticamente da Gmail. Oggetto: ${subject}. Mittente: ${sender}.`,
            candidateDocuments,
          }),
        });
        const analysis = (await analyzeResponse.json().catch(() => null)) as AnalysisResult | null;
        if (!analyzeResponse.ok || !analysis || analysis.error) {
          await admin.storage.from("documents").remove([storagePath]);
          errors.push(analysis?.error ?? `Analisi non riuscita per ${originalName}.`);
          continue;
        }

        const commonKeywords = Array.from(
          new Set([...(analysis.keywords ?? []), "Gmail", "Importato automaticamente"]),
        ).slice(0, 8);
        const canLink =
          analysis.isAttachment === true &&
          Boolean(analysis.suggestedDocumentId) &&
          Number(analysis.matchConfidence ?? 0) >= 85;

        if (canLink) {
          const { error: insertAttachmentError } = await admin
            .from("document_attachments")
            .insert({
              user_id: user.id,
              document_id: analysis.suggestedDocumentId,
              title: analysis.title || originalName,
              attachment_type: analysis.attachmentType || "Comunicazione",
              file_name: originalName,
              storage_path: storagePath,
              payment_date: analysis.paymentDate ?? null,
              amount: analysis.amount ?? null,
              payment_method: analysis.paymentMethod ?? null,
              notes: `${analysis.notes ?? ""}${analysis.notes ? " · " : ""}Importato da Gmail: ${subject}`,
            });
          if (insertAttachmentError) {
            await admin.storage.from("documents").remove([storagePath]);
            errors.push(insertAttachmentError.message);
            continue;
          }
          linkedAttachments += 1;
          continue;
        }

        const isStandaloneReceipt = analysis.isAttachment === true && Number(analysis.amount ?? 0) > 0;
        const totalAmount =
          analysis.documentTotalAmount ?? (isStandaloneReceipt ? analysis.amount ?? null : null);
        const paidAmount = isStandaloneReceipt ? analysis.amount ?? null : null;
        const paymentStatus = isStandaloneReceipt ? "Pagato" : "Da pagare";
        const remainingAmount =
          totalAmount != null && paidAmount != null
            ? Math.max(0, Number(totalAmount) - Number(paidAmount))
            : totalAmount;

        const { error: insertDocumentError } = await admin.from("documents").insert({
          user_id: user.id,
          practice_id: null,
          title: analysis.title || subject || originalName,
          category: analysis.category || "Altro",
          file_name: originalName,
          uploaded_at: new Date().toISOString(),
          expiry_date: analysis.expiryDate ?? null,
          appointment_time: analysis.appointmentTime ?? null,
          summary:
            analysis.summary || `Documento importato automaticamente dall'email “${subject}”.`,
          keywords: commonKeywords,
          size: fileBuffer.length,
          storage_path: storagePath,
          payment_status: paymentStatus,
          paid_at: isStandaloneReceipt ? analysis.paymentDate ?? new Date().toISOString().slice(0, 10) : null,
          paid_amount: paidAmount,
          payment_method: analysis.paymentMethod ?? null,
          total_amount: totalAmount,
          installment_count: analysis.installmentCount ?? null,
          installment_amount: analysis.installmentAmount ?? null,
          financing_total_amount: analysis.financingTotalAmount ?? null,
          first_installment_date: analysis.firstInstallmentDate ?? null,
          is_financing: analysis.isFinancing ?? false,
          is_single_payment_option: analysis.isSinglePaymentOption ?? false,
          paid_installments: isStandaloneReceipt ? 1 : null,
          remaining_amount: remainingAmount,
          last_payment_date: isStandaloneReceipt ? analysis.paymentDate ?? null : null,
          payment_progress_confirmed: isStandaloneReceipt,
        });
        if (insertDocumentError) {
          await admin.storage.from("documents").remove([storagePath]);
          errors.push(insertDocumentError.message);
          continue;
        }
        importedDocuments += 1;
      }
    }

    return NextResponse.json({
      importedDocuments,
      linkedAttachments,
      skipped,
      inspectedAttachments,
      errors: errors.slice(0, 8),
    });
  } catch (error) {
    console.error("Gmail automatic import failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Importazione Gmail non riuscita." },
      { status: 500 },
    );
  }
}
