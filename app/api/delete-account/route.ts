import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

async function removeStorageFiles(
  supabaseAdmin: ReturnType<typeof createClient>,
  paths: string[],
) {
  const chunkSize = 100;

  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { error } = await supabaseAdmin.storage
      .from("documents")
      .remove(chunk);

    if (error) {
      throw new Error(`Errore eliminazione file: ${error.message}`);
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Configurazione server incompleta: controlla NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY su Vercel.",
        },
        { status: 500 },
      );
    }

    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Sessione mancante. Accedi nuovamente." },
        { status: 401 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sessione non valida o scaduta. Accedi nuovamente." },
        { status: 401 },
      );
    }

    const [
      { data: documentRows, error: documentsReadError },
      { data: attachmentRows, error: attachmentsReadError },
    ] = await Promise.all([
      supabaseAdmin
        .from("documents")
        .select("storage_path")
        .eq("user_id", user.id),
      supabaseAdmin
        .from("document_attachments")
        .select("storage_path")
        .eq("user_id", user.id),
    ]);

    if (documentsReadError) {
      throw new Error(
        `Errore lettura documenti: ${documentsReadError.message}`,
      );
    }

    if (attachmentsReadError) {
      throw new Error(
        `Errore lettura allegati: ${attachmentsReadError.message}`,
      );
    }

    const storagePaths = uniqueStrings([
      ...(documentRows ?? []).map((item) => item.storage_path),
      ...(attachmentRows ?? []).map((item) => item.storage_path),
    ]);

    if (storagePaths.length > 0) {
      await removeStorageFiles(supabaseAdmin, storagePaths);
    }

    const { error: attachmentsDeleteError } = await supabaseAdmin
      .from("document_attachments")
      .delete()
      .eq("user_id", user.id);

    if (attachmentsDeleteError) {
      throw new Error(
        `Errore eliminazione allegati: ${attachmentsDeleteError.message}`,
      );
    }

    const { error: documentsDeleteError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("user_id", user.id);

    if (documentsDeleteError) {
      throw new Error(
        `Errore eliminazione documenti: ${documentsDeleteError.message}`,
      );
    }

    const { error: practicesDeleteError } = await supabaseAdmin
      .from("practices")
      .delete()
      .eq("user_id", user.id);

    if (practicesDeleteError) {
      throw new Error(
        `Errore eliminazione pratiche: ${practicesDeleteError.message}`,
      );
    }

    const { error: preferencesDeleteError } = await supabaseAdmin
      .from("notification_preferences")
      .delete()
      .eq("user_id", user.id);

    if (preferencesDeleteError) {
      throw new Error(
        `Errore eliminazione preferenze: ${preferencesDeleteError.message}`,
      );
    }

    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      throw new Error(
        `Errore eliminazione account Auth: ${authDeleteError.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      message: "Account e dati eliminati definitivamente.",
    });
  } catch (error) {
    console.error("Delete account error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Cancellazione non riuscita.",
      },
      { status: 500 },
    );
  }
}
