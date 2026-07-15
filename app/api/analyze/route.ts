import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  const fileName = String(body.fileName || "documento");
  const userNote = String(body.userNote || "");
  const text = `${fileName} ${userNote}`;

  return NextResponse.json({
    title: fileName.replace(/\.[^/.]+$/, ""),
    category: guessCategory(text),
    summary:
      "Documento archiviato in modalità locale. L’analisi con intelligenza artificiale è temporaneamente disattivata.",
    keywords: fileName
      .toLowerCase()
      .split(/[^a-zA-ZÀ-ÿ0-9]+/)
      .filter(Boolean)
      .slice(0, 6),
  });
}

function guessCategory(text: string) {
  const value = text.toLowerCase();

  if (/rogito|casa|immobile|catasto|mutuo/.test(value)) return "Casa";
  if (/auto|moto|veicolo|libretto|bollo|revisione/.test(value))
    return "Veicoli";
  if (/polizza|assicurazione/.test(value)) return "Assicurazioni";
  if (/banca|conto|iban|estratto/.test(value)) return "Banca";
  if (/azienda|costituzione|camera commercio|statuto|contratto/.test(value))
    return "Lavoro";
  if (/famiglia|nascita|matrimonio|scuola|iscrizione/.test(value))
    return "Famiglia";

  return "Altro";
}