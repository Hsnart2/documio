"use client";

import { useCallback,useEffect,useMemo,useRef,useState,type FormEvent } from "react";
import { Calculator,CheckCircle2,FileSpreadsheet,Plus,ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type Account={id:string;code:string;name:string;account_type:string;active:boolean};
type Entry={id:string;description:string;entry_date:string;status:"draft"|"posted";posted_at:string|null};
type Totals={account_id:string;code:string;name:string;account_type:string;debit:number;credit:number};
type VatItem={id:string;period:string;direction:"sale"|"purchase";description:string;taxable:number;vat:number;status:"needs_review"|"confirmed"};
type Props={clientId:string;studioId:string;canEdit:boolean;canPost:boolean};
function amount(text:string):number|null{
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim()))return null;
 const value=Number(text.replace(",","."));
 return Number.isFinite(value)&&value>0&&value<=999999999999.99?
   Math.round(value*100)/100:null;
}
const euro=(v:number)=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(v);
const today=()=>{
 const now=new Date();
 const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,10);
};
export default function ProfessionalAccountingPanel({clientId,studioId,canEdit,canPost}:Props){
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [entries,setEntries]=useState<Entry[]>([]);
 const [totals,setTotals]=useState<Totals[]>([]);
 const [vatItems,setVatItems]=useState<VatItem[]>([]);
 const [draft,setDraft]=useState({entry_date:today(),description:"",debit:"",credit:"",value:""});
 const [vat,setVat]=useState({period:today().slice(0,7),direction:"sale" as VatItem["direction"],
   description:"",taxable:"",vat:""});
 const [newAccount,setNewAccount]=useState({code:"",name:"",account_type:"expense"});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const current=useRef(0);

 const reload=useCallback(async()=>{
   const sb=getSupabaseClient();if(!sb)return;
   const run=++current.current;
   const [a,e,t,v]=await Promise.all([
     sb.from("professional_ledger_accounts").select("id,code,name,account_type,active")
       .eq("studio_id",studioId).eq("client_id",clientId).order("code").limit(250),
     sb.from("professional_journal_entries")
       .select("id,description,entry_date,status,posted_at")
       .eq("studio_id",studioId).eq("client_id",clientId)
       .order("entry_date",{ascending:false}).limit(250),
     sb.from("professional_ledger_totals")
       .select("account_id,code,name,account_type,debit,credit")
       .eq("studio_id",studioId).eq("client_id",clientId).order("code").limit(250),
     sb.from("professional_vat_items").select("id,period,direction,description,taxable,vat,status")
       .eq("studio_id",studioId).eq("client_id",clientId)
       .order("created_at",{ascending:false}).limit(250),
   ]);
   if(run!==current.current)return;
   if(a.error||e.error||t.error||v.error){
     setError("Contabilità non disponibile. Verificare l'attivazione del modulo e i permessi.");return;
   }
   setAccounts((a.data??[]) as Account[]);
   setEntries((e.data??[]) as Entry[]);
   setTotals((t.data??[]) as Totals[]);
   setVatItems((v.data??[]) as VatItem[]);
 },[studioId,clientId]);
 useEffect(()=>{setAccounts([]);setEntries([]);setTotals([]);setVatItems([]);
   setError("");setNotice("");void reload();
   return ()=>{current.current+=1;};
 },[reload]);

 const balance=useMemo(()=>totals.map(row=>{
   const debit=Number(row.debit)||0,credit=Number(row.credit)||0;
   return {...row,balance:["asset","expense"].includes(row.account_type)?debit-credit:credit-debit};
 }),[totals]);
 const profit=balance.reduce((sum,a)=>sum+(a.account_type==="revenue"?a.balance:
     a.account_type==="expense"?-a.balance:0),0);
 const debitTotal=balance.reduce((sum,a)=>sum+(Number(a.debit)||0),0);
 const creditTotal=balance.reduce((sum,a)=>sum+(Number(a.credit)||0),0);
 const vatDebit=vatItems.filter(x=>x.direction==="sale").reduce((a,x)=>a+Number(x.vat),0);
 const vatCredit=vatItems.filter(x=>x.direction==="purchase").reduce((a,x)=>a+Number(x.vat),0);

 async function makeEntry(e:FormEvent){
   e.preventDefault();if(!canEdit||busy)return;
   const sum=amount(draft.value);
   if(!sum||draft.debit===draft.credit||!draft.debit||!draft.credit||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.entry_date)){
     setError("Indica data, importo positivo e due conti differenti.");return;
   }
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {data,error:issue}=await sb.rpc("documio_create_journal",{
     p_client_id:clientId,p_entry_date:draft.entry_date,p_description:draft.description.trim(),
     p_debit_account:draft.debit,p_credit_account:draft.credit,p_amount:sum,
   });
   setBusy(false);
   if(issue||!data){setError("Scrittura non salvata: "+(issue?.message??"riprova"));return;}
   setNotice("Scrittura in bozza creata in Dare/Avere: da approvare prima della contabilizzazione.");
   setDraft({...draft,description:"",value:""});await reload();
 }
 async function postEntry(entry:Entry){
   if(!canPost||busy||entry.status!=="draft")return;
   if(!window.confirm("Confermi di aver verificato conti, importi e documenti? La scrittura diventerà immutabile."))return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {data,error:issue}=await sb.from("professional_journal_entries")
     .update({status:"posted"}).eq("id",entry.id).eq("client_id",clientId)
     .select("id").maybeSingle();
   setBusy(false);
   if(issue||!data){setError("Contabilizzazione non consentita: "+(issue?.message??"controlla la quadratura"));return;}
   setNotice("Scrittura contabilizzata con quadratura Dare/Avere verificata.");
   await reload();
 }
 async function createAccount(e:FormEvent){
   e.preventDefault();if(!canEdit||busy)return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {error:issue}=await sb.from("professional_ledger_accounts").insert({
     studio_id:studioId,client_id:clientId,code:newAccount.code.trim(),
     name:newAccount.name.trim(),account_type:newAccount.account_type,
   });
   setBusy(false);
   if(issue){setError("Conto non creato: "+issue.message);return;}
   setNewAccount({code:"",name:"",account_type:"expense"});
   setNotice("Conto aggiunto al piano dei conti.");await reload();
 }
 async function addVat(e:FormEvent){
   e.preventDefault();if(!canEdit||busy)return;
   const taxable=amount(vat.taxable),tax=Number(vat.vat.replace(",","."));
   if(taxable===null||!Number.isFinite(tax)||tax<0||!/^\d{4}-\d{2}$/.test(vat.period)){
     setError("Periodo, imponibile e IVA devono essere validi.");return;
   }
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {error:issue}=await sb.from("professional_vat_items").insert({
     studio_id:studioId,client_id:clientId,period:vat.period,direction:vat.direction,
     description:vat.description.trim(),taxable,vat:Math.round(tax*100)/100,
     status:"needs_review",created_by:(await sb.auth.getUser()).data.user?.id,
   });
   setBusy(false);
   if(issue){setError("Voce IVA non salvata: "+issue.message);return;}
   setNotice("Voce IVA provvisoria salvata, senza invio o liquidazione ufficiale.");
   setVat({...vat,description:"",taxable:"",vat:""});await reload();
 }
 async function confirmVat(item:VatItem){
   if(!canPost||busy||item.status!=="needs_review")return;
   if(!window.confirm("Confermi gli importi IVA e l'originale? Non equivale a liquidazione LIPE."))return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {data,error:issue}=await sb.from("professional_vat_items")
     .update({status:"confirmed"}).eq("client_id",clientId).eq("id",item.id)
     .select("id").maybeSingle();
   setBusy(false);
   if(issue||!data){setError("IVA non confermata: "+(issue?.message??"riprova"));return;}
   setNotice("Voce IVA validata come registrazione interna.");
   await reload();
 }
 return <section className="prf-panel">
   <div className="prf-panel-head"><h2><Calculator size={21}/> Contabilità cliente — prima nota</h2>
     <span>Solo EUR · Revisione umana</span></div>
   <p className="prf-muted">Piano dei conti separato per ogni azienda cliente. La scrittura
     viene contabilizzata solo se Dare e Avere coincidono e un professionista la approva.
     Non è ancora un bilancio civilistico o un sistema di dichiarazioni fiscali.</p>
   {error&&<div className="prf-alert" role="alert">{error}</div>}
   {notice&&<div className="prf-notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
   <div className="prf-summary">
     <div><FileSpreadsheet size={18}/><strong>{entries.filter(x=>x.status==="posted").length}</strong><small>Contabilizzate</small></div>
     <div><FileSpreadsheet size={18}/><strong>{entries.filter(x=>x.status==="draft").length}</strong><small>Bozze</small></div>
     <div><Calculator size={18}/><strong>{euro(profit)}</strong><small>Saldo ricavi − costi*</small></div>
   </div>
   <p className="prf-muted">*Stima sui soli movimenti contabilizzati. Non comprende
      assestamenti, competenza, rimanenze, fiscalità o scritture mancanti.</p>
   {canEdit&&<div className="prf-accounting-grid">
     <form className="prf-stack" onSubmit={e=>void makeEntry(e)}>
       <h3>Nuova scrittura Dare / Avere</h3>
       <label className="prf-field">Data
         <input type="date" required value={draft.entry_date}
           onChange={e=>setDraft({...draft,entry_date:e.target.value})}/></label>
       <label className="prf-field">Descrizione
         <input required minLength={3} maxLength={400} value={draft.description}
           onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
       <label className="prf-field">Conto Dare
         <select required value={draft.debit} onChange={e=>setDraft({...draft,debit:e.target.value})}>
           <option value="">Seleziona conto</option>
           {accounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
         </select></label>
       <label className="prf-field">Conto Avere
         <select required value={draft.credit} onChange={e=>setDraft({...draft,credit:e.target.value})}>
           <option value="">Seleziona conto</option>
           {accounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
         </select></label>
       <label className="prf-field">Importo EUR
         <input required inputMode="decimal" placeholder="1200,00" value={draft.value}
           onChange={e=>setDraft({...draft,value:e.target.value})}/></label>
       <button type="submit" className="prf-primary" disabled={busy||accounts.length<2}>
         <Plus size={16}/> Salva bozza</button>
     </form>
     <form className="prf-stack" onSubmit={e=>void createAccount(e)}>
       <h3>Aggiungi conto personalizzato</h3>
       <label className="prf-field">Codice
         <input required maxLength={20} placeholder="5950" value={newAccount.code}
           onChange={e=>setNewAccount({...newAccount,code:e.target.value})}/></label>
       <label className="prf-field">Nome
         <input required maxLength={160} value={newAccount.name}
           onChange={e=>setNewAccount({...newAccount,name:e.target.value})}/></label>
       <label className="prf-field">Tipologia
         <select value={newAccount.account_type}
           onChange={e=>setNewAccount({...newAccount,account_type:e.target.value})}>
           <option value="asset">Attività</option><option value="liability">Passività</option>
           <option value="equity">Patrimonio netto</option><option value="revenue">Ricavo</option>
           <option value="expense">Costo</option>
         </select></label>
       <button className="prf-outline" disabled={busy}><Plus size={16}/> Nuovo conto</button>
     </form>
   </div>}
   <h3 className="prf-subtitle">Registrazioni recenti</h3>
   <div className="prf-accounting-list">
     {entries.map(e=><div key={e.id}>
       <span><strong>{e.description}</strong>
         <small>{new Date(e.entry_date+"T12:00:00").toLocaleDateString("it-IT")}
           {" · "}{e.status==="posted"?"Contabilizzata":"Bozza da verificare"}</small></span>
       {e.status==="draft"&&canPost&&<button type="button" className="prf-outline"
         onClick={()=>void postEntry(e)} disabled={busy}><ShieldCheck size={15}/> Contabilizza</button>}
     </div>)}
     {!entries.length&&<p className="prf-muted">Nessuna scrittura: i conti base sono predisposti per questo cliente.</p>}
   </div>
   <h3 className="prf-subtitle">Saldi del piano dei conti (solo scritture contabilizzate)</h3>
   <div className="prf-table-scroll"><table className="prf-table">
     <thead><tr><th>Conto</th><th>Dare</th><th>Avere</th><th>Saldo del conto</th></tr></thead>
     <tbody>{balance.map(a=><tr key={a.account_id}><td>{a.code} · {a.name}</td>
       <td>{euro(Number(a.debit))}</td><td>{euro(Number(a.credit))}</td>
       <td>{euro(a.balance)}</td></tr>)}</tbody>
     <tfoot><tr><th>Quadratura registrazioni</th><th>{euro(debitTotal)}</th><th>{euro(creditTotal)}</th>
       <th>{Math.abs(debitTotal-creditTotal)<0.005?"Quadrata":"DA VERIFICARE"}</th></tr></tfoot>
   </table></div>
   <div className="prf-accounting-grid prf-vat-section">
     {canEdit&&<form className="prf-stack" onSubmit={e=>void addVat(e)}>
       <h3>Registro IVA provvisorio</h3>
       <label className="prf-field">Periodo
         <input type="month" required value={vat.period} onChange={e=>setVat({...vat,period:e.target.value})}/></label>
       <label className="prf-field">Tipo
         <select value={vat.direction} onChange={e=>setVat({...vat,direction:e.target.value as VatItem["direction"]})}>
           <option value="sale">Vendite</option><option value="purchase">Acquisti</option>
         </select></label>
       <label className="prf-field">Descrizione
         <input required minLength={3} maxLength={230} value={vat.description}
           onChange={e=>setVat({...vat,description:e.target.value})}/></label>
       <label className="prf-field">Imponibile EUR
         <input inputMode="decimal" required value={vat.taxable} onChange={e=>setVat({...vat,taxable:e.target.value})}/></label>
       <label className="prf-field">IVA indicata EUR
         <input inputMode="decimal" required value={vat.vat} onChange={e=>setVat({...vat,vat:e.target.value})}/></label>
       <button className="prf-outline" disabled={busy}><Plus size={16}/> Registra importi</button>
     </form>}
     <div>
       <h3>Riepilogo informativo delle voci caricate</h3>
       <p>IVA vendite: <strong>{euro(vatDebit)}</strong></p>
       <p>IVA acquisti: <strong>{euro(vatCredit)}</strong></p>
       <p>Differenza aritmetica: <strong>{euro(vatDebit-vatCredit)}</strong></p>
       <p className="prf-muted">Non è IVA da versare: mancano verifica di detraibilità,
         regimi speciali, liquidazioni, compensazioni e quadri fiscali.
         Le cifre del registro IVA non vengono sommate una seconda volta ai conti.</p>
       <div className="prf-accounting-list">
         {vatItems.slice(0,20).map(v=><div key={v.id}>
           <span><strong>{v.description}</strong><small>{v.period} · {v.direction==="sale"?"Vendita":"Acquisto"}
             {" · "}{euro(Number(v.vat))} · {v.status==="confirmed"?"Confermata":"Da verificare"}</small></span>
           {canPost&&v.status==="needs_review"&&<button className="prf-outline"
             type="button" disabled={busy} onClick={()=>void confirmVat(v)}>Conferma</button>}
         </div>)}
       </div>
     </div>
   </div>
 </section>;
}
