// Funzioni deterministiche: nessun accesso bancario o inferenza fiscale.
export type InvoiceDirection = "income" | "expense";
export type InvoiceRow = {
  id: string;
  user_id: string;
  direction: InvoiceDirection;
  source: "manual" | "xml";
  company_id?: string | null;
  cost_category?: string | null;
  category_status?: "suggested" | "needs_review" | "confirmed";
  vat_amount?: number | null;
  supplier_id?:string|null;
  category_source?:"rule"|"description"|"supplier"|"manual"|"unclassified";
  classification_reason?:string|null;
  classification_confidence?:number|null;
  invoice_description?:string|null;
  invoice_number: string;
  document_id: string | null;
  issue_date: string;
  due_date: string | null;
  counterparty: string;
  vat_number: string | null;
  amount: number;
  currency: string;
  notes: string | null;
};
export type MovementRow = {
  id: string;
  company_id?: string | null;
  suggested_category?: string | null;
  category_status?: "suggested" | "needs_review" | "confirmed";
  booking_date: string;
  amount: number;
  currency: string;
  counterparty: string | null;
  description: string;
  source: "csv" | "gocardless";
  account_label: string | null;
};
export type MatchRow = {
  id: string;
  company_id?: string | null;
  invoice_id: string;
  transaction_id: string;
  allocated_amount: number;
};
export type DeadlineRow = {
  id: string;
  company_id?: string | null;
  category: "bollo" | "multa" | "imposta" | "assicurazione" | "contratto" | "fattura" | "altro";
  title: string;
  due_date: string;
  amount: number | null;
  reference_code: string | null;
  status: "open" | "settled" | "cancelled";
  notes: string | null;
};
export type ParsedMovement = {
  booking_date: string;
  amount: number;
  currency: string;
  counterparty: string;
  description: string;
};

