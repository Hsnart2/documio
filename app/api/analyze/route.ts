import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedCategories = [
  "Casa",
  "Veicoli",
  "Assicurazioni",
  "Banca",
  "Lavoro",
  "Famiglia",
  "Visite mediche",
  "Appuntamenti",
  "Bollette",
  "Istruzione",
  "Altro",
] as const;

type AllowedCategory = (typeof allowedCategories)[number];

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
};

type AnalysisResult = {
  title: string;
  category: AllowedCategory;
  summary: string;
  keywords: string[];
  expiryDate: string | null;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY non configurata su Vercel." },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const userNote = String(formData.get("userNote") || "");
    const language = formData.get("language") === "en" ? "en" : "it";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: language === "it" ? "File mancante." : "Missing file." },
        { status: 400 },
      );
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "Il file supera 4 MB. Scegli un file più piccolo per questo primo test."
              : "The file is larger than 4 MB. Choose a smaller file for this first test.",
        },
        { status: 413 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const fileData = `data:${mimeType};base64,${base64}`;

    const instructions =
      language === "it"
        ? `Analizza il documento allegato per DocuMio.
Restituisci un titolo chiaro, una categoria tra quelle consentite, un riassunto breve,
da 2 a 6 parole chiave e una data di scadenza/appuntamento in formato YYYY-MM-DD.
Se non esiste una data certa, usa null. Non inventare dati.
Nota dell'utente: ${userNote || "nessuna"}`
        : `Analyze the attached document for DocuMio.
Return a clear title, one allowed category, a short summary, 2 to 6 keywords,
and an expiry/appointment date in YYYY-MM-DD format.
If there is no certain date, use null. Do not invent information.
User note: ${userNote || "none"}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instructions },
              {
                type: "input_file",
                filename: file.name,
                file_data: fileData,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "documio_document_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                category: { type: "string", enum: allowedCategories },
                summary: { type: "string" },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 6,
                },
                expiryDate: {
                  anyOf: [
                    { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                    { type: "null" },
                  ],
                },
              },
              required: [
                "title",
                "category",
                "summary",
                "keywords",
                "expiryDate",
              ],
            },
          },
        },
      }),
    });

    const result = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            (language === "it"
              ? "Errore durante l'analisi IA."
              : "AI analysis failed."),
        },
        { status: response.status },
      );
    }

    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (!outputText) {
      console.error("OpenAI response without output text:", result);

      return NextResponse.json(
        {
          error:
            language === "it"
              ? "L'IA ha risposto, ma il risultato non era leggibile."
              : "The AI responded, but the result could not be read.",
        },
        { status: 502 },
      );
    }

    const analysis = JSON.parse(outputText) as AnalysisResult;

    if (!allowedCategories.includes(analysis.category)) {
      analysis.category = "Altro";
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analyze route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante l'analisi.",
      },
      { status: 500 },
    );
  }
}
