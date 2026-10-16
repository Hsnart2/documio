import { NextResponse } from "next/server";
import { authenticatedUser, verifiedOwner } from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status, headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Authorization",
    },
  });
}

function integrations() {
  const configured = (keys: string[]) => keys.every((key) =>
    Boolean(process.env[key]?.trim()));
  return [
    { id: "openai", name: "OpenAI", type: "AI", configured: configured(["OPENAI_API_KEY"]), detail: "Analisi documenti e assistente" },
    { id: "supabase", name: "Supabase", type: "Archivio", configured: configured(["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]), detail: "Database, autenticazione e file" },
    { id: "vercel", name: "Vercel", type: "Hosting", configured: Boolean(process.env.VERCEL), detail: "Distribuzione dell'applicazione" },
    { id: "gmail", name: "Google Gmail", type: "Posta", configured: configured(["GOOGLE_EMAIL_CLIENT_ID","GOOGLE_EMAIL_CLIENT_SECRET"]), detail: "Collegamento account email" },
    { id: "resend", name: "Resend", type: "Notifiche", configured: configured(["RESEND_API_KEY"]), detail: "Invio email e promemoria" },
    { id: "gocardless", name: "GoCardless", type: "Banche", configured: configured(["GOCARDLESS_BAS_SECRET_ID","GOCARDLESS_BAS_SECRET_KEY"]), detail: "Open banking PSD2" },
    { id: "ilovepdf", name: "iLovePDF", type: "Documenti", configured: configured(["ILOVEPDF_PUBLIC_KEY"]), detail: "Strumenti PDF" },
    { id: "webpush", name: "Notifiche push", type: "Notifiche", configured: configured(["VAPID_PRIVATE_KEY","NEXT_PUBLIC_VAPID_PUBLIC_KEY"]), detail: "Notifiche browser" },
    { id: "cron", name: "Operazioni pianificate", type: "Sistema", configured: configured(["CRON_SECRET"]), detail: "Manutenzione e automazioni" },
  ];
}

export async function GET(request: Request) {
  const access = await authenticatedUser(request);
  if (!access) return reply({ error: "Accedi prima a DocuMio." }, 401);
  if (!verifiedOwner(access.user))
    return reply({ error: "Accesso consentito solo all'account Owner verificato." }, 403);

  const params = new URL(request.url).searchParams;
  const days = Number(params.get("days") ?? "30");
  const period = [7,30,90].includes(days) ? days : 30;
  const { data, error } = await access.client.rpc("documio_owner_overview", {
    p_days: period,
  });
  if (error || !data) {
    console.error("DocuMio owner overview: interrogazione non disponibile.", error?.code);
    return reply({ error: "Statistiche non disponibili. Controllare la migrazione Owner." }, 503);
  }
  return reply({
    ...data,
    integrations: integrations(),
    notes: {
      api: "Token e chiamate misurati solo dalle integrazioni strumentate dopo l'attivazione; non equivalgono ai costi fatturati.",
      storage: "Somma delle dimensioni dichiarate nelle schede documento; non include overhead e copie Storage esterne.",
      active: "Utenti unici che hanno aperto DocuMio con una sessione valida dal momento dell'attivazione del monitoraggio.",
    },
  });
}
