import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type SearchDocument = {
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
  attachments?: Array<{
    title?: string;
    type?: string;
    fileName?: string;
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
      query?: string;
      language?: "it" | "en";
      documents?: SearchDocument[];
    };

    const query = String(body.query || "").trim();
    const language = body.language === "en" ? "en" : "it";
    const documents = Array.isArray(body.documents)
      ? body.documents.slice(0, 100)
      : [];

    if (!query) {
      return NextResponse.json({ documentIds: [] });
    }

    if (!documents.length) {
      return NextResponse.json({ documentIds: [] });
    }

    const instructions =
      language === "it"
        ? `Sei il motore di ricerca semantica di DocuMio.
L'utente cerca: "${query}"

Ordina i documenti dal più pertinente al meno pertinente.
Comprendi sinonimi, intenzione, domande naturali e riferimenti indiretti.
Esempi: pannelli solari = fotovoltaico; contatto = telefono/email/referente;
macchina = auto/veicolo; assicurazione = polizza; pagamento = ricevuta/quietanza.

Usa titolo, nome file, categoria, riassunto, parole chiave, stato,
importi e allegati. Restituisci solo documenti realmente pertinenti.
Non inventare ID e non inserire documenti irrilevanti.

Documenti:
${JSON.stringify(documents)}`
        : `You are DocuMio's semantic search engine.
The user searches for: "${query}"

Rank documents from most to least relevant.
Understand synonyms, natural-language intent, and indirect references.
Use title, filename, category, summary, keywords, status, amounts,
and attachments. Return only genuinely relevant documents.
Never invent IDs and do not include irrelevant documents.

Documents:
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
            name: "documio_semantic_search",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                documentIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 30,
                },
              },
              required: ["documentIds"],
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
              ? "Ricerca IA non disponibile."
              : "AI search unavailable."),
        },
        { status: response.status },
      );
    }

    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (!outputText) {
      return NextResponse.json({ documentIds: [] });
    }

    const parsed = JSON.parse(outputText) as { documentIds?: string[] };
    const validIds = new Set(documents.map((document) => document.id));

    return NextResponse.json({
      documentIds: (parsed.documentIds ?? []).filter((id) => validIds.has(id)),
    });
  } catch (error) {
    console.error("Search route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante la ricerca.",
      },
      { status: 500 },
    );
  }
}
