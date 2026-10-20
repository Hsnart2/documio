import {csv,euroCents} from "./year-end-ledger";

export type CompanyInvoice={
 id:string;invoice_number:string;issue_date:string;direction:string;
 counterparty:string;vat_number:string|null;amount:number|string;currency:string;
 cost_category:string|null;category_status:string|null;
};
export type CompanyMovement={
 id:string;booking_date:string;amount:number|string;currency:string;
 account_label:string|null;counterparty:string|null;description:string;source:string;
};
export type CompanyMatch={
 id:string;invoice_id:string;transaction_id:string;allocated_amount:number|string;
};
export type BankStatement={
 id:string;account_label:string;fiscal_year:number;opening_balance:number|string|null;
 closing_balance:number|string;currency:string;statement_document_id:string|null;
 provenance:string;
};
function money(v:number|string):number{
 const n=Number(v);
 if(!Number.isFinite(n)||Math.abs(n)>999999999999.99)throw Error("Valore fuori scala");
 return Math.round(n*100);
}
type Pending=CompanyInvoice&{paidCents:number;unmatchedCents:number};
export function companyYearEnd(year:number,invoices:CompanyInvoice[],
 movements:CompanyMovement[],matches:CompanyMatch[],statements:BankStatement[]){
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error("Anno non valido");
 const first=year+"-01-01",last=year+"-12-31";
 const endInvoices=invoices.filter(i=>i.issue_date<=last);
 const yearlyInvoices=endInvoices.filter(i=>i.issue_date>=first);
 const movementsToEnd=new Map(movements.filter(t=>t.booking_date<=last)
  .map(t=>[t.id,t]));
 const importedInYear=movements.filter(t=>t.booking_date>=first&&t.booking_date<=last);
 const invoicePaid=new Map<string,number>();
 for(const m of matches){
  const tx=movementsToEnd.get(m.transaction_id);
  if(!tx)continue;
  const invoice=endInvoices.find(i=>i.id===m.invoice_id);
  if(!invoice||tx.currency!==invoice.currency)continue;
  invoicePaid.set(invoice.id,(invoicePaid.get(invoice.id)??0)+money(m.allocated_amount));
 }
 const details:Pending[]=endInvoices.filter(i=>i.currency==="EUR").map(i=>{
   const full=money(i.amount);
   const paid=Math.min(Math.max(invoicePaid.get(i.id)??0,0),Math.abs(full));
   return {...i,paidCents:paid,unmatchedCents:Math.max(0,Math.abs(full)-paid)};
 });
 const open=details.filter(i=>i.unmatchedCents>0);
 const invoicedIncome=yearlyInvoices.filter(i=>i.direction==="income"&&i.currency==="EUR")
   .reduce((s,i)=>s+money(i.amount),0);
 const invoicedCosts=yearlyInvoices.filter(i=>i.direction==="expense"&&i.currency==="EUR")
   .reduce((s,i)=>s+money(i.amount),0);
 const pendingReceivables=open.filter(i=>i.direction==="income")
   .reduce((s,i)=>s+i.unmatchedCents,0);
 const pendingPayables=open.filter(i=>i.direction==="expense")
   .reduce((s,i)=>s+i.unmatchedCents,0);
 const bankAccountLabels=[...new Set([
  ...importedInYear.filter(x=>x.currency==="EUR").map(x=>x.account_label?.trim()||"Conto senza nome"),
  ...statements.filter(x=>x.currency==="EUR"&&x.fiscal_year===year).map(x=>x.account_label.trim()),
 ])].sort((a,b)=>a.localeCompare(b,"it"));
 const banks=bankAccountLabels.map(label=>{
  const rows=importedInYear.filter(m=>m.currency==="EUR"&&
    (m.account_label?.trim()||"Conto senza nome")===label);
  const st=statements.find(x=>x.fiscal_year===year&&x.currency==="EUR"&&x.account_label.trim()===label);
  const importedCents=rows.reduce((s,m)=>s+money(m.amount),0);
  const openingCents=st?.opening_balance==null?null:money(st.opening_balance);
  const closingCents=st?money(st.closing_balance):null;
  const difference=openingCents!==null&&closingCents!==null?
    closingCents-openingCents-importedCents:null;
  return {
   label,transactions:rows.length,importedCents,openingCents,closingCents,
   differenceCents:difference,source:st?.provenance??null,
   documented:Boolean(st?.statement_document_id),
   status:st?st.statement_document_id?"con_estratto_collegato":"dichiarato_dall_utente":"saldo_31_12_assente",
   warning:"I movimenti potrebbero essere incompleti/duplicati. La differenza non dimostra di per sé un errore.",
  };
 });
 return {
  year,yearlyInvoices,open,importedInYear,banks,
  totals:{invoicedIncome,invoicedCosts,pendingReceivables,pendingPayables,
    bankStatements:statements.filter(s=>s.currency==="EUR"&&s.fiscal_year===year).length,
    bankClosingCents:banks.every(b=>b.closingCents!==null)&&banks.length>0
      ?banks.reduce((s,b)=>s+(b.closingCents??0),0):null},
  warnings:[
   "Sono riportate fatture registrate e importi lordi, non un conto economico fiscale.",
   "Le fatture non riconciliate non sono necessariamente insolute; verificare pagamenti esterni e incassi cumulativi.",
   "Il saldo bancario al 31/12 è soltanto quello trascritto dall'estratto conto, mai dedotto dalla somma dei movimenti.",
   "L'accesso PSD2 fornisce principalmente saldi attuali e solo lo storico concesso dalla banca: non garantisce il saldo storico 31/12.",
   "Il pacchetto NON contiene scritture di assestamento, rimanenze, ammortamenti o bilancio civilistico.",
  ],
 };
}
type Report=ReturnType<typeof companyYearEnd>;
export function companyYearEndFiles(report:Report,companyName:string){
 const year=report.year, yearText=String(year);
 const pendingCsv=csv([
  ["SCADENZIARIO NON RICONCILIATO AL 31/12/"+year,"Verificare con il commercialista"],
  ["Num fattura","Data","Cliente/Fornitore","P.IVA","Tipo","Importo lordo EUR",
   "Abbinato fino al 31/12 EUR","Da riconciliare EUR"],
  ...report.open.map(i=>[i.invoice_number,i.issue_date,i.counterparty,i.vat_number??"",
    i.direction==="income"?"Attiva":"Passiva",euroCents(money(i.amount)),
    euroCents(i.paidCents),euroCents(i.unmatchedCents)]),
 ]);
 const invoicesCsv=csv([
  ["FATTURE DELL'ANNO",yearText,"Non tutte sono state contabilizzate in partita doppia"],
  ["Numero","Data","Controparte","P.IVA","Entrata/Uscita","Importo lordo EUR",
   "Categoria","Verifica categoria"],
  ...report.yearlyInvoices.map(i=>[i.invoice_number,i.issue_date,i.counterparty,
    i.vat_number??"",i.direction==="income"?"Emessa":"Ricevuta",
    i.currency==="EUR"?euroCents(money(i.amount)):String(i.amount)+" "+i.currency,
    i.cost_category??"",i.category_status??""]),
 ]);
 const movementCsv=csv([
  ["MOVIMENTI BANCARI IMPORTATI",yearText,"Non garantisce completezza dei conti"],
  ["Data","Conto","Fonte","Controparte","Causale","Valuta","Importo"],
  ...report.importedInYear.map(t=>[t.booking_date,t.account_label??"",
    t.source,t.counterparty??"",t.description,t.currency,
    t.currency==="EUR"?euroCents(money(t.amount)):String(t.amount)]),
 ]);
 const balancesCsv=csv([
  ["SALDI BANCARI 31/12/"+year,"Riportati dall'utente e non certificati da DocuMio"],
  ["Conto","Saldo iniziale dichiarato EUR","Movimenti importati EUR",
   "Saldo chiusura 31/12 dichiarato EUR","Differenza teorica EUR",
   "Originale estratto collegato","Stato"],
  ...report.banks.map(b=>[b.label,b.openingCents===null?"":euroCents(b.openingCents),
    euroCents(b.importedCents),b.closingCents===null?"":euroCents(b.closingCents),
    b.differenceCents===null?"":euroCents(b.differenceCents),
    b.documented?"Sì":"No",b.status]),
 ]);
 const notes=[
  "DOCUMIO - DOCUMENTI PER IL COMMERCIALISTA",companyName,"Anno "+year,
  "",...report.warnings,"",
  "Nessuna funzione in questo pacchetto certifica il saldo reale della banca.",
  "Per ogni conto allegare l'estratto conto ufficiale con saldo contabile del 31 dicembre.",
  "Se il saldo iniziale non è noto, le differenze rimangono non calcolabili.",
  "Non utilizzare importi di fatture come sostituto delle scritture contabili.",
 ].join("\r\n");
 return {
  ["fatture_"+year+".csv"]:invoicesCsv,
  ["scadenzario_"+year+".csv"]:pendingCsv,
  ["movimenti_banche_"+year+".csv"]:movementCsv,
  ["saldi_bancari_31-12-"+year+".csv"]:balancesCsv,
  ["LEGGIMI.txt"]:notes,
 };
}
