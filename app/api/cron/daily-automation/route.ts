import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { decryptEmailSecret, encryptEmailSecret } from "@/lib/email-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_USERS_PER_RUN = 10;
const MAX_MESSAGES_PER_USER = 30;
const MAX_IMPORT_MESSAGES = 10;
const MAX_ATTACHMENTS_PER_USER = 8;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);
const DAY_MS = 86_400_000;

type PreferenceRow = {
  user_id: string;
  ui_mode: "advanced" | "standard";
  daily_email_enabled: boolean;
  trash_promotions_enabled: boolean;
  import_documents_enabled: boolean;
  email_digest_enabled: boolean;
  timezone: string | null;
  last_run_at: string | null;
};

type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
};

type EmailCategory = "pagamenti" | "documenti" | "appuntamenti" | "pubblicita" | "altro";
type EmailImportance = "high" | "medium" | "low";

type EmailInput = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
};

type EmailAnalysis = {
  id: string;
  category: EmailCategory;
  importance: EmailImportance;
  suggestedAction: "review_document" | "review_calendar" | "review_trash" | "none";
  reason: string;
  documentType: string | null;
  amount: number | null;
  dueDate: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  senderName: string | null;
};

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  uploaded_at: string;
  expiry_date: string | null;
  appointment_time: string | null;
  payment_status: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  total_amount: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  first_installment_date: string | null;
  is_financing: boolean | null;
  paid_installments: number | null;
  storage_path: string | null;
  keywords: string[] | null;
};

type RunSummary = {
  analyzed: number;
  imported: number;
  trashed: number;
  notifications: number;
  skipped: number;
  warnings: string[];
};

type SupabaseAdmin = ReturnType<typeof createClient>;

function extensionOf(value: string) {
  const clean = value.toLowerCase().split(/[?#]/, 1)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1) : "";
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 160) || "documento.pdf"
  );
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + padding, "base64");
}

function collectAttachments(part: GmailPart | undefined, output: GmailPart[] = []) {
  if (!part) return output;
  const filename = part.filename?.trim() ?? "";
  if (
    filename &&
    ALLOWED_EXTENSIONS.has(extensionOf(filename)) &&
    (part.body?.attachmentId || part.body?.data)
  ) {
    output.push(part);
  }
  for (const child of part.parts ?? []) collectAttachments(child, output);
  return output;
}

