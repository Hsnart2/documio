import { NextRequest, NextResponse } from "next/server";

const PROTECTED_API_PATHS = new Set(["/api/analyze"]);

function unauthorized(message: string) {
  return NextResponse.json(
    { error: message },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  if (!PROTECTED_API_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1]?.trim();

  if (!token) {
    return unauthorized("Sessione mancante.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Configurazione server incompleta." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!authResponse.ok) {
      return unauthorized("Sessione non valida o scaduta.");
    }
  } catch (error) {
    console.error("DocuMio middleware auth error:", error);

    return NextResponse.json(
      { error: "Servizio di autenticazione temporaneamente non disponibile." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/api/analyze"],
};
