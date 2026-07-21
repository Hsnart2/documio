import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isOwnedStoragePath(userId: string, path: unknown): path is string {
  return typeof path === "string" && path.startsWith(`${userId}/`);
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configurazione Supabase incompleta." },
        { status: 500 },
      );
    }

    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token di accesso mancante." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : "";

    if (!documentId) {
      return NextResponse.json(
        { error: "ID documento mancante." },
        { status: 400 },
      );
    }

    const supabaseAuth = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sessione non valida." },
        { status: 401 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: document, error: documentError } = await supabaseAdmin
      .from("documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (documentError) {
      throw new Error(`Errore lettura documento: ${documentError.message}`);
    }

    if (!document) {
      return NextResponse.json(
        { error: "Documento non trovato." },
        { status: 404 },
      );
    }

    const { data: attachmentRows, error: attachmentsError } = await supabaseAdmin
      .from("document_attachments")
      .select("id, storage_path")
      .eq("document_id", documentId)
      .eq("user_id", user.id);

    if (attachmentsError) {
      throw new Error(`Errore lettura allegati: ${attachmentsError.message}`);
    }

    const candidatePaths = [
      document.storage_path,
      ...(attachmentRows ?? []).map((item) => item.storage_path),
    ];

    const unsafePath = candidatePaths.find(
      (path) => path != null && !isOwnedStoragePath(user.id, path),
    );

    if (unsafePath) {
      console.error("Blocked unsafe storage path during document deletion", {
        userId: user.id,
        documentId,
      });
      return NextResponse.json(
        { error: "Percorso Storage non valido. Eliminazione bloccata." },
        { status: 409 },
      );
    }

    const { error: attachmentsDeleteError } = await supabaseAdmin
      .from("document_attachments")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", user.id);

    if (attachmentsDeleteError) {
      throw new Error(
        `Errore eliminazione allegati: ${attachmentsDeleteError.message}`,
      );
    }

    const { data: deletedDocuments, error: documentDeleteError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", user.id)
      .select("id");

    if (documentDeleteError) {
      throw new Error(
        `Errore eliminazione documento: ${documentDeleteError.message}`,
      );
    }

    if (!deletedDocuments?.length) {
      return NextResponse.json(
        { error: "Documento non eliminato." },
        { status: 409 },
      );
    }

    const storagePaths = Array.from(
      new Set(candidatePaths.filter((path): path is string => Boolean(path))),
    );

    let storageCleanupPending = false;
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("documents")
        .remove(storagePaths);

      if (storageError) {
        storageCleanupPending = true;
        console.error("Document storage cleanup failed", {
          userId: user.id,
          documentId,
          message: storageError.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      storageCleanupPending,
    });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Eliminazione documento non riuscita.",
      },
      { status: 500 },
    );
  }
}
