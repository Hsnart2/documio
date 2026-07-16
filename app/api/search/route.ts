import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type AssistantDocument = {
  id: string;
  title?: string;
  fileName?: string;
  category?: string;
  summary?: string;
  keywords?: string[];
  expiryDate?: string | null;
  paymentStatus?: string | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  remainingAmount?: number | null;
  paymentMethod?: string | null;
  attachments?: Array<{
    title?: string;
    type?: string;
    fileName?: string;
    paymentDate?: string | null;
    amount?: number | null;
    paymentMethod?: string | null;
    notes?: string | null;
  }>;
};

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY non configurata." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      question?: string;
      language?: "it" | "en";
      documents?: AssistantDocument[];
    };

    const question = String(body.question || "").trim();
    const language = body.language === "en" ? "en" : "it";
    const documents = Array.isArray(body.documents)
      ? body.documents.slice(0, 100)
      : [];

    if (!question) {
      return NextResponse.json(
        {
          error:
            language === "it" ? "Domanda mancante." : "Missing question.",
        },
        { status: 400 },
      );
    }

    const instructions =
      language === "it"
        ? `Sei DocuMio Assistant, un assistente amministrativo personale.
Rispondi esclusivamente usando i dati strutturati dell'archivio fornito.

Regole:
- Sii breve, concreto e prudente.
- Non inventare informazioni assenti.
- Se un dato non è disponibile, dillo chiaramente.
- Per importi, usa euro con due decimali.
- Per le scadenze, considera la data odierna.
- Cita nel testo i titoli dei documenti usati.
- Restituisci negli ID soltanto i documenti davvero utili alla risposta.
- Non dare consulenza legale, medica o finanziaria definitiva.
- Non chiedere di ricaricare i PDF: in questa versione usi i dati già estratti.

Domanda:
${question}

Archivio:
${JSON.stringify(documents)}`
        : `You are DocuMio Assistant, a personal administrative assistant.
Answer only from the structured archive data provided.

Rules:
- Be brief, concrete, and careful.
- Never invent missing information.
- Clearly say when data is unavailable.
- Format euro amounts with two decimals.
- Consider today's date for expiry questions.
- Mention the titles of documents used.
- Return only genuinely useful document IDs.
- Do not provide definitive legal, medical, or financial advice.
- Do not ask to re-upload PDFs; this version uses already extracted data.

Question:
${question}

Archive:
${JSON.stringify(documents)}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: instructions,
        text: {
          format: {
            type: "json_schema",
            name: "documio_assistant_answer",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                documentIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 10,
                },
              },
              required: ["answer", "documentIds"],
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
              ? "Assistente IA non disponibile."
              : "AI assistant unavailable."),
        },
        { status: response.status },
      );
    }

    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (!outputText) {
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "La risposta dell'assistente non era leggibile."
              : "The assistant response could not be read.",
        },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(outputText) as {
      answer?: string;
      documentIds?: string[];
    };

    const validIds = new Set(documents.map((document) => document.id));

    return NextResponse.json({
      answer: parsed.answer || "",
      documentIds: (parsed.documentIds ?? []).filter((id) => validIds.has(id)),
    });
  } catch (error) {
    console.error("Assistant route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto dell'assistente.",
      },
      { status: 500 },
    );
  }
}
