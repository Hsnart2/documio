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
 confirmed_at?:string|null;matching_method?:string|null;
};
export type CompanyReview={
 transaction_id:string;classification:string;note:string;
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
 movements:CompanyMovement[],matches:CompanyMatch[],statements:BankStatement[],
 reviews:CompanyReview[]=[]){
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error("Anno non valido");
 const first=year+"-01-01",last=year+"-12-31";
 const endInvoices=invoices.filter(i=>i.issue_date<=last);
 const invoiceById=new Map(endInvoices.map(i=>[i.id,i]));
 const yearlyInvoices=endInvoices.filter(i=>i.issue_date>=first);
 const movementsToEnd=new Map(movements.filter(t=>t.booking_date<=last)
  .map(t=>[t.id,t]));
 const importedInYear=movements.filter(t=>t.booking_date>=first&&t.booking_date<=last);
 const reviewMap=new Map(reviews.map(r=>[r.transaction_id,r]));
 const byBank=new Map<string,number>();
 const attributedDetails:Array<{transaction:CompanyMovement;invoice:CompanyInvoice|null;
   amountCents:number;method:string;confirmedAt:string|null}>=[];
 const invoicePaid=new Map<string,number>();
 for(const m of matches){
  const tx=movementsToEnd.get(m.transaction_id);
  if(!tx)continue;
  const invoice=invoiceById.get(m.invoice_id);
  if(!invoice||tx.currency!==invoice.currency)continue;
  invoicePaid.set(invoice.id,(invoicePaid.get(invoice.id)??0)+money(m.allocated_amount));
  byBank.set(tx.id,(byBank.get(tx.id)??0)+money(m.allocated_amount));
  if(tx.booking_date>=first){
    attributedDetails.push({transaction:tx,invoice,
      amountCents:money(m.allocated_amount),method:m.matching_method??"manual",
      confirmedAt:m.confirmed_at??null});
  }
 }
 const bankUnattributed=importedInYear.map(tx=>{
   const full=Math.abs(money(tx.amount));
   const allocated=byBank.get(tx.id)??0;
   return {...tx,allocatedCents:allocated,
      residualCents:Math.max(0,full-allocated),
      classification:reviewMap.get(tx.id)?.classification??
        (/\\b(acconto|acconti|anticipo)\\b/i.test(tx.description)?"advance":"to_review"),
      reviewNote:reviewMap.get(tx.id)?.note??""};
 }).filter(tx=>tx.residualCents>0);
 const details:Pending[]=endInvoices.filter(i=>i.currency==="EUR").map(i=>{
   const full=money(i.amount);
   const paid=Math.min(Math.max(invoicePaid.get(i.id)??0,0),Math.abs(full));
   return {...i,paidCents:paid,unmatchedCents:Math.max(0,Math.abs(full)-paid)};
 });
 const open=details.filter(i=>i.unmatchedCents>0);
 const byCounterparty=new Map<string,{
  counterparty:string;vatNumber:string;direction:string;invoiceCount:number;
  invoicedCents:number;paidCents:number;unmatchedCents:number;
 }>();
 for(const invoice of details){
  const key=invoice.direction+"|"+(invoice.vat_number?.trim()||
    invoice.counterparty.toLowerCase().replace(/\s+/g," ").trim());
  const group=byCounterparty.get(key)??{
   counterparty:invoice.counterparty,vatNumber:invoice.vat_number??"",
   direction:invoice.direction,invoiceCount:0,invoicedCents:0,paidCents:0,
   unmatchedCents:0,
  };
  group.invoiceCount++;
  group.invoicedCents+=money(invoice.amount);
  group.paidCents+=invoice.paidCents;
  group.unmatchedCents+=invoice.unmatchedCents;
  byCounterparty.set(key,group);
 }
 const counterparties=[...byCounterparty.values()].sort((a,b)=>
   a.counterparty.localeCompare(b.counterparty,"it"));
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
  year,yearlyInvoices,open,counterparties,importedInYear,banks,
  bankUnattributed,attributedDetails,
  totals:{invoicedIncome,invoicedCosts,pendingReceivables,pendingPayables,
    unallocatedBankCents:bankUnattributed.reduce((sum,tx)=>sum+tx.residualCents,0),
    unallocatedMovements:bankUnattributed.length,
    advancesToVerify:bankUnattributed.filter(tx=>tx.classification==="advance").length,
    bankStatements:statements.filter(s=>s.currency==="EUR"&&s.fiscal_year===year).length,
    bankClosingCents:banks.every(b=>b.closingCents!==null)&&banks.length>0
      ?banks.reduce((s,b)=>s+(b.closingCents??0),0):null},
  warnings:[
   "Sono riportate fatture registrate e importi lordi, non un conto economico fiscale.",
   "Le fatture non riconciliate non sono necessariamente insolute; verificare pagamenti esterni e incassi cumulativi.",
   "Gli acconti non attribuiti alle fatture sono conservati come partite da verificare, anche in assenza di numero fattura nella causale.",
   "Le proposte di ripartizione non costituiscono incasso/pagamento accertato prima della conferma dell'utente.",
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
 const counterpartiesCsv=csv([
  ["PROSPETTO CLIENTI E FORNITORI AL 31/12/"+year,
   "Da riconciliare e validare; non è il partitario fiscale completo"],
  ["Tipo","Controparte","P.IVA","Fatture registrate","Totale lordo fatture EUR",
   "Pagamenti abbinati entro il 31/12 EUR","Saldo da riconciliare EUR"],
  ...report.counterparties.map(c=>[c.direction==="income"?"Clienti":"Fornitori",
    c.counterparty,c.vatNumber,c.invoiceCount,euroCents(c.invoicedCents),
    euroCents(c.paidCents),euroCents(c.unmatchedCents)]),
 ]);
 const movementCsv=csv([
  ["MOVIMENTI BANCARI IMPORTATI",yearText,"Non garantisce completezza dei conti"],
  ["Data","Conto","Fonte","Controparte","Causale","Valuta","Importo"],
  ...report.importedInYear.map(t=>[t.booking_date,t.account_label??"",
    t.source,t.counterparty??"",t.description,t.currency,
    t.currency==="EUR"?euroCents(money(t.amount)):String(t.amount)]),
 ]);
 const allocationsCsv=csv([
  ["ATTRIBUZIONI BANCARIE CONFERMATE - "+year,
   "Una riga per ciascuna fattura collegata a un movimento"],
  ["Data banca","Conto","Controparte banca","Causale banca",
   "Fattura","Cliente/Fornitore","Tipo","Quota EUR","Metodo","Confermata il"],
  ...report.attributedDetails.map(row=>[
    row.transaction.booking_date,row.transaction.account_label??"",
    row.transaction.counterparty??"",row.transaction.description,
    row.invoice?.invoice_number??"",row.invoice?.counterparty??"",
    row.invoice?.direction==="income"?"Incasso":"Pagamento",
    euroCents(row.amountCents),row.method,row.confirmedAt??"",
  ]),
 ]);
 const unappliedCsv=csv([
  ["ACCONTI E MOVIMENTI NON ATTRIBUITI - "+year,
   "Non dichiararli debiti o crediti definitivi senza documenti"],
  ["Data","Conto","Controparte","Causale","Direzione",
   "Importo movimento EUR","Già attribuito EUR","Rimanente EUR",
   "Classificazione","Nota/revisione"],
  ...report.bankUnattributed.filter(tx=>tx.currency==="EUR").map(tx=>[
    tx.booking_date,tx.account_label??"",tx.counterparty??"",tx.description,
    Number(tx.amount)>0?"Incasso":"Uscita",euroCents(money(tx.amount)),
    euroCents(tx.allocatedCents),euroCents(tx.residualCents),
    tx.classification,tx.reviewNote,
  ]),
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
  ["partitario_clienti_fornitori_da_verificare_"+year+".csv"]:counterpartiesCsv,
  ["movimenti_banche_"+year+".csv"]:movementCsv,
  ["attribuzioni_fatture_confermate_"+year+".csv"]:allocationsCsv,
  ["acconti_e_movimenti_da_verificare_"+year+".csv"]:unappliedCsv,
  ["saldi_bancari_31-12-"+year+".csv"]:balancesCsv,
  ["LEGGIMI.txt"]:notes,
 };
}
