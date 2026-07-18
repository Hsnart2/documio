import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PreferenceRow = {
  user_id: string;
  email_enabled: boolean | null;
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

type Reminder = {
  title: string;
  message: string;
  dueDate: string;
};

const DAY_MS = 86_400_000;

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
          title: `Rata: ${document.title}`,
          message: `Rata ${paid + 1}/${document.installment_count} da ${amount}: ${timing(days, false)}.`,
          dueDate,
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
      title: `${appointment ? "Appuntamento" : "Scadenza"}: ${document.title}`,
      message: `${document.title}${time}: ${timing(days, appointment)}.`,
      dueDate: document.expiry_date,
    });
  }

  return reminders;
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

  if (!supabaseUrl || !supabaseSecret || !resendKey || !emailFrom) {
    return NextResponse.json(
      { error: "Missing server environment variables" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const today = romeDate();

  const { data: preferences, error: preferenceError } = await supabase
    .from("notification_preferences")
    .select("user_id, email_enabled")
    .eq("email_enabled", true);

  if (preferenceError) {
    return NextResponse.json({ error: preferenceError.message }, { status: 500 });
  }

  const enabledUsers = (preferences ?? []) as PreferenceRow[];
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const preference of enabledUsers) {
    const { data: previous } = await supabase
      .from("email_notification_deliveries")
      .select("id")
      .eq("user_id", preference.user_id)
      .eq("delivery_date", today)
      .maybeSingle();

    if (previous) {
      skipped += 1;
      continue;
    }

    const [{ data: documents, error: documentError }, userResult] =
      await Promise.all([
        supabase
          .from("documents")
          .select(
            "id,user_id,title,category,expiry_date,appointment_time,appointment_completed_at,reminder_snoozed_until,payment_status,installment_count,installment_amount,first_installment_date,is_financing,paid_installments",
          )
          .eq("user_id", preference.user_id),
        supabase.auth.admin.getUserById(preference.user_id),
      ]);

    if (documentError || userResult.error) {
      errors.push(documentError?.message ?? userResult.error?.message ?? "User error");
      continue;
    }

    const email = userResult.data.user?.email;
    if (!email) continue;

    const reminders = ((documents ?? []) as DocumentRow[])
      .flatMap((document) => remindersFor(document, today))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (reminders.length === 0) {
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
        user_id: preference.user_id,
        delivery_date: today,
        reminder_count: reminders.length,
      });

    if (deliveryError) {
      errors.push(deliveryError.message);
      continue;
    }

    sent += 1;
  }

  return NextResponse.json({ ok: errors.length === 0, sent, skipped, errors });
}