export function eur(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency", currency: "EUR", maximumFractionDigits: 2,
  }).format(value);
}
export function dateIt(value: string | null) {
  if (!value) return "Non indicata";
  const time = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(time.getTime()) ? value :
    time.toLocaleDateString("it-IT", { timeZone: "UTC" });
}
export function normalizeName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export function dateIso(value: string) {
  const clean = value.trim().replace(/^["']|["']$/g, "");
  const iso = clean.match(/^(20\d\d|19\d\d)[-/](\d\d?)[-/](\d\d?)$/);
  const euro = clean.match(/^(\d\d?)[/.\-](\d\d?)[/.\-](20\d\d|19\d\d)$/);
  const parts = iso
    ? [Number(iso[1]),Number(iso[2]),Number(iso[3])]
    : euro ? [Number(euro[3]),Number(euro[2]),Number(euro[1])] : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
export function decimal(value: string): number | null {
  const input = String(value || "").replace(/[€\s]/g, "").trim();
  if (!input) return null;
  let cleaned = input.replace(/[^0-9,.-]/g, "");
  if (!/^-?[0-9][0-9.,]*$/.test(cleaned)) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    cleaned = comma > dot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (comma >= 0) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  }
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}
function parseDelimited(input: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i+1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      if (c === "\r" && input[i+1] === "\n") i++;
    } else cell += c;
  }
  if (quoted) throw new Error("File CSV non valido: virgolette non chiuse.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function normalizedHeader(value: string) {
  return normalizeName(value.replace(/^\uFEFF/, "")).replace(/ /g, "");
}
export function parseBankCsv(text: string): { rows: ParsedMovement[]; rejected: number } {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length ? ";" : ",";
  const parsed = parseDelimited(text, delimiter);
  if (parsed.length < 2) throw new Error("CSV vuoto o senza intestazioni.");
  const headers = parsed[0].map(normalizedHeader);
  const field = (...terms: string[]) => headers.findIndex((h) => terms.includes(h));
  const dateIndex = field("data","date","bookingdate","datacontabile","datacontabilizzazione","dataoperazione","datamovimento");
  const descriptionIndex = field("descrizione","description","causale","dettagli","details","operazione","movimento");
  const amountIndex = field("importo","amount","valore","totale","importoeur","importoin€");
  const debitsIndex = field("addebiti","addebito","uscite","uscita","debit","dare");
  const creditsIndex = field("accrediti","accredito","entrate","entrata","credit","avere");
  const counterpartyIndex = field("controparte","counterparty","beneficiario","ordinante","intestatario");
  const currencyIndex = field("divisa","currency","codicevaluta","codicedivisa");
  if (dateIndex === -1 || (amountIndex === -1 && (debitsIndex === -1 || creditsIndex === -1)))
    throw new Error("Il CSV deve contenere Data e Importo oppure colonne Entrate/Uscite. Esporta i movimenti, non il saldo.");
  const rows: ParsedMovement[] = [];
  let rejected = 0;
  for (const cells of parsed.slice(1, 5001)) {
    const booking_date = dateIso(cells[dateIndex] || "");
    let amount = amountIndex >= 0 ? decimal(cells[amountIndex] || "") : null;
    if (amount === null && debitsIndex >= 0 && creditsIndex >= 0) {
      const debit = decimal(cells[debitsIndex] || "") ?? 0;
      const credit = decimal(cells[creditsIndex] || "") ?? 0;
      amount = credit - Math.abs(debit);
    }
    const currency = currencyIndex >= 0
      ? String(cells[currencyIndex] || "EUR").toUpperCase().trim() : "EUR";
    if (!booking_date || amount === null || amount === 0 ||
      !/^[A-Z]{3}$/.test(currency)) { rejected++; continue; }
    rows.push({
      booking_date, amount, currency,
      counterparty: counterpartyIndex >= 0 ? String(cells[counterpartyIndex] || "").slice(0,220) : "",
      description: descriptionIndex >= 0 ? String(cells[descriptionIndex] || "").slice(0,1500) : "",
    });
  }
  return { rows, rejected };
}
function firstNamed(root: Element, local: string): Element | null {
  return [...root.getElementsByTagName("*")].find((node) => node.localName === local) ?? null;
}
function contentNamed(root: Element, name: string) {
  return firstNamed(root, name)?.textContent?.trim() ?? "";
}
function xmlCounterparty(element: Element | null) {
  if (!element) return { name: "", vat: "" };
  const name = contentNamed(element, "Denominazione") ||
    [contentNamed(element, "Nome"),contentNamed(element,"Cognome")].filter(Boolean).join(" ");
  const vat = contentNamed(element, "IdCodice") || contentNamed(element, "CodiceFiscale");
  return { name: name.slice(0,220), vat: vat.slice(0,30) };
}
/**
 * Uno ZIP misto deve stabilire il verso tramite la P. IVA del proprietario.
 * Se entrambe o nessuna delle parti coincidono, NON creare una fattura.
 */
export function detectFatturaPaDirection(
  xml: string, selectedCompanyVat: string,
): InvoiceDirection {
  if (typeof DOMParser === "undefined")
    throw new Error("Lettura XML disponibile nel browser.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length)
    throw new Error("XML non valido: impossibile identificare il verso.");
  const root = document.documentElement;
  const header = root && firstNamed(root, "FatturaElettronicaHeader");
  if (!header) throw new Error("File XML non riconosciuto come FatturaPA.");
  const own = (value:string) => value.toUpperCase().replace(/[^A-Z0-9]/g,"")
    .replace(/^IT(?=\d{11}$)/,"");
  const normalized = own(selectedCompanyVat);
  if (!normalized || normalized.length < 8)
    throw new Error("Partita IVA aziendale mancante o non valida.");
  const seller = xmlCounterparty(firstNamed(header, "CedentePrestatore"));
  const buyer = xmlCounterparty(firstNamed(header, "CessionarioCommittente"));
  const sellerMatch = own(seller.vat) === normalized;
  const buyerMatch = own(buyer.vat) === normalized;
  if (sellerMatch === buyerMatch)
    throw new Error("Non riesco a stabilire se la fattura sia emessa o ricevuta: verifica le partite IVA.");
  return sellerMatch ? "income" : "expense";
}

export function parseFatturaPaXml(xml: string, direction: InvoiceDirection,
  expectedOwnerVat?: string | null) {
  if (typeof DOMParser === "undefined") throw new Error("Lettura XML disponibile dal browser.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length)
    throw new Error("XML non valido.");
  const header = firstNamed(document.documentElement, "FatturaElettronicaHeader");
  const party = header && firstNamed(header,
    direction === "income" ? "CessionarioCommittente" : "CedentePrestatore");
  const counterparty = xmlCounterparty(party);
  // Per evitare attribuzioni tra aziende diverse il soggetto proprio
  // deve corrispondere alla P. IVA dell'azienda selezionata.
  const ownParty = header && firstNamed(header,
    direction === "income" ? "CedentePrestatore" : "CessionarioCommittente");
  const ownVat = xmlCounterparty(ownParty).vat;
  const normalizeVat = (value:string) => value.toUpperCase()
    .replace(/[^A-Z0-9]/g,"").replace(/^IT(?=\d{11}$)/,"");
  if(expectedOwnerVat) {
    if(!ownVat)
      throw new Error("Identificativo aziendale assente nell'XML: verifica l'intestatario.");
    if(normalizeVat(ownVat)!==normalizeVat(expectedOwnerVat))
      throw new Error("La partita IVA dell'XML non corrisponde all'azienda selezionata. Nessuna fattura importata.");
  }
  const bodies = [...document.getElementsByTagName("*")].filter(
    (element) => element.localName === "FatturaElettronicaBody",
  );
  if (!header || !bodies.length) throw new Error("Il file non sembra una FatturaPA valida.");
  return bodies.map((body) => {
    const doc = firstNamed(body, "DatiGeneraliDocumento");
    if (!doc) throw new Error("Mancano i dati della fattura.");
    const kind = contentNamed(doc, "TipoDocumento").toUpperCase();
    if (kind === "TD04" || kind === "TD08") {
      throw new Error("Nota di credito: registrala separatamente. Non viene trattata come una fattura da incassare o pagare.");
    }
    const invoice_number = contentNamed(doc, "Numero");
    const issue_date = dateIso(contentNamed(doc, "Data"));
    const currency = contentNamed(doc, "Divisa").toUpperCase() || "EUR";
    const amount = decimal(contentNamed(doc, "ImportoTotaleDocumento"));
    const expiry = contentNamed(body, "DataScadenzaPagamento");
    // Testo realmente dichiarato nelle righe FatturaPA: le parole in
    // descrizione sono più affidabili della ragione sociale per classificare.
    const descriptions=[...body.getElementsByTagName("*")]
      .filter((node)=>node.localName==="DettaglioLinee")
      .map((line)=>contentNamed(line,"Descrizione").slice(0,200))
      .filter(Boolean);
    const causali=[...body.getElementsByTagName("*")]
      .filter((node)=>node.localName==="Causale")
      .map((node)=>node.textContent?.trim().slice(0,180)||"").filter(Boolean);
    const invoice_description=[...descriptions,...causali].join(" | ").slice(0,1800);
    // L'IVA è solo quella esposta nei riepiloghi XML: nessuna
    // aliquota o detraibilità viene indovinata dall'app.
    const taxSummaries = [...body.getElementsByTagName("*")]
      .filter((node) => node.localName === "DatiRiepilogo");
    const taxes = taxSummaries.map((item) => decimal(contentNamed(item, "Imposta")));
    const vat_amount = taxes.length && taxes.every((item) => item != null)
      ? Math.round(taxes.reduce((sum, item) => sum + Number(item ?? 0), 0) * 100) / 100
      : null;
    if (!invoice_number || !issue_date || amount === null || amount <= 0 ||
      !/^[A-Z]{3}$/.test(currency)) {
      throw new Error("Numero, data, valuta o totale non validi nella fattura: verifica l'originale.");
    }
    if (!counterparty.name) throw new Error("Controparte mancante: controlla l'XML originale.");
    return {
      direction, source: "xml" as const, invoice_number, issue_date,
      due_date: dateIso(expiry), counterparty: counterparty.name,
      vat_number: counterparty.vat || null, amount, vat_amount,
      currency, invoice_description,
      notes: "Importata dai dati XML FatturaPA, da verificare.",
    };
  });
}
export function paidFor(invoiceId: string, matches: MatchRow[]) {
  return Math.round(matches.filter((m) => m.invoice_id === invoiceId)
    .reduce((total, item) => total + Number(item.allocated_amount || 0), 0) * 100) / 100;
}
export function daysTo(value: string) {
  const today = new Date();
  const local = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(value + "T12:00:00");
  return Math.round((target.getTime() - local.getTime()) / 86400000);
}
export function matchScore(invoice: InvoiceRow, movement: MovementRow) {
  if (invoice.currency !== movement.currency) return -1;
  if (invoice.direction === "income" && movement.amount <= 0) return -1;
  if (invoice.direction === "expense" && movement.amount >= 0) return -1;
  const total = Number(invoice.amount);
  const paid = Math.abs(Number(movement.amount));
  if (Math.abs(total - paid) > Math.max(1, total * 0.03)) return -1;
  let score = 65;
  const a = new Set(normalizeName(invoice.counterparty).split(" ").filter((x)=>x.length>2));
  const b = normalizeName(`${movement.counterparty ?? ""} ${movement.description}`);
  if (a.size && [...a].some((token) => b.includes(token))) score += 23;
  const pivot = invoice.due_date ?? invoice.issue_date;
  const gap = Math.abs((Date.parse(movement.booking_date) - Date.parse(pivot)) / 86400000);
  if (gap <= 7) score += 10;
  else if (gap <= 45) score += 5;
  return Math.min(100, score);
}
