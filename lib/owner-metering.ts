// Contabilizza solo metadati delle chiamate, mai richieste, prompt o documenti.
// I token sono riportati dal provider: non sono un addebito effettivo.
import type { SupabaseClient } from "@supabase/supabase-js";

type Usage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  input_tokens_details?: { cached_tokens?: unknown } | null;
} | null | undefined;

function safeToken(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0
    ? Math.min(Math.floor(n), 2147483647) : 0;
}

export async function recordOpenAIUsage(
  admin: SupabaseClient,
  details: {
    userId: string;
    companyId?: string | null;
    feature: string;
    model: string;
    ok: boolean;
    usage?: Usage;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("documio_owner_api_usage").insert({
      user_id: details.userId,
      company_id: details.companyId ?? null,
      provider: "openai",
      feature: details.feature.slice(0, 80),
      model: details.model.slice(0, 80),
      status: details.ok ? "success" : "error",
      input_tokens: safeToken(details.usage?.input_tokens),
      output_tokens: safeToken(details.usage?.output_tokens),
      cached_input_tokens: safeToken(details.usage?.input_tokens_details?.cached_tokens),
    });
    if (error) console.warn("DocuMio metering: evento non salvato.");
  } catch {
    // Un errore nel contatore non deve compromettere l'analisi richiesta.
    console.warn("DocuMio metering: salvataggio non disponibile.");
  }
}
