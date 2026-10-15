import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Open Banking SOLO lettura. Non vengono gestite credenziali bancarie,
// disposti bonifici né memorizzati password/IBAN in chiaro.
const API = "https://bankaccountdata.gocardless.com/api/v2";

type BankConnection = {
  id: string;
  institution_name: string;
  requisition_id: string;
  consent_status: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
function configured() {
  return Boolean(process.env.GOCARDLESS_BAS_SECRET_ID && process.env.GOCARDLESS_BAS_SECRET_KEY);
}
function safeInstitution(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{2,100}$/.test(value);
}
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function sessionToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}
async function auth(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const role = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const bearer = sessionToken(request);
  if (!url || !key || !role || !bearer) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await client.auth.getUser(bearer);
  if (error || !user) return null;
  const admin = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId: user.id, admin };
}
async function provider<T>(path: string, jwt: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(18000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  if (response.status === 204) return {} as T;
  return await response.json() as T;
}
async function providerJwt() {
  const result = await fetch(API + "/token/new/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_BAS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_BAS_SECRET_KEY,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(18000),
  });
  if (!result.ok) throw new Error(`Provider auth ${result.status}`);
  // GoCardless /token/new/ restituisce il refresh token, non l'access token.
  // La seconda chiamata è obbligatoria prima di interrogare le banche.
  const body = await result.json() as { refresh?: string; access?: string };
  if (body.access) return body.access;
  if (!body.refresh) throw new Error("Refresh token provider mancante");
  const refreshed = await fetch(API + "/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh: body.refresh }),
    cache: "no-store",
    signal: AbortSignal.timeout(18000),
  });
  if (!refreshed.ok) throw new Error(`Provider refresh ${refreshed.status}`);
  const refreshedBody = await refreshed.json() as { access?: string };
  if (!refreshedBody.access) throw new Error("Access token provider mancante");
  return refreshedBody.access;
}
function connectedUrl() {
  const value = process.env.DOCUMIO_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("DOCUMIO_APP_URL non configurato");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("URL applicazione non valido");
  return url.origin + "/controllo?bank_return=1";
}
function textField(value: unknown, limit = 300) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function providerStatus(raw: unknown) {
  if (raw === "LN") return "linked";
  if (raw === "EX") return "expired";
  if (raw === "RJ") return "rejected";
  return "pending";
}
function bookingRows(
  userId: string,
  connectionId: string,
  accountId: string,
  movements: unknown[],
) {
  const repetitions = new Map<string, number>();
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of movements.slice(0, 2000)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, any>;
    const booking = textField(item.bookingDate ?? item.valueDate, 20);
    const value = item.transactionAmount as { amount?: string; currency?: string } | undefined;
    const amount = Number(value?.amount);
    const currency = textField(value?.currency ?? "EUR", 3).toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking) || !Number.isFinite(amount)
      || amount === 0 || !/^[A-Z]{3}$/.test(currency)) continue;
    const counterparty = textField(
      amount > 0 ? item.debtorName ?? item.creditorName : item.creditorName ?? item.debtorName,
      220,
    );
    const description = textField(
      item.remittanceInformationUnstructured ??
      (Array.isArray(item.remittanceInformationUnstructuredArray)
        ? item.remittanceInformationUnstructuredArray.join(" ")
        : "") ?? item.additionalInformation ?? "",
      1500,
    ) || textField(item.additionalInformation, 1500);
    const stable = [accountId, textField(item.transactionId || item.internalTransactionId),
      booking, amount.toFixed(2), currency, description, counterparty].join("|");
    const occurrence = (repetitions.get(stable) ?? 0) + 1;
    repetitions.set(stable, occurrence);
    rows.push({
      user_id: userId,
      bank_connection_id: connectionId,
      source: "gocardless",
      account_label: `Conto ${accountId.slice(0, 8)}`,
      booking_date: booking,
      amount: Math.round(amount * 100) / 100,
      currency,
      description,
      counterparty,
      import_key: "gocardless:" + hash(stable + "|" + occurrence),
    });
  }
  return rows;
}

