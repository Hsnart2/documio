// DocuMio: classificazione proposta, NON scrittura contabile definitiva.
import { matchScore, normalizeName, paidFor,
  type InvoiceDirection, type InvoiceRow, type MatchRow, type MovementRow } from "./financial-control";

export const accountingCategories = [
  { value: "acquisti_merci", label: "Acquisti merci e materie prime", group: "cost" },
  { value: "trasporti", label: "Trasporti e spedizioni", group: "cost" },
  { value: "carburanti", label: "Carburanti e automezzi", group: "cost" },
  { value: "manutenzioni", label: "Manutenzioni e riparazioni", group: "cost" },
  { value: "utenze", label: "Utenze (luce, gas, acqua, telefonia)", group: "cost" },
  { value: "affitti_canoni", label: "Affitti e canoni", group: "cost" },
  { value: "stipendi", label: "Retribuzioni e salari", group: "cost" },
  { value: "contributi", label: "Contributi previdenziali e INPS", group: "cost" },
  { value: "conai", label: "CONAI e contributi ambientali", group: "cost" },
  { value: "iva", label: "IVA (da verificare)", group: "tax" },
  { value: "imposte", label: "Imposte, tributi e F24", group: "tax" },
  { value: "consulenze", label: "Consulenze e professionisti", group: "cost" },
  { value: "assicurazioni", label: "Assicurazioni", group: "cost" },
  { value: "interessi", label: "Interessi e oneri bancari", group: "cost" },
  { value: "marketing", label: "Marketing e pubblicità", group: "cost" },
  { value: "software", label: "Software e servizi digitali", group: "cost" },
  { value: "rimborsi", label: "Rimborsi e storni (verificare)", group: "review" },
  { value: "vendite", label: "Vendite prodotti", group: "revenue" },
  { value: "ricavi_servizi", label: "Ricavi da servizi", group: "revenue" },
  { value: "altri_ricavi", label: "Altri ricavi", group: "revenue" },
  { value: "altre_spese", label: "Altre spese", group: "cost" },
  { value: "da_verificare", label: "Da classificare", group: "review" },
] as const;

export type CostCategory = (typeof accountingCategories)[number]["value"];
export function categoryLabel(code: string | null | undefined) {
  return accountingCategories.find((entry)=>entry.value===code)?.label ?? "Da classificare";
}

const rules: Array<{ category: CostCategory; rx: RegExp; reason: string }> = [
  {category:"conai",rx:/\bconai\b|contributo ambientale|c a c\b/i,reason:"Riferimento a CONAI/contributo ambientale"},
  {category:"stipendi",rx:/stipendi|retribuzion|cedolin|busta paga|salari|emolument/i,reason:"Riferimento a retribuzioni"},
  {category:"contributi",rx:/\binps\b|\binail\b|previdenz|contributi dipendent|contributi social/i,reason:"Riferimento a contributi previdenziali"},
  {category:"iva",rx:/versamento iva|liquidazione iva|acconto iva|saldo iva/i,reason:"Riferimento a versamenti IVA"},
  {category:"imposte",rx:/modello\s*f24|\bf24\b|\bimu\b|ritenute|irpef|ires|irap|tribut[oi]/i,reason:"Riferimento a imposte o F24"},
  {category:"trasporti",rx:/trasport|spedizion|corriere|consegna merci|logistic|\bdhl\b|\bups\b|\bfedex\b/i,reason:"Riferimento a trasporto/spedizioni"},
  {category:"carburanti",rx:/carburant|gasolio|diesel|benzina|riforniment|autostrada|pedagg/i,reason:"Riferimento a mezzi/carburanti"},
  {category:"manutenzioni",rx:/manutenzion|riparazion|intervento tecnico|ricambi|assistenza macchin|officina/i,reason:"Riferimento a manutenzioni"},
  {category:"utenze",rx:/bolletta|energia elettrica|\benel\b|\beni\b|gas naturale|idrico|acqua|telefonia|fibra|elettricita/i,reason:"Riferimento a utenze"},
  {category:"affitti_canoni",rx:/affitt|canone|locazione|noleggio|leasing|rental/i,reason:"Riferimento a canoni o affitti"},
  {category:"consulenze",rx:/commercialista|consulenz|studio legale|parcella|onorari|avvocato|professionist/i,reason:"Riferimento a consulenze"},
  {category:"assicurazioni",rx:/polizza|assicurazion|premio rca|\brc auto\b/i,reason:"Riferimento a polizze assicurative"},
  {category:"interessi",rx:/interessi passivi|spese bancarie|commissioni bancarie|oneri finanziari|canone banc/i,reason:"Riferimento a oneri finanziari"},
  {category:"marketing",rx:/pubblicit|advertis|marketing|social ads|promozion|campagna ads/i,reason:"Riferimento a promozione/pubblicità"},
  {category:"software",rx:/licenza software|\bsaas\b|hosting|dominio web|cloud|abbonamento software/i,reason:"Riferimento a software e servizi digitali"},
  {category:"acquisti_merci",rx:/acquist|fornitura|materie prime|materiale|cartone|carta|imballaggi|consumabili|prodotto/i,reason:"Riferimento ad acquisti o materiali"},
  {category:"rimborsi",rx:/rimborso|storno|restituzione|nota di credito/i,reason:"Riferimento a rimborso/storno: verificare il segno"},
];

