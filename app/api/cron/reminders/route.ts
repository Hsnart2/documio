import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendPendingPushNotifications } from "@/lib/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type PreferenceRow = {
  user_id: string;
  email_enabled: boolean | null;
};

type PushUserRow = {
  user_id: string;
};

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  expiry_date: string | null;
  appointment_time: string | null;
  appointment_completed_at: string | null;
  reminder_snoozed_until: string | null;
  payment_status: string | null;
  installment_count: number | null;
  installment_amount: number | null;
  first_installment_date: string | null;
  is_financing: boolean | null;
  paid_installments: number | null;
};

type ReminderKind = "installment" | "appointment" | "deadline" | "invoice" | "financial_deadline";

type Reminder = {
  documentId: string | null;
  recordKey?: string;
  kind: ReminderKind;
  title: string;
  message: string;
  dueDate: string;
  days: number;
};

const DAY_MS = 86_400_000;
const PUSH_MILESTONES = new Set([30, 14, 7, 1, 0, -1, -7]);

function romeDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBetween(today: string, dueDate: string) {
  return Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
}

function addMonths(date: string, months: number) {
  const source = new Date(`${date}T00:00:00Z`);
  const day = source.getUTCDate();
  const target = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function isAppointment(document: DocumentRow) {
  return ["Appuntamenti", "Visite mediche"].includes(document.category);
}

function timing(days: number, appointment: boolean) {
  if (days < 0) {
    return appointment
      ? `era ${Math.abs(days)} giorni fa`
      : `è scaduto da ${Math.abs(days)} giorni`;
  }
  if (days === 0) return appointment ? "è oggi" : "scade oggi";
  if (days === 1) return appointment ? "è domani" : "scade domani";
  return appointment ? `è tra ${days} giorni` : `scade tra ${days} giorni`;
}

function remindersFor(document: DocumentRow, today: string): Reminder[] {
  const reminders: Reminder[] = [];
  const status = document.payment_status ?? "Da pagare";

  if (
    document.is_financing &&
    document.first_installment_date &&
    document.installment_count &&
    document.installment_amount &&
    !["Pagato", "Contestato"].includes(status)
  ) {
    const paid = Math.max(0, Number(document.paid_installments) || 0);
    if (paid < document.installment_count) {
      const dueDate = addMonths(document.first_installment_date, paid);
      const days = daysBetween(today, dueDate);
      if (days <= 30) {
        const amount = new Intl.NumberFormat("it-IT", {
          style: "currency",
          currency: "EUR",
        }).format(document.installment_amount);
        reminders.push({
          documentId: document.id,
          kind: "installment",
          title: `Rata: ${document.title}`,
          message: `Rata ${paid + 1}/${document.installment_count} da ${amount}: ${timing(days, false)}.`,
          dueDate,
          days,
        });
      }
    }
  }

  if (!document.expiry_date) return reminders;

  const appointment = isAppointment(document);
  if (appointment && document.appointment_completed_at) return reminders;
  if (
    appointment &&
    document.reminder_snoozed_until &&
    Date.parse(document.reminder_snoozed_until) > Date.now()
  ) {
    return reminders;
  }
  if (!appointment && ["Pagato", "Contestato"].includes(status)) {
    return reminders;
  }

  const days = daysBetween(today, document.expiry_date);
  if (days <= 30) {
    const time =
      appointment && document.appointment_time
        ? ` alle ${String(document.appointment_time).slice(0, 5)}`
        : "";
    reminders.push({
      documentId: document.id,
      kind: appointment ? "appointment" : "deadline",
      title: `${appointment ? "Appuntamento" : "Scadenza"}: ${document.title}`,
      message: `${document.title}${time}: ${timing(days, appointment)}.`,
      dueDate: document.expiry_date,
      days,
    });
  }

  return reminders;
}

type FinanceInvoiceRow = {
  id: string;
  document_id: string | null;
  direction: "income" | "expense";
  amount: number | string;
  currency: string;
  counterparty: string;
  invoice_number: string;
  due_date: string | null;
};
type FinanceMatchRow = { invoice_id: string; allocated_amount: number | string };
type FinanceDeadlineRow = {
  id: string;
  category: string;
  title: string;
  amount: number | string | null;
  due_date: string;
  status: string;
};
const FINANCE_MILESTONES = new Set([30, 14, 7, 1, 0, -1, -7]);

function financeMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("it-IT", {
    style: "currency", currency: currency || "EUR",
  }).format(value); }
  catch { return `${value.toFixed(2)} ${currency || "EUR"}`; }
}