export async function GET(request: Request) {
  const access = await auth(request);
  if (!access) return json({ error: "Accedi a DocuMio per vedere i tuoi conti." }, 401);
  const url = new URL(request.url);
  if (url.searchParams.get("view") === "institutions") {
    if (!configured()) return json({ institutions: [], enabled: false, error: "Provider bancario non configurato." });
    try {
      const jwt = await providerJwt();
      const banks = await provider<Array<{ id: string; name: string }>>(
        "/institutions/?country=IT", jwt,
      );
      return json({
        enabled: true,
        institutions: banks
          .filter((bank) => safeInstitution(bank.id) && typeof bank.name === "string")
          .map((bank) => ({ id: bank.id, name: bank.name })).sort((a,b) => a.name.localeCompare(b.name)),
      });
    } catch (error) {
      console.error("Open Banking institutions:", error instanceof Error ? error.message : "Unknown");
      return json({ institutions: [], enabled: false, error: "Elenco banche temporaneamente non disponibile." }, 503);
    }
  }
  const { data, error } = await access.admin
    .from("financial_bank_connections")
    .select("id,institution_name,consent_status,last_sync_at,balances,created_at")
    .eq("user_id", access.userId)
    .order("created_at", { ascending: false });
  if (error) return json({ error: "Applica la migrazione SQL del Centro di controllo." }, 503);
  return json({ enabled: configured(), connections: data ?? [] });
}

