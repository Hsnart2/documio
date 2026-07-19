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

const allowedAttachmentTypes = [
  "Ricevuta",
  "Quietanza",
  "Pagamento",
  "Sollecito",
  "Comunicazione",
  "Altro",
] as const;

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
};

type AnalysisResult = {
  title: string;
  category: (typeof allowedCategories)[number];
  summary: string;
  keywords: string[];
  expiryDate: string | null;
  appointmentTime: string | null;
  isAttachment: boolean;
  attachmentType: (typeof allowedAttachmentTypes)[number];
  paymentDate: string | null;
  amount: number | null;
  paymentMethod: string | null;
  notes: string;
  documentTotalAmount: number | null;
  installmentCount: number | null;
  installmentAmount: number | null;
  financingTotalAmount: number | null;
  firstInstallmentDate: string | null;
  isFinancing: boolean;
  isSinglePaymentOption: boolean;
  suggestedDocumentId: string | null;
  matchConfidence: number;
  matchReasons: string[];
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
    const mode = formData.get("mode") === "attachment" ? "attachment" : "document";
    const candidateDocumentsRaw = String(
      formData.get("candidateDocuments") || "[]",
    );

    let candidateDocuments: unknown[] = [];

    try {
      const parsed = JSON.parse(candidateDocumentsRaw);
      candidateDocuments = Array.isArray(parsed) ? parsed.slice(0, 50) : [];
    } catch {
      candidateDocuments = [];
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: language === "it" ? "File mancante." : "Missing file." },
        { status: 400 },
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            language === "it"
              ? "Il file supera 20 MB. Scegli un file più piccolo."
              : "The file is larger than 20 MB. Choose a smaller file.",
        },
        { status: 413 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const fileData = `data:${mimeType};base64,${base64}`;

    const candidateText =
      candidateDocuments.length > 0
        ? JSON.stringify(candidateDocuments)
        : "[]";
    const currentDate = new Date().toISOString().slice(0, 10);

    const instructions =
      language === "it"
        ? `Analizza il file per DocuMio.
Modalità richiesta: ${mode}.

Devi capire se il file è un documento principale oppure un allegato collegabile:
ricevuta, quietanza, pagamento, sollecito o comunicazione.

Estrai senza inventare:
- titolo
- categoria
- riassunto
- 2-6 parole chiave
- eventuale scadenza
- eventuale ora dell'appuntamento nel formato HH:MM
- tipo allegato
- data pagamento
- importo
- metodo pagamento
- note brevi
- importo totale del documento principale, se certo
- numero di rate, se certo
- importo della singola rata, se certo
- importo totale dovuto del piano di finanziamento, se indicato
- data della prima rata, se indicata
- se si tratta di finanziamento, prestito o pagamento rateale
- se il documento consente anche il pagamento in unica soluzione

Oggi è ${currentDate}. Se il file è un foglietto, una prenotazione, una visita,
un appuntamento o un promemoria con una data e/o un'ora, trattalo come documento
principale, usa la categoria Appuntamenti (oppure Visite mediche quando è
chiaramente una visita sanitaria), inserisci la data in expiryDate e l'ora in
appointmentTime. Non considerarlo un pagamento: amount e documentTotalAmount
devono essere null, isFinancing=false e isAttachment=false. Trascrivi anche
scrittura a mano leggibile senza inventare dati mancanti.

Per un finanziamento distingui sempre il capitale finanziato dall'importo
complessivo delle rate. In documentTotalAmount inserisci il capitale finanziato,
in installmentCount il numero totale di rate, in installmentAmount l'importo
della singola rata, in financingTotalAmount il totale esatto dovuto del piano,
in firstInstallmentDate la prima scadenza nel formato YYYY-MM-DD e imposta
isFinancing=true. Non trattare il capitale
finanziato come una somma da pagare immediatamente.

Per ricevute e pagamenti, se il documento candidato contiene nel titolo, riassunto
o parole chiave un importo totale o un piano rateale, estrailo in documentTotalAmount
e installmentCount. Non confondere l'importo della singola ricevuta con il totale
del documento principale.

Se sono presenti documenti candidati, confronta ente/beneficiario, importo,
anno, date, codici avviso/pratica, categoria, titolo, riassunto e parole chiave.
Proponi il documento migliore SOLO se il collegamento è plausibile.
Non collegare mai da solo: restituisci solo id, confidenza e motivi.
Se non c'è una corrispondenza credibile usa suggestedDocumentId=null.

Documenti candidati:
${candidateText}

Nota utente: ${userNote || "nessuna"}`
        : `Analyze the file for DocuMio.
Requested mode: ${mode}.

Determine whether it is a main document or a linkable attachment:
receipt, payment proof, payment, reminder, or communication.

Extract without inventing:
title, category, short summary, 2-6 keywords, expiry date,
appointment time in HH:MM when present,
attachment type, payment date, amount, payment method, short notes,
the main document total amount when certain, installment count when certain,
single installment amount when certain, whether it is financing or an installment plan,
the exact total repayment amount and first installment date when stated,
and whether a single-payment option is available.

Today is ${currentDate}. For a note, booking, visit, appointment, or reminder
containing a date or time, treat it as a main document, use Appuntamenti (or
Visite mediche when clearly medical), put the date in expiryDate and time in
appointmentTime. It is not a payment: amount and documentTotalAmount must be
null, isFinancing=false, and isAttachment=false. Read legible handwriting
without inventing missing information.

For financing, distinguish financed principal from total scheduled repayments.
Use documentTotalAmount for financed principal, installmentCount for the total
number of installments, installmentAmount for one installment, and set
financingTotalAmount for the exact scheduled repayment total,
firstInstallmentDate for the first due date in YYYY-MM-DD, and set isFinancing=true.
Never describe the financed principal as immediately due.

For receipts and payments, when a candidate document title, summary, or keywords
contain a total amount or installment plan, extract it as documentTotalAmount and
installmentCount. Do not confuse the receipt amount with the main document total.

When candidate documents are provided, compare recipient/entity, amount,
year, dates, reference codes, category, title, summary, and keywords.
Suggest the best document ONLY when the link is plausible.
Never link automatically: return only its id, confidence, and reasons.
Use suggestedDocumentId=null when no credible match exists.

Candidate documents:
${candidateText}

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
              ...(mimeType.startsWith("image/")
                ? [
                    {
                      type: "input_image",
                      image_url: fileData,
                    },
                  ]
                : [
                    {
                      type: "input_file",
                      filename: file.name,
                      file_data: fileData,
                    },
                  ]),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "documio_smart_analysis",
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
                appointmentTime: {
                  anyOf: [
                    { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
                    { type: "null" },
                  ],
                },
                isAttachment: { type: "boolean" },
                attachmentType: {
                  type: "string",
                  enum: allowedAttachmentTypes,
                },
                paymentDate: {
                  anyOf: [
                    { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                    { type: "null" },
                  ],
                },
                amount: {
                  anyOf: [{ type: "number" }, { type: "null" }],
                },
                paymentMethod: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                notes: { type: "string" },
                documentTotalAmount: {
                  anyOf: [{ type: "number" }, { type: "null" }],
                },
                installmentCount: {
                  anyOf: [
                    { type: "integer", minimum: 1 },
                    { type: "null" },
                  ],
                },
                installmentAmount: {
                  anyOf: [{ type: "number", minimum: 0 }, { type: "null" }],
                },
                financingTotalAmount: {
                  anyOf: [{ type: "number", minimum: 0 }, { type: "null" }],
                },
                firstInstallmentDate: {
                  anyOf: [
                    { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                    { type: "null" },
                  ],
                },
                isFinancing: { type: "boolean" },
                isSinglePaymentOption: { type: "boolean" },
                suggestedDocumentId: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                matchConfidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 100,
                },
                matchReasons: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 5,
                },
              },
              required: [
                "title",
                "category",
                "summary",
                "keywords",
                "expiryDate",
                "appointmentTime",
                "isAttachment",
                "attachmentType",
                "paymentDate",
                "amount",
                "paymentMethod",
                "notes",
                "documentTotalAmount",
                "installmentCount",
                "installmentAmount",
                "financingTotalAmount",
                "firstInstallmentDate",
                "isFinancing",
                "isSinglePaymentOption",
                "suggestedDocumentId",
                "matchConfidence",
                "matchReasons",
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

    // Alcuni modelli possono restituire la confidenza come 0-1 anziché 0-100.
    // La normalizziamo per evitare casi come "1%" quando in realtà significa 100%.
    if (analysis.matchConfidence > 0 && analysis.matchConfidence <= 1) {
      analysis.matchConfidence = analysis.matchConfidence * 100;
    }
    analysis.matchConfidence = Math.max(
      0,
      Math.min(100, Math.round(analysis.matchConfidence)),
    );
    analysis.matchReasons = (analysis.matchReasons ?? [])
      .map((reason) => reason.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!allowedCategories.includes(analysis.category)) {
      analysis.category = "Altro";
    }

    if (!allowedAttachmentTypes.includes(analysis.attachmentType)) {
      analysis.attachmentType = "Altro";
    }

    const candidateIds = new Set(
      candidateDocuments
        .map((item) =>
          typeof item === "object" && item !== null && "id" in item
            ? String((item as { id: unknown }).id)
            : "",
        )
        .filter(Boolean),
    );

    if (
      !analysis.suggestedDocumentId ||
      !candidateIds.has(analysis.suggestedDocumentId)
    ) {
      analysis.suggestedDocumentId = null;
      analysis.matchConfidence = 0;
      analysis.matchReasons = [];
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