function header(message: GmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function senderIdentity(from: string) {
  const match = from.match(/<([^>]+)>/) ?? from.match(/[\w.+-]+@[\w.-]+/);
  const email = (match?.[1] ?? match?.[0] ?? "").toLowerCase();
  return email || from.trim().slice(0, 120) || "mittente-sconosciuto";
}

function senderDomain(from: string) {
  const identity = senderIdentity(from);
  return identity.includes("@") ? identity.split("@").pop() ?? identity : identity;
}

function categoryFor(analysis: EmailAnalysis, subject: string) {
  const text = normalize(`${analysis.documentType ?? ""} ${subject}`);
  if (analysis.category === "appuntamenti") return "Appuntamenti";
  if (text.includes("polizza") || text.includes("assicuraz")) return "Assicurazioni";
  if (text.includes("auto") || text.includes("veicolo") || text.includes("targa")) return "Veicoli";
  if (text.includes("banca") || text.includes("mutuo") || text.includes("finanzi")) return "Banca";
  if (text.includes("medic") || text.includes("visita")) return "Visite mediche";
  if (analysis.category === "pagamenti") return "Bollette";
  return "Altro";
}

function looksPaid(analysis: EmailAnalysis, subject: string, snippet: string) {
  const text = normalize(`${analysis.documentType ?? ""} ${subject} ${snippet}`);
  return [
    "ricevuta",
    "quietanza",
    "pagamento effettuato",
    "pagamento eseguito",
    "conferma pagamento",
    "pagato",
  ].some((term) => text.includes(term));
}

function isSafeTrashCandidate(message: EmailInput & EmailAnalysis) {
  if (message.importance !== "low" || message.suggestedAction !== "review_trash") return false;
  if (message.category !== "pubblicita" && message.category !== "altro") return false;
  if (message.labelIds.includes("STARRED") || message.labelIds.includes("IMPORTANT")) return false;
  if (message.documentType || message.amount || message.dueDate || message.appointmentDate) return false;
  return true;
}

function romeDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number) {
  const source = new Date(`${date}T00:00:00Z`);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(today: string, dueDate: string) {
  return Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
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

async function accessTokenForUser(admin: SupabaseAdmin, userId: string) {
  const { data: connection, error } = await admin
    .from("email_connections")
    .select("id,access_token_encrypted,refresh_token_encrypted,token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (error || !connection) return null;

  let accessToken = decryptEmailSecret(connection.access_token_encrypted);
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expiresAt < Date.now() + 60_000) {
    if (!connection.refresh_token_encrypted) throw new Error("Ricollega Gmail per continuare.");
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
  return accessToken;
}

async function listRecentMessages(accessToken: string): Promise<EmailInput[]> {
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(MAX_MESSAGES_PER_USER));
  listUrl.searchParams.set("q", "newer_than:2d -in:trash");
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const list = (await listResponse.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string };
  };
  if (!listResponse.ok) throw new Error(list.error?.message ?? "Lettura Gmail non riuscita.");

  const messages = await Promise.all(
    (list.messages ?? []).map(async ({ id }) => {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const message = (await response.json()) as GmailMessage;
      if (!response.ok) return null;
      return {
        id: message.id,
        subject: header(message, "Subject"),
        from: header(message, "From"),
        date: header(message, "Date"),
        snippet: message.snippet ?? "",
        labelIds: message.labelIds ?? [],
      } satisfies EmailInput;
    }),
  );

  return messages.filter((message): message is EmailInput => Boolean(message));
}

async function analyzeMessages(messages: EmailInput[]): Promise<EmailAnalysis[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || messages.length === 0) return [];
  const currentDate = new Date().toISOString().slice(0, 10);
  const instructions = `Sei l'assistente email prudente di DocuMio. Oggi è ${currentDate}.
Classifica ogni email in: pagamenti, documenti, appuntamenti, pubblicita, altro.
Usa importanza high solo quando serve davvero un'azione. Ricevute e conferme di pagamento sono documenti, non nuove scadenze.
Per suggestedAction usa review_document, review_calendar, review_trash o none.
Proponi review_trash soltanto per pubblicità, newsletter o notifiche ripetitive chiaramente inutili.
Non inventare importi, date, orari o tipi documento. Date YYYY-MM-DD, orari HH:MM.
Restituisci esattamente un risultato per ciascun id.`;

  const results: EmailAnalysis[] = [];
  for (let index = 0; index < messages.length; index += 15) {
    const batch = messages.slice(index, index + 15);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          reasoning: { effort: "minimal" },
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: instructions },
                { type: "input_text", text: JSON.stringify(batch) },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "documio_daily_email_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  results: {
                    type: "array",
                    minItems: batch.length,
                    maxItems: batch.length,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        category: {
                          type: "string",
                          enum: ["pagamenti", "documenti", "appuntamenti", "pubblicita", "altro"],
                        },
                        importance: { type: "string", enum: ["high", "medium", "low"] },
                        suggestedAction: {
                          type: "string",
                          enum: ["review_document", "review_calendar", "review_trash", "none"],
                        },
                        reason: { type: "string" },
                        documentType: { anyOf: [{ type: "string" }, { type: "null" }] },
                        amount: { anyOf: [{ type: "number" }, { type: "null" }] },
                        dueDate: {
                          anyOf: [
                            { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                            { type: "null" },
                          ],
                        },
                        appointmentDate: {
                          anyOf: [
                            { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                            { type: "null" },
                          ],
                        },
                        appointmentTime: {
                          anyOf: [
                            { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
                            { type: "null" },
                          ],
                        },
                        senderName: { anyOf: [{ type: "string" }, { type: "null" }] },
                      },
                      required: [
                        "id",
                        "category",
                        "importance",
                        "suggestedAction",
                        "reason",
                        "documentType",
                        "amount",
                        "dueDate",
                        "appointmentDate",
                        "appointmentTime",
                        "senderName"
                      ],
                    },
                  },
                },
                required: ["results"],
              },
            },
          },
        }),
      });
      const payload = (await response.json()) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      if (!response.ok) continue;
      const outputText = payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((part) => part.type === "output_text")?.text;
      if (!outputText) continue;
      const parsed = JSON.parse(outputText) as { results?: EmailAnalysis[] };
      const allowedIds = new Set(batch.map((item) => item.id));
      results.push(
        ...(parsed.results ?? []).filter((item) => allowedIds.has(item.id)),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  return results;
}