export async function POST(request: Request) {
  const access = await auth(request);
  if (!access) return json({ error: "Sessione scaduta: accedi di nuovo." }, 401);
  const body = await request.json().catch(() => null) as
    { action?: string; institutionId?: string; connectionId?: string } | null;
  if (!body || !["connect","sync","disconnect"].includes(body.action ?? ""))
    return json({ error: "Operazione non valida." }, 400);
  if (!configured()) return json({ error: "Open Banking non ancora configurato dal gestore." }, 503);
  try {
    const jwt = await providerJwt();
    if (body.action === "connect") {
      if (!safeInstitution(body.institutionId)) return json({ error: "Banca non valida." }, 400);
      const institutions = await provider<Array<{id:string;name:string}>>(
        "/institutions/?country=IT", jwt,
      );
      const bank = institutions.find((item) => item.id === body.institutionId);
      if (!bank) return json({ error: "Banca non disponibile in Italia." }, 400);
      const redirect = connectedUrl();
      const reference = hash(`${access.userId}:${crypto.randomUUID()}`).slice(0, 40);
      const consent = await provider<{ id: string; link: string }>(
        "/requisitions/", jwt, "POST", {
          redirect, institution_id: bank.id, reference, user_language: "IT",
        },
      );
      if (!consent.id || !consent.link.startsWith("https://ob.gocardless.com/"))
        return json({ error: "Link di consenso bancario non valido." }, 502);
      const { error } = await access.admin.from("financial_bank_connections").insert({
        user_id: access.userId,
        institution_name: bank.name,
        institution_id: bank.id,
        requisition_id: consent.id,
        consent_status: "pending",
      });
      if (error) throw new Error("Persistenza consenso fallita");
      return json({ url: consent.link });
    }
    const connectionId = textField(body.connectionId, 50);
    if (!/^[a-f0-9-]{36}$/i.test(connectionId)) return json({ error: "Connessione non valida." }, 400);
    const { data: connection, error } = await access.admin.from("financial_bank_connections")
      .select("id,institution_name,requisition_id,consent_status")
      .eq("user_id", access.userId).eq("id", connectionId).maybeSingle();
    if (error || !connection) return json({ error: "Connessione non trovata." }, 404);
    const record = connection as BankConnection;
    if (body.action === "disconnect") {
      // La revoca è effettuata prima presso il provider. La cancellazione locale
      // rimuove in cascata movimenti bancari e abbinamenti di quel collegamento.
      await provider<Record<string, never>>(
        `/requisitions/${encodeURIComponent(record.requisition_id)}/`, jwt, "DELETE",
      );
      const { error: deletionError } = await access.admin.from("financial_bank_connections")
        .delete().eq("user_id", access.userId).eq("id", connectionId);
      if (deletionError) throw new Error("Eliminazione dati bancari fallita");
      return json({ removed: true });
    }
    const requisition = await provider<{ status: string; accounts?: string[] }>(
      `/requisitions/${encodeURIComponent(record.requisition_id)}/`, jwt,
    );
    const status = providerStatus(requisition.status);
    await access.admin.from("financial_bank_connections").update({ consent_status: status })
      .eq("user_id", access.userId).eq("id", connectionId);
    if (status !== "linked") {
      return json({ imported: 0, status, message: status === "expired"
        ? "Consenso scaduto: occorre ricollegare la banca."
        : "Completa l'autorizzazione nella tua banca prima di sincronizzare." });
    }
    const accounts = (requisition.accounts ?? []).filter((id) => /^[a-f0-9-]{36}$/i.test(id)).slice(0, 15);
    let imported = 0;
    const warnings: string[] = [];
    // Solo riepilogo, nessun IBAN completo o titolare del conto salvato.
    const bankBalances: Array<{
      accountLabel: string;
      amount: number;
      currency: string;
      balanceType: string;
      referenceDate: string;
    }> = [];
    for (const accountId of accounts) {
      try {
        const result = await provider<{ transactions?: { booked?: unknown[] } }>(
          `/accounts/${encodeURIComponent(accountId)}/transactions/`, jwt,
        );
        const rows = bookingRows(access.userId, connectionId, accountId,
          result.transactions?.booked ?? []);
        for (let i = 0; i < rows.length; i += 100) {
          const { data, error: insertError } = await access.admin
            .from("financial_transactions")
            .upsert(rows.slice(i, i + 100), { onConflict: "user_id,import_key", ignoreDuplicates: true })
            .select("id");
          if (insertError) throw new Error("Importazione movimenti fallita");
          imported += data?.length ?? 0;
        }
      } catch (error) {
        console.error("Open Banking account sync:", error instanceof Error ? error.message : "Unknown");
        warnings.push("Un conto non è stato aggiornato.");
      }
      // Alcuni istituti non espongono i saldi PSD2: la disponibilità
      // di questa informazione non deve bloccare l'import dei movimenti.
      try {
        const result = await provider<{ balances?: Array<{
          balanceAmount?: { amount?: string; currency?: string };
          balanceType?: string;
          referenceDate?: string;
          lastChangeDateTime?: string;
        }> }>(
          `/accounts/${encodeURIComponent(accountId)}/balances/`, jwt,
        );
        const priority = [
          "interimAvailable","closingAvailable","interimBooked",
          "closingBooked","expected","openingBooked",
        ];
        const candidates = (result.balances ?? []).filter((item) =>
          item.balanceAmount && Number.isFinite(Number(item.balanceAmount.amount)) &&
          typeof item.balanceAmount.currency === "string" &&
          /^[A-Z]{3}$/.test(item.balanceAmount.currency),
        );
        candidates.sort((a,b) => {
          const left = priority.indexOf(a.balanceType ?? "");
          const right = priority.indexOf(b.balanceType ?? "");
          return (left < 0 ? 50 : left) - (right < 0 ? 50 : right);
        });
        const selected = candidates[0];
        if (selected?.balanceAmount) {
          bankBalances.push({
            accountLabel: `Conto ${accountId.slice(0,8)}`,
            amount: Math.round(Number(selected.balanceAmount.amount) * 100) / 100,
            currency: selected.balanceAmount.currency!,
            balanceType: selected.balanceType ?? "non specificato",
            referenceDate: selected.referenceDate ??
              selected.lastChangeDateTime ?? new Date().toISOString(),
          });
        }
      } catch {
        // Assenza di saldo non implica che il consenso ai movimenti sia invalido.
      }
    }
    if (warnings.length === 0) {
      const { error: updateError } = await access.admin.from("financial_bank_connections")
        .update({
          consent_status: "linked",
          last_sync_at: new Date().toISOString(),
          ...(bankBalances.length ? { balances: bankBalances } : {}),
        })
        .eq("user_id", access.userId).eq("id", connectionId);
      if (updateError) warnings.push("Impossibile aggiornare lo stato di sincronizzazione.");
    }
    return json({ imported, balancesAvailable: bankBalances.length, status: "linked", warnings });
  } catch (error) {
    console.error("Open Banking operation:", error instanceof Error ? error.message : "Unknown");
    return json({ error: "Operazione bancaria non riuscita. Controlla configurazione e autorizzazione." }, 502);
  }
}