export function suggestCategory(
  direction: InvoiceDirection,
  text: string,
): { category: CostCategory; reason: string; confidence: number; reviewRequired: boolean } {
  const normalized = normalizeName(text);
  // Documenti di vendita senza descrizione specifica rimangono da classificare.
  if (direction === "income") {
    if (/serviz|prestazion|consulenza|assistenza|intervento/.test(normalized))
      return {category:"ricavi_servizi",reason:"Descrizione riferita a servizi",confidence:76,reviewRequired:true};
    if (/vendit|merce|prodotto|fornitura/.test(normalized))
      return {category:"vendite",reason:"Descrizione riferita a vendita di beni",confidence:76,reviewRequired:true};
    return {category:"da_verificare",reason:"Tipo di ricavo non specificato",confidence:20,reviewRequired:true};
  }
  for (const rule of rules) {
    if (rule.rx.test(normalized))
      return {category:rule.category,reason:rule.reason,confidence:75,reviewRequired:true};
  }
  return {category:"da_verificare",reason:"Controparte e causale insufficienti",confidence:15,reviewRequired:true};
}

export type MatchSuggestion = {
  invoiceId: string;
  transactionId: string;
  score: number;
  reasons: string[];
  requiresReview: boolean;
};

/**
 * Suggerisce (senza registrare) un movimento per una fattura.
 * La differenza tra due candidati simili determina la richiesta di verifica.
 */
export function suggestReconciliations(
  invoices: InvoiceRow[], movements: MovementRow[], matches: MatchRow[],
): MatchSuggestion[] {
  const used = new Set(matches.map((m)=>m.transaction_id));
  return invoices.flatMap((invoice) => {
    const remaining = Math.max(0, Number(invoice.amount) - paidFor(invoice.id,matches));
    if (remaining < 0.01) return [];
    const candidates = movements
      .filter((m)=>!used.has(m.id) && Math.abs(Number(m.amount)) <= remaining + .01)
      .map((movement)=>{
        let score = matchScore(invoice,movement);
        const reasons: string[] = [];
        if (score < 0) return {movement,score,reasons};
        const text = normalizeName(`${movement.counterparty??""} ${movement.description??""}`);
        const invoiceNo = normalizeName(invoice.invoice_number);
        if (invoiceNo.length >= 3 && text.includes(invoiceNo)) {
          score += 18;
          reasons.push("Numero fattura nella causale");
        }
        if (Math.abs(Math.abs(Number(movement.amount))-remaining) <= 0.01)
          reasons.push("Importo coincidente con il residuo");
        const company = normalizeName(invoice.counterparty);
        if (company.split(" ").some((token)=>token.length>3 && text.includes(token)))
          reasons.push("Controparte compatibile");
        if (!reasons.length) reasons.push("Solo importo e data: verifica manualmente");
        return {movement,score:Math.min(100,score),reasons};
      })
      .filter(x=>x.score>=65)
      .sort((a,b)=>b.score-a.score);
    if(!candidates.length) return [];
    const best=candidates[0];
    const close = candidates[1] && best.score-candidates[1].score<12;
    return [{
      invoiceId:invoice.id,transactionId:best.movement.id,
      score:best.score,reasons:best.reasons,
      requiresReview:Boolean(close)||best.score<85 || best.reasons.length<2,
    }];
  });
}

export function grossInvoiceSummary(
  invoices: Array<Pick<InvoiceRow,"direction"|"amount"|"currency"> & { cost_category?:string|null }>,
) {
  const eurInvoices = invoices.filter((x)=>x.currency==="EUR");
  const income=eurInvoices.filter((x)=>x.direction==="income")
    .reduce((sum,x)=>sum+Number(x.amount),0);
  const expense=eurInvoices.filter((x)=>x.direction==="expense")
    .reduce((sum,x)=>sum+Number(x.amount),0);
  const byCategory = new Map<string,number>();
  for (const inv of eurInvoices.filter((x)=>x.direction==="expense")) {
    const key=inv.cost_category || "da_verificare";
    byCategory.set(key,(byCategory.get(key)||0)+Number(inv.amount));
  }
  return {
    income:Math.round(income*100)/100,
    expense:Math.round(expense*100)/100,
    provisionalDifference:Math.round((income-expense)*100)/100,
    categorized:[...byCategory.entries()].sort((a,b)=>b[1]-a[1]),
    currency:"EUR",
    disclaimer:"Totali lordi fattura da documenti caricati, non un bilancio né un utile fiscale. IVA, ratei, competenze, paghe, ammortamenti, F24 e duplicati vanno verificati.",
  };
}