async function logActivity(
  admin: SupabaseAdmin,
  input: {
    userId: string;
    runId: string;
    actionType: string;
    title: string;
    detail?: string;
    status?: "completed" | "skipped" | "warning" | "failed";
    entityType?: string;
    entityId?: string;
    recoverable?: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  const { data } = await admin
    .from("automation_activity")
    .insert({
      user_id: input.userId,
      run_id: input.runId,
      action_type: input.actionType,
      title: input.title,
      detail: input.detail ?? null,
      status: input.status ?? "completed",
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      recoverable: input.recoverable ?? false,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

async function createNotification(
  admin: SupabaseAdmin,
  input: {
    userId: string;
    type: string;
    severity: "info" | "warning" | "urgent";
    title: string;
    body: string;
    dedupeKey: string;
    documentId?: string;
    activityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { data, error } = await admin
    .from("automation_notifications")
    .upsert(
      {
        user_id: input.userId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        body: input.body,
        document_id: input.documentId ?? null,
        activity_id: input.activityId ?? null,
        dedupe_key: input.dedupeKey,
        metadata: input.metadata ?? {},
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id,title,body,severity")
    .maybeSingle();
  if (error) return null;
  return data;
}

async function importUsefulAttachments(
  admin: SupabaseAdmin,
  userId: string,
  runId: string,
  accessToken: string,
  messages: Array<EmailInput & EmailAnalysis>,
  summary: RunSummary,
) {
  let inspected = 0;
  const createdNotifications: Array<{ title: string; body: string; severity: string }> = [];

  for (const source of messages.slice(0, MAX_IMPORT_MESSAGES)) {
    if (inspected >= MAX_ATTACHMENTS_PER_USER) break;
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(source.id)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const message = (await response.json()) as GmailMessage & { error?: { message?: string } };
    if (!response.ok) {
      summary.warnings.push(message.error?.message ?? `Email ${source.id} non leggibile.`);
      continue;
    }

    const parts = collectAttachments(message.payload).slice(
      0,
      Math.max(0, MAX_ATTACHMENTS_PER_USER - inspected),
    );
    for (const part of parts) {
      inspected += 1;
      const originalName = safeFileName(part.filename ?? "documento.pdf");
      const identity = safeFileName(part.body?.attachmentId ?? part.partId ?? String(inspected));
      const storagePath = `${userId}/email/${source.id}/${identity}-${originalName}`;

      const { data: existing } = await admin
        .from("documents")
        .select("id")
        .eq("user_id", userId)
        .eq("storage_path", storagePath)
        .maybeSingle();
      if (existing) {
        summary.skipped += 1;
        continue;
      }

      let encoded = part.body?.data ?? "";
      if (!encoded && part.body?.attachmentId) {
        const attachmentResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(source.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const attachment = (await attachmentResponse.json()) as {
          data?: string;
          error?: { message?: string };
        };
        if (!attachmentResponse.ok || !attachment.data) {
          summary.warnings.push(
            attachment.error?.message ?? `Allegato ${originalName} non scaricabile.`,
          );
          continue;
        }
        encoded = attachment.data;
      }

      const fileBuffer = decodeBase64Url(encoded);
      if (!fileBuffer.length || fileBuffer.length > MAX_FILE_BYTES) {
        summary.skipped += 1;
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
        if (uploadError.message.toLowerCase().includes("already")) summary.skipped += 1;
        else summary.warnings.push(uploadError.message);
        continue;
      }

      const paid = looksPaid(source, source.subject, source.snippet);
      const amount = source.amount != null ? Number(source.amount) : null;
      const expiryDate = source.appointmentDate ?? source.dueDate ?? null;
      const keywords = Array.from(
        new Set(
          [
            "Gmail",
            "Importato automaticamente",
            source.documentType ?? "",
            senderDomain(source.from),
          ].filter(Boolean),
        ),
      ).slice(0, 8);
      const { data: inserted, error: insertError } = await admin
        .from("documents")
        .insert({
          user_id: userId,
          practice_id: null,
          title: source.subject || source.documentType || originalName,
          category: categoryFor(source, source.subject),
          file_name: originalName,
          uploaded_at: new Date().toISOString(),
          expiry_date: expiryDate,
          appointment_time: source.appointmentTime ?? null,
          summary: `Importato automaticamente da Gmail. ${source.reason}. Mittente: ${source.from}. ${source.snippet}`.slice(0, 1500),
          keywords,
          size: fileBuffer.length,
          storage_path: storagePath,
          payment_status: paid ? "Pagato" : "Da pagare",
          paid_at: paid ? new Date().toISOString().slice(0, 10) : null,
          paid_amount: paid ? amount : null,
          total_amount: amount,
          remaining_amount: paid ? 0 : amount,
          last_payment_date: paid ? new Date().toISOString().slice(0, 10) : null,
          payment_progress_confirmed: paid,
          is_financing: false,
          is_single_payment_option: false,
        })
        .select("id,title")
        .single();
      if (insertError || !inserted) {
        await admin.storage.from("documents").remove([storagePath]);
        summary.warnings.push(insertError?.message ?? `Documento ${originalName} non salvato.`);
        continue;
      }

      summary.imported += 1;
      const activityId = await logActivity(admin, {
        userId,
        runId,
        actionType: "email_document_imported",
        title: `Importato: ${inserted.title}`,
        detail: `Allegato scaricato automaticamente dall'email di ${source.from}.`,
        entityType: "document",
        entityId: inserted.id,
        metadata: { gmailMessageId: source.id, storagePath, originalName },
      });
      const notification = await createNotification(admin, {
        userId,
        type: "new_document",
        severity: source.importance === "high" ? "warning" : "info",
        title: "Nuovo documento ricevuto",
        body: `${inserted.title} è stato importato automaticamente da Gmail.`,
        dedupeKey: `gmail-document:${storagePath}`,
        documentId: inserted.id,
        activityId,
      });
      if (notification) {
        summary.notifications += 1;
        createdNotifications.push(notification);
      }
    }
  }

  return createdNotifications;
}

async function createDocumentAlerts(
  admin: SupabaseAdmin,
  userId: string,
  runId: string,
  summary: RunSummary,
) {
  const today = romeDate();
  const limitDate = addDays(today, 7);
  const { data } = await admin
    .from("documents")
    .select(
      "id,title,category,uploaded_at,expiry_date,appointment_time,payment_status,paid_at,paid_amount,total_amount,installment_count,installment_amount,first_installment_date,is_financing,paid_installments,storage_path,keywords",
    )
    .eq("user_id", userId)
    .order("uploaded_at", { ascending: false })
    .limit(250);
  const documents = (data ?? []) as DocumentRow[];
  const created: Array<{ title: string; body: string; severity: string }> = [];

  for (const document of documents) {
    if (["Pagato", "Contestato"].includes(document.payment_status ?? "")) continue;
    let dueDate = document.expiry_date;
    if (
      document.is_financing &&
      document.first_installment_date &&
      document.installment_count
    ) {
      const paidInstallments = Math.max(0, Number(document.paid_installments) || 0);
      if (paidInstallments < document.installment_count) {
        dueDate = addMonths(document.first_installment_date, paidInstallments);
      }
    }
    if (!dueDate || dueDate < today || dueDate > limitDate) continue;
    const days = daysBetween(today, dueDate);
    const notification = await createNotification(admin, {
      userId,
      type: "deadline",
      severity: days <= 1 ? "urgent" : "warning",
      title: days === 0 ? "Scadenza oggi" : `Scadenza tra ${days} giorni`,
      body: `${document.title}${document.installment_amount ? ` · ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(document.installment_amount)}` : ""}`,
      dedupeKey: `deadline:${document.id}:${dueDate}`,
      documentId: document.id,
      metadata: { dueDate },
    });
    if (notification) {
      summary.notifications += 1;
      created.push(notification);
    }
  }

  const paidDocuments = documents.filter(
    (document) =>
      document.payment_status === "Pagato" &&
      Number(document.paid_amount ?? 0) > 0 &&
      !normalize(`${document.title} ${(document.keywords ?? []).join(" ")}`).match(
        /ricevuta|quietanza|conferma pagamento/,
      ),
  );
  if (paidDocuments.length) {
    const { data: attachmentRows } = await admin
      .from("document_attachments")
      .select("document_id,attachment_type")
      .eq("user_id", userId)
      .in(
        "document_id",
        paidDocuments.map((document) => document.id),
      );
    const withProof = new Set(
      (attachmentRows ?? [])
        .filter((item) => ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachment_type))
        .map((item) => item.document_id),
    );
    for (const document of paidDocuments.filter((item) => !withProof.has(item.id))) {
      const notification = await createNotification(admin, {
        userId,
        type: "missing_receipt",
        severity: "warning",
        title: "Manca la ricevuta di pagamento",
        body: `${document.title} risulta pagato, ma non ha una ricevuta collegata.`,
        dedupeKey: `missing-receipt:${document.id}`,
        documentId: document.id,
      });
      if (notification) {
        summary.notifications += 1;
        created.push(notification);
      }
    }
  }

  const titleGroups = new Map<string, DocumentRow[]>();
  for (const document of documents.filter(
    (item) => Date.now() - Date.parse(item.uploaded_at) <= 90 * DAY_MS,
  )) {
    const key = normalize(document.title);
    if (key.length < 10) continue;
    titleGroups.set(key, [...(titleGroups.get(key) ?? []), document]);
  }
  for (const [key, group] of titleGroups) {
    const distinctPaths = new Set(group.map((item) => item.storage_path).filter(Boolean));
    if (group.length < 2 || distinctPaths.size < 2) continue;
    const ids = group.map((item) => item.id).sort();
    const notification = await createNotification(admin, {
      userId,
      type: "possible_duplicate",
      severity: "info",
      title: "Possibili documenti duplicati",
      body: `Ho trovato ${group.length} documenti con il titolo “${group[0].title}”.`,
      dedupeKey: `duplicate:${key}:${ids.join("-")}`,
      documentId: group[0].id,
      metadata: { documentIds: ids },
    });
    if (notification) {
      summary.notifications += 1;
      created.push(notification);
    }
  }

  const financingGroups = new Map<string, DocumentRow[]>();
  for (const document of documents.filter(
    (item) => item.is_financing && Number(item.installment_amount ?? 0) > 0,
  )) {
    const key = `${document.category}:${normalize(document.title).replace(/\b(19|20)\d{2}\b/g, "").trim()}`;
    if (key.length < 12) continue;
    financingGroups.set(key, [...(financingGroups.get(key) ?? []), document]);
  }
  for (const [key, group] of financingGroups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    const current = Number(ordered[0].installment_amount ?? 0);
    const previous = Number(ordered[1].installment_amount ?? 0);
    if (current <= previous + 1) continue;
    const difference = current - previous;
    const notification = await createNotification(admin, {
      userId,
      type: "installment_increase",
      severity: "warning",
      title: "La rata è aumentata",
      body: `${ordered[0].title}: +${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(difference)} rispetto al documento precedente.`,
      dedupeKey: `installment-increase:${key}:${ordered[0].id}:${ordered[1].id}`,
      documentId: ordered[0].id,
      metadata: { current, previous, difference },
    });
    if (notification) {
      summary.notifications += 1;
      created.push(notification);
    }
  }

  if (created.length) {
    await logActivity(admin, {
      userId,
      runId,
      actionType: "alerts_created",
      title: `${created.length} nuovi controlli da vedere`,
      detail: "DocuMio ha controllato scadenze, ricevute, duplicati e variazioni delle rate.",
      metadata: { count: created.length },
    });
  }
  return created;
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

async function sendDigest(
  admin: SupabaseAdmin,
  userId: string,
  items: Array<{ title: string; body: string; severity: string }>,
) {
  if (!items.length || !process.env.RESEND_API_KEY || !process.env.REMINDER_EMAIL_FROM) {
    return false;
  }
  const [{ data: preference }, userResult] = await Promise.all([
    admin
      .from("notification_preferences")
      .select("email_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  if (preference?.email_enabled === false || userResult.error) return false;
  const email = userResult.data.user?.email;
  if (!email) return false;

  const cards = items
    .slice(0, 12)
    .map(
      (item) => `<div style="padding:14px;border:1px solid #dbe2ef;border-radius:13px;margin-bottom:10px;background:#f8faff"><strong>${escapeHtml(item.title)}</strong><p style="margin:6px 0 0;color:#526079">${escapeHtml(item.body)}</p></div>`,
    )
    .join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.REMINDER_EMAIL_FROM,
      to: [email],
      subject: `DocuMio: ${items.length} novità dal controllo automatico`,
      html: `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:28px 18px"><div style="background:#302c78;color:white;padding:24px;border-radius:18px 18px 0 0"><h1 style="margin:0">DocuMio</h1><p style="margin:8px 0 0;color:#d9dcff">Controllo automatico giornaliero</p></div><div style="background:white;padding:22px;border-radius:0 0 18px 18px">${cards}<p style="color:#73809a;font-size:13px">Apri DocuMio per controllare il registro completo delle azioni IA.</p></div></div></body></html>`,
    }),
  });
  return response.ok;
}

async function processUser(admin: SupabaseAdmin, preference: PreferenceRow) {
  const userId = preference.user_id;
  const runId = randomUUID();
  const summary: RunSummary = {
    analyzed: 0,
    imported: 0,
    trashed: 0,
    notifications: 0,
    skipped: 0,
    warnings: [],
  };
  const digestItems: Array<{ title: string; body: string; severity: string }> = [];

  try {
    const accessToken = await accessTokenForUser(admin, userId);
    if (!accessToken) {
      summary.warnings.push("Gmail non collegata.");
    } else {
      const messages = await listRecentMessages(accessToken);
      const analyses = await analyzeMessages(messages);
      summary.analyzed = analyses.length;
      if (messages.length && analyses.length === 0) {
        summary.warnings.push("L'analisi IA della posta non ha restituito risultati: nessuna email è stata modificata.");
      }
      const analysisById = new Map(analyses.map((analysis) => [analysis.id, analysis]));
      const enriched = messages.flatMap((message) => {
        const analysis = analysisById.get(message.id);
        return analysis ? [{ ...message, ...analysis }] : [];
      });

      if (preference.import_documents_enabled) {
        const useful = enriched.filter(
          (message) =>
            (message.category === "documenti" || message.category === "pagamenti") &&
            message.importance !== "low" &&
            message.suggestedAction === "review_document",
        );
        digestItems.push(
          ...(await importUsefulAttachments(
            admin,
            userId,
            runId,
            accessToken,
            useful,
            summary,
          )),
        );
      }

      if (preference.trash_promotions_enabled) {
        const candidates = enriched.filter(isSafeTrashCandidate);
        const groups = new Map<string, typeof candidates>();
        for (const message of candidates) {
          const key = senderIdentity(message.from);
          groups.set(key, [...(groups.get(key) ?? []), message]);
        }
        const trashIds = candidates
          .filter(
            (message) =>
              message.category === "pubblicita" ||
              (groups.get(senderIdentity(message.from))?.length ?? 0) >= 2,
          )
          .map((message) => message.id);

        for (const messageId of trashIds) {
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          if (response.ok) summary.trashed += 1;
          else summary.warnings.push(`Email ${messageId} non spostata nel cestino.`);
        }
        if (summary.trashed > 0) {
          await logActivity(admin, {
            userId,
            runId,
            actionType: "gmail_cleanup",
            title: `${summary.trashed} email spostate nel cestino Gmail`,
            detail: "Solo pubblicità o messaggi a basso rischio. Il cestino Gmail resta recuperabile.",
            recoverable: true,
            metadata: { messageIds: trashIds },
          });
        }
      }
    }

    digestItems.push(...(await createDocumentAlerts(admin, userId, runId, summary)));
    if (preference.email_digest_enabled) {
      await sendDigest(admin, userId, digestItems);
    }

    await logActivity(admin, {
      userId,
      runId,
      actionType: "daily_run",
      title: "Controllo automatico giornaliero completato",
      detail: `${summary.analyzed} email analizzate · ${summary.imported} documenti importati · ${summary.trashed} email nel cestino · ${summary.notifications} avvisi.`,
      status: summary.warnings.length ? "warning" : "completed",
      metadata: summary,
    });
    await admin
      .from("automation_preferences")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: summary.warnings.length ? "warning" : "completed",
        last_run_summary: summary,
      })
      .eq("user_id", userId);
    return { userId, ok: true, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore imprevisto.";
    summary.warnings.push(message);
    await logActivity(admin, {
      userId,
      runId,
      actionType: "daily_run",
      title: "Controllo automatico non completato",
      detail: message,
      status: "failed",
      metadata: summary,
    });
    await admin
      .from("automation_preferences")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "failed",
        last_run_summary: summary,
      })
      .eq("user_id", userId);
    return { userId, ok: false, summary };
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Configurazione Supabase incompleta." }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: preferences, error } = await admin
    .from("automation_preferences")
    .select(
      "user_id,ui_mode,daily_email_enabled,trash_promotions_enabled,import_documents_enabled,email_digest_enabled,timezone,last_run_at",
    )
    .eq("ui_mode", "advanced")
    .eq("daily_email_enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(MAX_USERS_PER_RUN);

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message.includes("automation_preferences")
            ? "Applica prima la migrazione SQL dell'automazione giornaliera."
            : error.message,
      },
      { status: 500 },
    );
  }

  const results = [];
  for (const preference of (preferences ?? []) as PreferenceRow[]) {
    results.push(await processUser(admin, preference));
  }

  return NextResponse.json({
    ok: results.every((item) => item.ok),
    processed: results.length,
    results,
  });
}
