import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

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

function keepUserOwnedPaths(paths: string[], userId: string) {
  const expectedPrefix = `${userId}/`;
  const owned: string[] = [];

  for (const rawPath of paths) {
    const path = rawPath.trim().replace(/^\/+/, "");

    if (path.startsWith(expectedPrefix) && !path.includes("../")) {
      owned.push(path);
    } else {
      console.error("Blocked non-owned storage path during account deletion", {
        userId,
        path,
      });
    }
  }

  return uniqueStrings(owned);
}

type SupabaseClientAny = ReturnType<typeof createClient<any>>;

async function removeStorageFiles(
  supabaseAdmin: SupabaseClientAny,
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
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return noStoreJson(
        {
          error:
            "Configurazione server incompleta. Controlla le tre variabili Supabase su Vercel.",
        },
        500,
      );
    }

    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return noStoreJson(
        { error: "Token di accesso mancante. Accedi nuovamente." },
        401,
      );
    }

    const supabaseAuth = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      console.error("Delete account auth error:", userError?.message);
      return noStoreJson(
        {
          error:
            "Sessione non valida o chiavi Supabase non appartenenti allo stesso progetto.",
        },
        401,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

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

    const storagePaths = keepUserOwnedPaths(
      uniqueStrings([
        ...(documentRows ?? []).map((item) => item.storage_path),
        ...(attachmentRows ?? []).map((item) => item.storage_path),
      ]),
      user.id,
    );

    if (storagePaths.length > 0) {
      await removeStorageFiles(supabaseAdmin, storagePaths);
    }

    const tables = [
      "document_attachments",
      "documents",
      "practices",
      "notification_preferences",
    ];

    for (const table of tables) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq("user_id", user.id);

      if (error) {
        throw new Error(`Errore eliminazione ${table}: ${error.message}`);
      }
    }

    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      throw new Error(
        `Errore eliminazione account Auth: ${authDeleteError.message}`,
      );
    }

    return noStoreJson({
      success: true,
      message: "Account e dati eliminati definitivamente.",
    });
  } catch (error) {
    console.error("Delete account error:", error);

    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "Cancellazione non riuscita.",
      },
      500,
    );
  }
}
