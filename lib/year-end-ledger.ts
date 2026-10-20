/** Report civilistico NON ufficiale: esclusivamente scritture contabilizzate.
 * Tutti i calcoli sono in centesimi, senza arrotondamenti cumulativi.
 */
export type LedgerAccount = {id:string;code:string;name:string;account_type:string};
export type JournalEntry = {
 id:string;entry_date:string;description:string;status:string;created_at?:string;
};
export type JournalLine={id:string;entry_id:string;account_id:string;debit:number|string;credit:number|string};
export type AccountYear={
 id:string;code:string;name:string;account_type:string;openingCents:number;
 debitCents:number;creditCents:number;endingCents:number;
 endingDebitCents:number;endingCreditCents:number;
};
export type LedgerMovement={
 accountId:string;code:string;accountName:string;date:string;description:string;
 entryId:string;lineId:string;debitCents:number;creditCents:number;balanceCents:number;
};
export function cents(value:number|string):number{
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>999999999999.99)throw Error("Importo contabile non valido");
 return Math.round(n*100);
}
export function euroCents(value:number):string{
 return (value/100).toFixed(2).replace(".",",");
}
export function csvCell(value:string|number):string{
 const raw=String(value);
 // Protegge fogli Excel/Calc da formula injection anche con caratteri Unicode
 // invisibili e spazi iniziali.
 const safe=/^[\s\u200b-\u200f\ufeff]*[=+@\-]/u.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
export function csv(records:(string|number)[][]):string{
 return "\uFEFF"+records.map(r=>r.map(csvCell).join(";")).join("\r\n")+"\r\n";
}
export function annualLedger(year:number,accounts:LedgerAccount[],entries:JournalEntry[],lines:JournalLine[]){
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error("Anno non valido");
 const last=String(year)+"-12-31",first=String(year)+"-01-01";
 const accountMap=new Map(accounts.map(a=>[a.id,a]));
 const entryMap=new Map(entries.filter(e=>e.status==="posted"&&e.entry_date<=last)
  .map(e=>[e.id,e]));
 const byEntry=new Map<string,{count:number;debit:number;credit:number}>();
 const totals=new Map(accounts.map(a=>[a.id,{
  id:a.id,code:a.code,name:a.name,account_type:a.account_type,
  openingCents:0,debitCents:0,creditCents:0,endingCents:0,
  endingDebitCents:0,endingCreditCents:0,
 } as AccountYear]));
 const tx:Array<Omit<LedgerMovement,"balanceCents">>=[];
 for(const l of lines){
  const entry=entryMap.get(l.entry_id);
  if(!entry)continue;
  const account=accountMap.get(l.account_id);
  if(!account)throw Error("Scrittura con conto inesistente");
  const d=cents(l.debit),c=cents(l.credit);
  if((d>0)===(c>0))throw Error("Riga non valida: Dare/Avere");
  const row=totals.get(account.id)!;
  const control=byEntry.get(l.entry_id)??{count:0,debit:0,credit:0};
  control.count+=1;control.debit+=d;control.credit+=c;
  byEntry.set(l.entry_id,control);
  if(entry.entry_date<first)row.openingCents+=d-c;
  else {
   row.debitCents+=d;row.creditCents+=c;
   tx.push({accountId:account.id,code:account.code,accountName:account.name,
    date:entry.entry_date,description:entry.description,entryId:entry.id,
    lineId:l.id,debitCents:d,creditCents:c});
  }
 }
 for(const [entryId,entry] of entryMap){
  const control=byEntry.get(entryId);
  if(!control||control.count<2||control.debit!==control.credit||control.debit<=0)
   throw Error("Scrittura non quadrata o incompleta: "+entry.id);
 }
 for(const row of totals.values()){
  row.endingCents=row.openingCents+row.debitCents-row.creditCents;
  row.endingDebitCents=Math.max(row.endingCents,0);
  row.endingCreditCents=Math.max(-row.endingCents,0);
 }
 tx.sort((a,b)=>a.code.localeCompare(b.code,"it",{numeric:true})
  ||a.date.localeCompare(b.date)||a.entryId.localeCompare(b.entryId)
  ||a.lineId.localeCompare(b.lineId));
 const running=new Map([...totals.values()].map(a=>[a.id,a.openingCents]));
 const movements:LedgerMovement[]=tx.map(m=>{
  const next=(running.get(m.accountId)??0)+m.debitCents-m.creditCents;
  running.set(m.accountId,next);return {...m,balanceCents:next};
 });
 const accountTotals=[...totals.values()].sort((a,b)=>
  a.code.localeCompare(b.code,"it",{numeric:true}));
 const postedPeriod=[...entryMap.values()].filter(e=>e.entry_date>=first).length;
 const draftsPeriod=entries.filter(e=>e.status!=="posted"&&
  e.entry_date>=first&&e.entry_date<=last).length;
 return {
  year,accounts:accountTotals,movements,postedPeriod,draftsPeriod,
  historicalEntries:[...entryMap.values()].filter(e=>e.entry_date<first).length,
  periodDebitCents:accountTotals.reduce((s,x)=>s+x.debitCents,0),
  periodCreditCents:accountTotals.reduce((s,x)=>s+x.creditCents,0),
 };
}
export function ledgerCsv(report:ReturnType<typeof annualLedger>){
 const rows:(string|number)[][]=[
  ["PARTITARIO DI LAVORO - da verificare con il commercialista",String(report.year)],
  ["Origine: sole scritture contabilizzate DocuMio. Saldi iniziali incompleti senza storico/assestamenti."],
  ["Conto","Descrizione conto","Data","Causale","Dare EUR","Avere EUR",
   "Saldo progressivo Dare meno Avere EUR","ID registrazione"],
 ];
 const byAccount=new Map<string,LedgerMovement[]>();
 for(const m of report.movements){
  const existing=byAccount.get(m.accountId)??[];
  existing.push(m);byAccount.set(m.accountId,existing);
 }
 for(const a of report.accounts){
  rows.push([a.code,a.name,report.year+"-01-01",
   "Saldo iniziale da scritture disponibili","", "",euroCents(a.openingCents),""]);
  for(const m of byAccount.get(a.id)??[]){
   rows.push([m.code,m.accountName,m.date,m.description,euroCents(m.debitCents),
    euroCents(m.creditCents),euroCents(m.balanceCents),m.entryId]);
  }
  rows.push([a.code,a.name,report.year+"-12-31",
   "Saldo finale da scritture disponibili","", "",euroCents(a.endingCents),""]);
 }
 return csv(rows);
}
export function trialBalanceCsv(report:ReturnType<typeof annualLedger>){
 return csv([
  ["BILANCIO DI VERIFICA PROVVISORIO",String(report.year)],
  ["Non è il bilancio di esercizio; esclusi dati non contabilizzati, rettifiche e competenze"],
  ["Codice conto","Conto","Tipo",
   "Apertura dare EUR","Apertura avere EUR","Movimenti dare EUR","Movimenti avere EUR",
   "Chiusura dare EUR","Chiusura avere EUR"],
  ...report.accounts.map(a=>[a.code,a.name,a.account_type,
   euroCents(Math.max(a.openingCents,0)),euroCents(Math.max(-a.openingCents,0)),
   euroCents(a.debitCents),euroCents(a.creditCents),
   euroCents(a.endingDebitCents),euroCents(a.endingCreditCents)]),
  ["TOTALI","","","", "", euroCents(report.periodDebitCents),
   euroCents(report.periodCreditCents),"",""],
 ]);
}