// Le promesse di incasso non sono dichiarate "pagate" finché non sono
// collegate a movimenti bancari confermati. Le scadenze generiche si basano
// esclusivamente sulle informazioni registrate dall'utente.
function financeReminders(
  invoices: FinanceInvoiceRow[],
  matches: FinanceMatchRow[],
  deadlines: FinanceDeadlineRow[],
  today: string,
): Reminder[] {
  const paid = new Map<string, number>();
  for (const item of matches) paid.set(item.invoice_id,
    (paid.get(item.invoice_id) ?? 0) + Math.max(0, Number(item.allocated_amount) || 0));
  const result: Reminder[] = [];
  for (const row of invoices) {
    if (!row.due_date) continue;
    const remaining = Math.max(0, Number(row.amount) - (paid.get(row.id) ?? 0));
    if (!Number.isFinite(remaining) || remaining <= 0.01) continue;
    const days = daysBetween(today, row.due_date);
    if (!FINANCE_MILESTONES.has(days)) continue;
    const outgoing = row.direction === "expense";
    result.push({
      documentId: null, recordKey: `invoice:${row.id}`, kind: "invoice",
      title: `${outgoing ? "Da pagare" : "Da incassare"}: ${row.counterparty}`,
      message: `Fattura ${row.invoice_number}, residuo ${financeMoney(remaining,row.currency)}: ${timing(days,false)}. Verifica la riconciliazione in DocuMio prima di agire.`,
      dueDate: row.due_date, days,
    });
  }
  for (const item of deadlines) {
    if (item.status !== "open") continue;
    const days = daysBetween(today, item.due_date);
    if (!FINANCE_MILESTONES.has(days)) continue;
    const amount = item.amount === null ? "" : ` · ${financeMoney(Number(item.amount),"EUR")}`;
    result.push({
      documentId: null, recordKey: `deadline:${item.id}`, kind: "financial_deadline",
      title: `Scadenza ${item.category}: ${item.title}`,
      message: `${item.title}${amount}: ${timing(days,false)}. Controlla la fonte ufficiale e il pagamento.`,
      dueDate: item.due_date, days,
    });
  }
  return result;
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

function emailHtml(reminders: Reminder[]) {
  const items = reminders
    .map(
      (item) => `
        <div style="margin:0 0 12px;padding:16px;border:1px solid #dbe2ef;border-radius:14px;background:#f8faff">
          <strong style="color:#131a2d">${escapeHtml(item.title)}</strong>
          <p style="margin:8px 0 0;color:#4f5d75">${escapeHtml(item.message)}</p>
        </div>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px">
      <div style="background:#302c78;color:white;padding:24px;border-radius:18px 18px 0 0">
        <h1 style="margin:0;font-size:26px">DocuMio</h1>
        <p style="margin:8px 0 0;color:#d9dcff">I tuoi prossimi promemoria</p>
      </div>
      <div style="background:white;padding:22px;border-radius:0 0 18px 18px">
        ${items}
        <p style="margin:20px 0 0;color:#73809a;font-size:13px">Puoi modificare gli avvisi nelle impostazioni di DocuMio.</p>
      </div>
    </div>
  </body></html>`;
}

function pushNotificationFor(userId: string, reminder: Reminder) {
  const severity = reminder.days <= 1 ? "urgent" : reminder.days <= 7 ? "warning" : "info";
  return {
    user_id: userId,
    type: `${reminder.kind}_reminder`,
    severity,
    title: reminder.title,
    body: reminder.message,
    document_id: reminder.documentId,
    dedupe_key: reminder.recordKey
      ? `finance-reminder:${reminder.recordKey}:${reminder.dueDate}:d${reminder.days}`
      : `scheduled-reminder:${reminder.documentId}:${reminder.dueDate}:d${reminder.days}`,
    metadata: {
      dueDate: reminder.dueDate,
      days: reminder.days,
      reminderKind: reminder.kind,
      source: "reminders-cron",
      destination: reminder.recordKey ? "/controllo" : "/",
      recordKey: reminder.recordKey ?? null,
    },
  };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.REMINDER_EMAIL_FROM;

  if (!supabaseUrl || !supabaseSecret) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const today = romeDate();

  const [preferenceResult, pushUserResult] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("user_id, email_enabled")
      .eq("email_enabled", true),
    supabase
      .from("push_subscriptions")
      .select("user_id")
      .eq("enabled", true),
  ]);

  if (preferenceResult.error || pushUserResult.error) {
    return NextResponse.json(
      {
        error:
          preferenceResult.error?.message ??
          pushUserResult.error?.message ??
          "Unable to load notification users",
      },
      { status: 500 },
    );
  }

  const emailUsers = new Set(
    ((preferenceResult.data ?? []) as PreferenceRow[]).map((item) => item.user_id),
  );
  const pushUsers = new Set(
    ((pushUserResult.data ?? []) as PushUserRow[]).map((item) => item.user_id),
  );
  const userIds = Array.from(new Set([...emailUsers, ...pushUsers]));

  let sent = 0;
  let skipped = 0;
  let createdPushNotifications = 0;
  let pushDeliveries = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    const { data: documents, error: documentError } = await supabase
      .from("documents")
      .select(
        "id,user_id,title,category,expiry_date,appointment_time,appointment_completed_at,reminder_snoozed_until,payment_status,installment_count,installment_amount,first_installment_date,is_financing,paid_installments",
      )
      .eq("user_id", userId);

    if (documentError) {
      errors.push(documentError.message);
      continue;
    }

    // Facoltativo durante la migrazione: se le nuove tabelle non esistono,
    // i vecchi promemoria documentali continuano a funzionare normalmente.
    const [invoiceResult, matchResult, deadlineResult] = await Promise.all([
      supabase.from("financial_invoices")
        .select("id,document_id,direction,amount,currency,counterparty,invoice_number,due_date")
        .eq("user_id", userId).limit(2000),
      supabase.from("financial_matches").select("invoice_id,allocated_amount")
        .eq("user_id", userId).limit(4000),
      supabase.from("financial_deadlines")
        .select("id,category,title,amount,due_date,status")
        .eq("user_id", userId).eq("status", "open").limit(2000),
    ]);
    const financeAvailable = !invoiceResult.error && !matchResult.error && !deadlineResult.error;
    const financeInvoices = financeAvailable
      ? (invoiceResult.data ?? []) as FinanceInvoiceRow[] : [];
    const linkedDocuments = new Set(financeInvoices.map((invoice) => invoice.document_id).filter(Boolean));
    const fromDocuments = ((documents ?? []) as DocumentRow[])
      .filter((document) => !linkedDocuments.has(document.id))
      .flatMap((document) => remindersFor(document, today));
    const fromFinance = financeAvailable
      ? financeReminders(financeInvoices,
          (matchResult.data ?? []) as FinanceMatchRow[],
          (deadlineResult.data ?? []) as FinanceDeadlineRow[],
          today)
      : [];
    const reminders = [...fromDocuments, ...fromFinance]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const pushRows = reminders
      .filter((reminder) => PUSH_MILESTONES.has(reminder.days))
      .map((reminder) => pushNotificationFor(userId, reminder));

    if (pushRows.length) {
      const { data: inserted, error: notificationError } = await supabase
        .from("automation_notifications")
        .upsert(pushRows, {
          onConflict: "user_id,dedupe_key",
          ignoreDuplicates: true,
        })
        .select("id");

      if (notificationError) errors.push(notificationError.message);
      else createdPushNotifications += inserted?.length ?? 0;
    }

    const pushResult = await sendPendingPushNotifications(supabase, userId);
    pushDeliveries += pushResult.deviceDeliveries;
    if (pushResult.errors.length) {
      errors.push(...pushResult.errors.map((message) => `Push: ${message}`));
    }

    if (!emailUsers.has(userId)) continue;

    if (!resendKey || !emailFrom) {
      errors.push("Variabili email dei promemoria mancanti.");
      continue;
    }

    const { data: previous, error: previousError } = await supabase
      .from("email_notification_deliveries")
      .select("id")
      .eq("user_id", userId)
      .eq("delivery_date", today)
      .maybeSingle();

    if (previousError) {
      errors.push(previousError.message);
      continue;
    }
    if (previous) {
      skipped += 1;
      continue;
    }
    if (reminders.length === 0) {
      skipped += 1;
      continue;
    }

    const userResult = await supabase.auth.admin.getUserById(userId);
    if (userResult.error) {
      errors.push(userResult.error.message);
      continue;
    }

    const email = userResult.data.user?.email;
    if (!email) {
      skipped += 1;
      continue;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject: `DocuMio: ${reminders.length} promemoria`,
        html: emailHtml(reminders),
      }),
    });

    if (!response.ok) {
      errors.push(`Resend ${response.status}: ${await response.text()}`);
      continue;
    }

    const { error: deliveryError } = await supabase
      .from("email_notification_deliveries")
      .insert({
        user_id: userId,
        delivery_date: today,
        reminder_count: reminders.length,
      });

    if (deliveryError) {
      errors.push(deliveryError.message);
      continue;
    }

    sent += 1;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    sent,
    skipped,
    createdPushNotifications,
    pushDeliveries,
    errors,
  });
}
