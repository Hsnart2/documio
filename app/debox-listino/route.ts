import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATA_API =
  "https://ep-lively-field-b2lzbe1k.apirest.c-6.eu-central-1.aws.neon.tech/debox_listino/rest/v1";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(
      `${DATA_API}/tunnel_target?id=eq.1&select=target_url,updated_at`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("DEBOX bridge upstream error", response.status, body);
      return new NextResponse(
        "Listino DEBOX momentaneamente non disponibile. Riprova tra qualche secondo.",
        {
          status: 503,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }

    const rows = (await response.json()) as Array<{
      target_url?: string;
      updated_at?: string;
    }>;

    const target = rows?.[0]?.target_url?.replace(/\/+$/, "");

    if (!target || !/^https:\/\/[A-Za-z0-9.-]+\.trycloudflare\.com$/i.test(target)) {
      console.error("DEBOX bridge target missing or invalid", rows);
      return new NextResponse(
        "Collegamento Listino DEBOX non ancora disponibile. Avvia il Listino Online dal PC aziendale.",
        {
          status: 503,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }

    const destination = new URL(`${target}/listino`);
    request.nextUrl.searchParams.forEach((value, key) => {
      destination.searchParams.set(key, value);
    });

    const redirect = NextResponse.redirect(destination, 307);
    redirect.headers.set("Cache-Control", "no-store, max-age=0");
    return redirect;
  } catch (error) {
    console.error("DEBOX bridge fetch failed", error);
    return new NextResponse(
      "Listino DEBOX momentaneamente non disponibile. Riprova tra qualche secondo.",
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
