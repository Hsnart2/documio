"use client";

import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,CheckCircle2,CornerDownRight,Link2,Search,Undo2,Wallet,Split} from "lucide-react";
import {getSupabaseClient} from "@/lib/supabase";
import {suggestTransferAllocations,remainingByTransaction,
  invoiceRemaining,type InvoiceForAllocation} from "@/lib/bank-allocations";
import type {InvoiceRow,MovementRow,MatchRow} from "@/lib/financial-control";
import "./bank-reconciliation.css";

type Review={
 transaction_id:string;classification:string;note:string;
};
type AllocationDraft={invoiceId:string;amount:string};
type Props={
 userId:string;companyId:string|null;invoices:InvoiceRow[];
 movements:MovementRow[];matches:MatchRow[];loading:boolean;
 onUpdated:()=>Promise<void>;
};
const euro=(v:number)=>new Intl.NumberFormat("it-IT",{
 style:"currency",currency:"EUR",
}).format(v);
const currency=(n:number)=>Math.round(n*100)/100;
const numeric=(raw:string)=>{
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()))return null;
 const n=Number(raw.replace(",","."));
 return Number.isFinite(n)&&n>0?currency(n):null;
};
const descriptions:Record<string,string>={
 to_review:"Da verificare",advance:"Acconto da attribuire",
 non_invoice:"Operazione non collegata a fattura",
 own_transfer:"Giroconto tra conti",invoice_payment:"Fatture riconciliate",
};
const isoDate=(date:string)=>new Date(date+"T12:00:00").toLocaleDateString("it-IT");
export default function BankReconciliationPanel({
 userId,companyId,invoices,movements,matches,loading,onUpdated,
}:Props){
 const [selectedId,setSelectedId]=useState("");
 const [search,setSearch]=useState("");
 const [onlyPending,setOnlyPending]=useState(true);
 const [draft,setDraft]=useState<AllocationDraft[]>([]);
 const [manualInvoiceId,setManualInvoiceId]=useState("");
 const [manualAmount,setManualAmount]=useState("");
 const [reviews,setReviews]=useState<Review[]>([]);
 const [classification,setClassification]=useState("to_review");
 const [note,setNote]=useState("");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");

 const bankRows=useMemo(()=>remainingByTransaction(movements,matches),[movements,matches]);
 const filtered=useMemo(()=>{
   const q=search.toLowerCase().trim();
   return bankRows.filter(row=>(!onlyPending||row.unallocated>.009)&&
    (!q||[row.counterparty,row.description,row.account_label]
     .join(" ").toLowerCase().includes(q))).slice(0,200);
 },[bankRows,search,onlyPending]);
 const selected=bankRows.find(row=>row.id===selectedId)??filtered[0]??null;
 const allocations=matches.filter(m=>m.transaction_id===selected?.id);
 const rowDirection=selected?.amount&&selected.amount>=0?"income":"expense";
 const eligible=selected?invoices.filter(inv=>
   inv.currency===selected.currency&&inv.direction===rowDirection&&
   invoiceRemaining(inv as InvoiceForAllocation,matches)>.009):[];
 const recommendation=useMemo(()=>selected?
   suggestTransferAllocations(selected as typeof selected,eligible as InvoiceForAllocation[],matches):null,
   [selected,eligible,matches]);
 const allocatedAlready=allocations.reduce((sum,m)=>sum+Number(m.allocated_amount),0);
 const bankBalance=selected?currency(Math.max(0,Math.abs(selected.amount)-allocatedAlready)):0;
 const staged=draft.reduce((sum,d)=>sum+(numeric(d.amount)??0),0);
 const remaining=currency(Math.max(0,bankBalance-staged));
 const currentReview=reviews.find(r=>r.transaction_id===selected?.id);
 const status=currentReview?.classification??(recommendation?.isAdvance?"advance":"to_review");

 useEffect(()=>{
   setDraft([]);setManualInvoiceId("");setManualAmount("");setError("");setMessage("");
   setClassification("to_review");setNote("");
 },[companyId,selected?.id]);
 useEffect(()=>{
   if(!selected)return;
   setClassification(currentReview?.classification??(
     recommendation?.isAdvance?"advance":"to_review"));
   setNote(currentReview?.note??"");
 },[selected?.id,currentReview?.classification,currentReview?.note,recommendation?.isAdvance]);
 useEffect(()=>{
   const sb=getSupabaseClient();if(!sb)return;
   let active=true;
   async function load(){
     const scope=sb.from("financial_transaction_reviews")
      .select("transaction_id,classification,note").eq("user_id",userId);
     const {data,error:issue}=await (companyId
       ?scope.eq("company_id",companyId):scope.is("company_id",null))
        .limit(4000);
     if(active&&!issue)setReviews((data??[]) as Review[]);
   }
   void load();
   return ()=>{active=false;};
 },[userId,companyId]);

 function loadProposal(){
   if(!recommendation)return;
   setDraft(recommendation.proposed.map(s=>({
     invoiceId:s.invoiceId,amount:s.amount.toFixed(2),
   })));
   setError("");setMessage("Proposta caricata. Verifica e conferma manualmente le fatture.");
 }
 function addInvoice(){
   if(!selected||!manualInvoiceId)return;
   const inv=eligible.find(x=>x.id===manualInvoiceId);
   if(!inv)return;
   if(draft.some(d=>d.invoiceId===inv.id)){
     setError("Fattura già presente nella ripartizione.");return;
   }
   const max=currency(Math.min(remaining,invoiceRemaining(inv as InvoiceForAllocation,matches)));
   const amount=numeric(manualAmount)||max;
   if(amount<=0||amount>max+.001){setError("Quota maggiore del residuo disponibile.");return;}
   if(draft.length>=20){setError("Massimo 20 fatture per bonifico.");return;}
   setDraft([...draft,{invoiceId:inv.id,amount:amount.toFixed(2)}]);
   setManualInvoiceId("");setManualAmount("");setError("");
 }
 function amend(index:number,value:string){
   setDraft(previous=>previous.map((d,i)=>i===index?{...d,amount:value}:d));
 }
 async function confirm(){
   if(!selected||!draft.length||saving||loading)return;
   let total=0;
   const parsed=draft.map(row=>{
     const amount=numeric(row.amount);
     const inv=eligible.find(i=>i.id===row.invoiceId);
     if(amount===null||!inv||amount>invoiceRemaining(inv as InvoiceForAllocation,matches)+.001)
       throw new Error("Importi o fatture non validi: verifica i residui.");
     total+=amount;return {invoiceId:row.invoiceId,amount:amount.toFixed(2)};
   });
   if(new Set(parsed.map(r=>r.invoiceId)).size!==parsed.length){
     setError("Non ripetere la stessa fattura.");return;
   }
   if(total>bankBalance+.001){setError("La somma supera il bonifico disponibile.");return;}
   const summary=parsed.map(p=>{
     const invoice=eligible.find(i=>i.id===p.invoiceId)!;
     return invoice.invoice_number+" — "+euro(Number(p.amount));
   }).join("\n");
   if(!window.confirm(
    "ATTENZIONE: stai CONFERMANDO l'attribuzione bancaria a "+parsed.length+
    " fatture, anche senza numero fattura nella causale.\n\n"+summary+
    "\n\nTotale imputato "+euro(total)+"; acconto residuo "+euro(bankBalance-total)+
    ".\nHai verificato ordinante/beneficiario e documenti?"
   ))return;
   const sb=getSupabaseClient();if(!sb)return;
   setSaving(true);setError("");setMessage("");
   const {data,error:issue}=await sb.rpc("documio_confirm_bank_allocations",{
     p_transaction_id:selected.id,p_allocations:parsed,
     p_matching_method:"reviewed_suggestion",
   });
   setSaving(false);
   if(issue){setError("Bonifico non attribuito: "+issue.message);return;}
   setMessage("Ripartizione confermata. Residuo non attribuito: "+euro(Number(data?.unallocated??0)));
   setDraft([]);
   await onUpdated();
 }
 async function undo(match:MatchRow){
   if(saving||loading||!window.confirm(
     "Revocare l'attribuzione di "+euro(Number(match.allocated_amount))+
     " a questa fattura? Il movimento bancario non viene eliminato."
   ))return;
   const sb=getSupabaseClient();if(!sb)return;
   setSaving(true);setError("");
   const {error:issue}=await sb.from("financial_matches")
     .delete().eq("id",match.id).eq("user_id",userId);
   setSaving(false);
   if(issue){setError("Impossibile revocare: "+issue.message);return;}
   setMessage("Ripartizione revocata. Evento registrato nell'audit.");
   await onUpdated();
 }
 async function saveReview(){
   if(!selected||saving)return;
   const sb=getSupabaseClient();if(!sb)return;
   setSaving(true);setError("");
   const {error:issue}=await sb.from("financial_transaction_reviews").upsert({
     user_id:userId,company_id:companyId,transaction_id:selected.id,
     classification,note:note.trim().slice(0,800),
   },{onConflict:"transaction_id,user_id"});
   setSaving(false);
   if(issue){setError("Classificazione non salvata: "+issue.message);return;}
   setReviews(prev=>[...prev.filter(r=>r.transaction_id!==selected.id),
     {transaction_id:selected.id,classification,note:note.trim()}]);
   setMessage("Stato del movimento salvato, senza chiusura automatica di fatture.");
 }
 const manualOptions=eligible.filter(inv=>!draft.some(d=>d.invoiceId===inv.id)).slice(0,500);
 return <section className="fc-panel fc-recon">
  <h2><Split size={21}/> Riconciliazione acconti e fatture</h2>
  <p className="fc-muted">Bonifici con causale generica, acconti, un bonifico per più fatture,
   pagamenti parziali e saldi in entrata/uscita. DocuMio propone le attribuzioni,
   ma non chiude una fattura ambigua senza la tua conferma.</p>
  {error&&<div className="fc-recon-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {message&&<div className="fc-recon-message" role="status"><CheckCircle2 size={16}/>{message}</div>}
  <div className="fc-recon-columns">
   <div className="fc-recon-left">
    <label className="fc-recon-filter"><Search size={17}/>
     <input type="search" value={search} placeholder="Filtra banca, controparte, causale..."
      onChange={e=>setSearch(e.target.value)}/></label>
    <label className="fc-recon-pending"><input type="checkbox" checked={onlyPending}
       onChange={e=>setOnlyPending(e.target.checked)}/>
      Mostra solo bonifici con importi da attribuire</label>
    <div className="fc-recon-tx">
     {filtered.map(row=><button type="button" key={row.id}
       className={row.id===selected?.id?"selected":""}
       onClick={()=>setSelectedId(row.id)}>
       <span><strong>{row.counterparty||row.description.slice(0,64)||"Movimento bancario"}</strong>
         <small>{isoDate(row.booking_date)} · {row.account_label||"Conto"}
           {" · "}{row.description.slice(0,86)}</small>
         {row.isAdvance&&<small className="fc-recon-advance">Acconto da attribuire</small>}
       </span>
       <span className={row.amount<0?"out":"in"}>
        {euro(row.amount)}<small>Libero {euro(row.unallocated)}</small>
       </span>
      </button>)}
     {!filtered.length&&<p className="fc-muted">Nessun bonifico da mostrare. Collega le banche o importa CSV.</p>}
    </div>
    {bankRows.length>200&&<small className="fc-muted">Visualizzati i primi 200: usa il filtro per cercare altri bonifici.</small>}
   </div>
   <div className="fc-recon-right">
    {selected?<>
     <div className="fc-recon-selection"><strong>{euro(selected.amount)} · {selected.account_label||"Conto"}</strong>
       <small>{isoDate(selected.booking_date)} · {selected.currency} ·
         {selected.counterparty||"Controparte non disponibile"}</small>
       <p>{selected.description||"Causale non disponibile"}</p>
       <div className="fc-recon-balances">
        <span>Bonifico <b>{euro(Math.abs(selected.amount))}</b></span>
        <span>Già attribuito <b>{euro(allocatedAlready)}</b></span>
        <span>Acconto residuo <b>{euro(bankBalance)}</b></span>
       </div>
     </div>
     <div className="fc-recon-review">
      <strong>Classificazione del movimento</strong>
      <select value={classification} onChange={e=>setClassification(e.target.value)}>
       {Object.entries(descriptions).map(([id,label])=>
         <option key={id} value={id}>{label}</option>)}
      </select>
      <input maxLength={800} value={note} placeholder="Nota interna (es. acconto fatture di ottobre)"
       onChange={e=>setNote(e.target.value)}/>
      <button type="button" disabled={saving} onClick={()=>void saveReview()}>Salva nota/stato</button>
     </div>
     {allocations.length>0&&<div className="fc-recon-existing">
      <strong>Attribuzioni confermate</strong>
      {allocations.map(match=>{
       const inv=invoices.find(i=>i.id===match.invoice_id);
       return <div key={match.id}>
        <span>{inv?.invoice_number||"Fattura"} · {inv?.counterparty||""}
         {" — "}{euro(Number(match.allocated_amount))}</span>
        <button type="button" disabled={saving||loading}
          onClick={()=>void undo(match)} aria-label="Revoca abbinamento"><Undo2 size={15}/> Revoca</button>
       </div>;
      })}
     </div>}
     {bankBalance>.009&&<>
       <div className="fc-recon-proposals">
        <strong><Wallet size={17}/> Suggerimento DocuMio</strong>
        <p>{recommendation?.notice}</p>
        {(recommendation?.candidates.length??0)>0&&
          <p className="fc-muted">{recommendation?.candidates.length} fatture candidate;
            {recommendation?.confidence==="strong"?" riferimento fattura individuato.":" serve verifica manuale."}
          </p>}
        {!!recommendation?.proposed.length&&<button type="button"
          onClick={loadProposal}>Precompila proposta per {recommendation.proposed.length} fatture</button>}
        {recommendation?.candidates.slice(0,8).map(c=><p key={c.invoiceId}>
         <CornerDownRight size={13}/> {c.invoiceNumber} · {c.counterparty}
           {" · residuo "}{euro(c.remaining)}
           <small> {c.reasons.join(", ")}</small>
        </p>)}
        {!recommendation?.candidates.length&&<p className="fc-muted">
          Non attribuisco automaticamente l'acconto: scegli una o più fatture dopo aver verificato l'ordinante.
        </p>}
       </div>
       <div className="fc-recon-draft">
        <strong>Ripartisci il bonifico tra fatture</strong>
        {draft.map((d,i)=>{
         const invoice=eligible.find(inv=>inv.id===d.invoiceId);
         return <label key={d.invoiceId}><span>{invoice?.invoice_number} ·
          {invoice?.counterparty} (aperta {euro(invoice?
            invoiceRemaining(invoice as InvoiceForAllocation,matches):0)})</span>
           <input inputMode="decimal" value={d.amount}
             onChange={e=>amend(i,e.target.value)}/>
           <button type="button" onClick={()=>setDraft(prev=>prev.filter((_,j)=>j!==i))}
             aria-label="Togli fattura">×</button>
         </label>;
        })}
        <div className="fc-recon-add">
         <select value={manualInvoiceId}
            onChange={e=>setManualInvoiceId(e.target.value)}>
          <option value="">Seleziona qualsiasi fattura aperta compatibile</option>
          {manualOptions.map(inv=><option key={inv.id} value={inv.id}>
           {inv.invoice_number} · {inv.counterparty} · aperta
             {" "}{euro(invoiceRemaining(inv as InvoiceForAllocation,matches))}
          </option>)}
         </select>
         <input inputMode="decimal" value={manualAmount} placeholder="Quota €, opzionale"
           onChange={e=>setManualAmount(e.target.value)}/>
         <button type="button" onClick={addInvoice} disabled={!manualInvoiceId||saving}>
           <Link2 size={15}/> Aggiungi</button>
        </div>
        <p>Da confermare: <b>{euro(staged)}</b> ·
         Resterà da attribuire: <b>{euro(remaining)}</b></p>
        <button className="fc-button" type="button" disabled={!draft.length||saving||loading}
          onClick={()=>void confirm()}>Conferma attribuzione (con controllo)</button>
       </div>
     </>}
    </>:<p className="fc-muted">Seleziona un bonifico per vedere le fatture aperte e gli acconti.</p>}
   </div>
  </div>
 </section>;
}
