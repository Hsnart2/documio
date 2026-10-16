import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  claimDocumentAIJob, getDocumentAIAdmin, processClaimedDocumentAI,
} from "@/lib/document-ai-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

function token(request: Request) {
  return request.headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

/** Anche le query PostgREST devono usare il JWT verificato: senza questo
 * header Supabase considera le SELECT come ruolo anon (403 per le tabelle RLS).
 */
function userClient(url: string, anon: string, jwt: string) {
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request) {
  // Non rivela se altre persone usano la funzione o hanno file in coda.
  const jwt = token(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!jwt || !url || !anon) return response({ available: false }, 401);
  const client = userClient(url, anon, jwt);
  const { data: { user }, error } = await client.auth.getUser(jwt);
  if (error || !user) return response({ available: false }, 401);
  const [documentFields, jobs] = await Promise.all([
    client.from("documents").select("id,ai_status").eq("user_id", user.id).limit(1),
    client.from("document_ai_jobs").select("id").eq("user_id", user.id).limit(1),
  ]);
  return response({ available: !documentFields.error && !jobs.error });
}

export async function POST(request: Request) {
  const jwt = token(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = getDocumentAIAdmin();
  if (!jwt || !url || !anon || !admin)
    return response({ error: "Sessione o configurazione non disponibile." }, 401);
  const client = userClient(url, anon, jwt);
  const { data: { user }, error } = await client.auth.getUser(jwt);
  if (error || !user) return response({ error: "Accesso non autorizzato." }, 401);

  const payload = await request.json().catch(() => null) as
    { documentId?: unknown } | null;
  const documentId = payload?.documentId;
  if (typeof documentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId))
    return response({ error: "Documento non valido." }, 400);

  const { data: doc, error: docError } = await client.from("documents")
    .select("id,ai_status").eq("id",documentId)
    .eq("user_id",user.id).maybeSingle();
  if (docError) return response({ error: "Archivio AI non ancora attivo." }, 503);
  if (!doc) return response({ error: "Documento non trovato." }, 404);
  if (!["queued","processing","failed"].includes(doc.ai_status))
    return response({ status: doc.ai_status });

  try {
    const claimed = await claimDocumentAIJob(admin, documentId);
    if (!claimed) return response({ status: "pending", message: "Analisi gia' in corso o in riprogrammazione." }, 202);
    // Durable DB queue: the response does not wait for the model. after()
    // extends the function lifetime, while lease+cron recover interrupted jobs.
    after(async () => {
      await processClaimedDocumentAI(claimed, admin);
    });
    return response({ status: "processing", documentId }, 202);
  } catch (error) {
    console.error("DocuMio queue startup:", error instanceof Error ? error.message : "Errore");
    return response({ error: "Accodamento AI non disponibile." }, 503);
  }
}
