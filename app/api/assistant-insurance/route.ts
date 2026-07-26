import { NextResponse } from "next/server";
import { POST as runAssistant } from "../assistant/route";

export const runtime = "nodejs";
export const maxDuration = 60;

type InsuranceSubject = {
  label: "Audi" | "camper" | "casa";
  terms: string[];
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getInsuranceSubject(question: string): InsuranceSubject | null {
  const value = normalize(question);
  const subjects: InsuranceSubject[] = [
    { label: "Audi", terms: ["audi"] },
    {
      label: "camper",
      terms: ["camper", "ducato", "motorhome", "autocaravan"],
    },
    {
      label: "casa",
      terms: ["casa", "abitazione", "immobile", "fabbricato"],
    },
  ];

  return (
    subjects.find((subject) =>
      subject.terms.some((term) => value.includes(term)),
    ) ?? null
  );
}

export async function POST(request: Request) {
  const body = (await request.clone().json().catch(() => null)) as {
    question?: unknown;
    language?: unknown;
  } | null;
  const question = String(body?.question ?? "").trim();
  const language = body?.language === "en" ? "en" : "it";
  const subject = getInsuranceSubject(question);

  if (!question) {
    return NextResponse.json(
      { error: language === "it" ? "Domanda mancante." : "Missing question." },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (!subject) {
    return NextResponse.json(
      {
        answer:
          language === "it"
            ? "Quale assicurazione intendi: quella dell’Audi, del camper o della casa?"
            : "Which insurance do you mean: the Audi, the camper, or the home insurance?",
        documentIds: [],
        practiceIds: [],
        filesInspected: 0,
        mode: "insurance-clarification",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const enrichedQuestion =
    language === "it"
      ? `${question}\n\nISTRUZIONE OBBLIGATORIA: cerca esclusivamente l'assicurazione del ${subject.label}. Ignora TARI, bollette, rate, quietanze e documenti relativi ad altri beni. Leggi il testo reale della polizza o del certificato e trova la data di fine copertura, indicata come scadenza, validità fino al, copertura fino al oppure periodo assicurato. Non confondere la data del pagamento o della quietanza con la scadenza della copertura. Rispondi iniziando con: “L'assicurazione del ${subject.label} scade il ...”. Se la data non è realmente presente, dichiaralo chiaramente.`
      : `${question}\n\nMANDATORY INSTRUCTION: search only for the ${subject.label} insurance. Ignore taxes, bills, installments, receipts and policies for other assets. Read the actual policy or certificate and find the coverage end date. Do not confuse a payment date with the policy expiry date.`;

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      question: enrichedQuestion,
      language,
    }),
  });

  const response = await runAssistant(forwardedRequest);
  const payload = await response.clone().json().catch(() => null);

  if (!payload) return response;

  return NextResponse.json(payload, {
    status: response.status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
