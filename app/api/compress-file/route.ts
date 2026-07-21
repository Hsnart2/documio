import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante." }, { status: 400 });
    }

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { compressed: false, reason: "not-pdf" },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        compressed: false,
        reason: "server-analysis-compression",
        originalSize: file.size,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PDF preparation error:", error);

    return NextResponse.json(
      {
        error: "Preparazione PDF non disponibile.",
        fallbackToOriginal: true,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
