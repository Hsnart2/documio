/**
 * Reconciliation suggestions are NOT accounting confirmations.
 * An unreferenced "acconto fatture" stays unapplied until a user explicitly
 * reviews and accepts its allocation to one/multiple open invoices.
 * Currency, direction and available cents are strict constraints.
 */
export type CashMovement={
 id:string;booking_date:string;amount:number;currency:string;
 counterparty:string|null;description:string;account_label?:string|null;
};
export type InvoiceForAllocation={
 id:string;invoice_number:string;issue_date:string;due_date:string|null;
 amount:number;currency:string;direction:"income"|"expense";counterparty:string;
 vat_number?:string|null;
};
export type Allocation={invoice_id:string;transaction_id:string;allocated_amount:number};
export type AllocationCandidate={
 invoiceId:string;invoiceNumber:string;counterparty:string;
 remaining:number;amount:number;score:number;reasons:string[];
 issueDate:string;dueDate:string|null;
};
export type TransferSuggestion={
 transactionId:string;bankAmount:number;unallocated:number;isAdvance:boolean;
 direction:"income"|"expense";confidence:"strong"|"needs_review"|"unresolved";
 candidates:AllocationCandidate[];proposed:AllocationCandidate[];
 remainingAfterProposal:number;notice:string;
};
const cents=(n:number)=>{
 if(!Number.isFinite(n)||Math.abs(n)>999999999999.99)throw Error("Importo non valido");
 return Math.round(n*100);
};
const asEur=(n:number)=>Number((n/100).toFixed(2));
const STOP=new Set(["srl","srls","spa","snc","sas","societa","cooperativa","cooperativa","credito","banca","bonifico","pagamento","fatture","fattura","acconto","acconti","saldofatture","soc","servizi","italia","group","holding","sede","spa"]);
export function normalizedWords(value:string){
 return (value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .replace(/[^a-z0-9]+/g," ").trim().split(/\s+/)
   .filter(word=>word.length>=4&&!STOP.has(word));
}
export function isAdvanceTransfer(text:string){
 return /\b(acconto|acconti|anticipo|anticipi|antic\.?)\b/i.test(text);
}
function invoiceReference(invoiceNo:string,text:string){
 const raw=invoiceNo.toUpperCase().replace(/[^A-Z0-9/]/g,"");
 if(raw.length<3)return false;
 const parts=raw.split("/").filter(Boolean);
 const source=text.toUpperCase().replace(/[^A-Z0-9]+/g," ");
 const compact=source.replace(/\s+/g,"");
 if(compact.includes(raw.replace(/\//g,"")))return true;
 // Numbers shorter than 4 digits are common and ambiguous. Exact token
 // references require a clear invoice prefix and a boundary.
 if(parts.length===1 && parts[0].length<4)return new RegExp(
   "(?:FATT(?:URA)?|FT|NR|N)\\s*[:#.-]?\\s*"+parts[0]+"\\b","i"
 ).test(text);
 return parts.length>=2&&parts.every(piece=>
   source.split(/\s+/).includes(piece));
}
function partyEvidence(invoice:InvoiceForAllocation,bank:CashMovement){
 const invoiceWords=normalizedWords(invoice.counterparty);
 if(!invoiceWords.length)return {yes:false,score:0};
 const bankWords=normalizedWords((bank.counterparty??"")+" "+bank.description);
 const bankSet=new Set(bankWords);
 const hits=invoiceWords.filter(x=>bankSet.has(x));
 const longest=hits.some(x=>x.length>=5);
 return {yes:longest||hits.length>=2,score:Math.min(36,hits.length*16)};
}
export function alreadyAllocated(transactionId:string,matches:Allocation[]){
 return asEur(matches.filter(m=>m.transaction_id===transactionId)
   .reduce((s,m)=>s+cents(Number(m.allocated_amount)),0));
}
export function invoiceRemaining(invoice:InvoiceForAllocation,matches:Allocation[]){
 const total=cents(Number(invoice.amount));
 const used=matches.filter(m=>m.invoice_id===invoice.id)
   .reduce((sum,m)=>sum+cents(Number(m.allocated_amount)),0);
 return asEur(Math.max(0,total-used));
}
/** Suggestions for one transfer. Never runs a database mutation. */
export function suggestTransferAllocations(
 movement:CashMovement,invoices:InvoiceForAllocation[],matches:Allocation[]
):TransferSuggestion{
 const direction=movement.amount>=0?"income":"expense";
 const advance=isAdvanceTransfer((movement.counterparty??"")+" "+movement.description);
 const transactionTotal=cents(Math.abs(Number(movement.amount)));
 const assigned=cents(alreadyAllocated(movement.id,matches));
 const bankRemaining=Math.max(0,transactionTotal-assigned);
 const valid=invoices.filter(inv=>
   inv.currency===movement.currency&&inv.direction===direction&&
   cents(invoiceRemaining(inv,matches))>0);
 const candidates=valid.flatMap(inv=>{
   const remain=cents(invoiceRemaining(inv,matches));
   const ref=invoiceReference(inv.invoice_number,movement.description);
   const person=partyEvidence(inv,movement);
   if(!ref&&!person.yes)return [];
   let score=(ref?55:0)+(person.yes?30:0)+person.score;
   const reasons:string[]=[];
   if(ref)reasons.push("Numero fattura riconosciuto nella causale");
   if(person.yes)reasons.push("Controparte compatibile");
   const date=Date.parse(movement.booking_date+"T00:00:00Z");
   const due=Date.parse((inv.due_date??inv.issue_date)+"T00:00:00Z");
   if(Number.isFinite(date)&&Number.isFinite(due)){
     const gap=Math.abs(date-due)/86400000;
     if(gap<=30){score+=8;reasons.push("Data compatibile");}
   }
   if(Math.abs(remain-bankRemaining)<=1){score+=10;reasons.push("Importo coincidente");}
   if(movement.booking_date<inv.issue_date){score-=12;reasons.push("Acconto precedente alla fattura: da verificare");}
   if(!person.yes&&ref){score-=14;reasons.push("Controparte non verificata");}
   return [{
     invoiceId:inv.id,invoiceNumber:inv.invoice_number,
     counterparty:inv.counterparty,remaining:asEur(remain),
     amount:asEur(Math.min(remain,bankRemaining)),score:Math.min(99,Math.max(0,score)),
     reasons,issueDate:inv.issue_date,dueDate:inv.due_date
   }];
 }).sort((a,b)=>b.score-a.score||(a.dueDate??a.issueDate).localeCompare(b.dueDate??b.issueDate));
 // Never invent a party identity. In no-reference cases apply the oldest
 // invoices from exactly one matched party, not random invoices/parties.
 const partyKeys=new Set(candidates.map(c=>normalizedWords(c.counterparty).join(" ")));
 const exact=candidates.filter(c=>c.reasons.some(x=>x.startsWith("Numero fattura")));
 const group=exact.length===1?exact:(partyKeys.size===1?candidates:[]);
 const sorted=[...group].sort((a,b)=>
  (a.dueDate??a.issueDate).localeCompare(b.dueDate??b.issueDate)
   ||a.issueDate.localeCompare(b.issueDate)||a.invoiceNumber.localeCompare(b.invoiceNumber));
 let leftover=bankRemaining;
 const proposed:AllocationCandidate[]=[];
 for(const candidate of sorted){
   if(leftover<=0||proposed.length>=20)break;
   const take=Math.min(cents(candidate.remaining),leftover);
   if(take<=0)continue;
   proposed.push({...candidate,amount:asEur(take)});
   leftover-=take;
 }
 const ambiguity=partyKeys.size>1||candidates.length===0 ||
   candidates.some(c=>!c.reasons.includes("Controparte compatibile"));
 const confidence:TransferSuggestion["confidence"]=!candidates.length?"unresolved"
   :!ambiguity&&exact.length===1&&!advance&&bankRemaining>0?"strong"
   :"needs_review";
 return {transactionId:movement.id,bankAmount:asEur(transactionTotal),
   unallocated:asEur(bankRemaining),isAdvance:advance,direction,
   confidence,candidates:candidates.slice(0,40),proposed,
   remainingAfterProposal:asEur(leftover),
   notice:!candidates.length?"Nessuna fattura sicura: l'acconto rimane da attribuire."
    :advance?"Acconto senza riferimenti certi: verifica cliente, cronologia e partite prima di confermare."
    :"Le proposte non dichiarano fatture pagate prima della conferma."};
}
export function remainingByTransaction(
 movements:CashMovement[],matches:Allocation[]
){
 return movements.map(m=>({
  ...m,allocated:alreadyAllocated(m.id,matches),
  unallocated:Math.max(0,asEur(cents(Math.abs(m.amount))-cents(alreadyAllocated(m.id,matches)))),
  isAdvance:isAdvanceTransfer((m.counterparty??"")+" "+m.description)
 }));
}
