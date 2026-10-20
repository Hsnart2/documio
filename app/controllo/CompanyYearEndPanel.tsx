"use client";

import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {Download,Landmark,ShieldCheck,FileText,AlertTriangle} from "lucide-react";
import {getSupabaseClient} from "@/lib/supabase";
import "./yearend.css";

type YearEndBank={
 label:string;transactions:number;importedCents:number;openingCents:number|null;
 closingCents:number|null;differenceCents:number|null;documented:boolean;
 status:string;source:string|null;
};
type Statement={
 id:string;account_label:string;fiscal_year:number;opening_balance:number|null;
 closing_balance:number;statement_document_id:string|null;
};
type Doc={id:string;title:string};
type Summary={
 year:number;companyName:string;invoiceYearCount:number;openInvoiceCount:number;
 movementYearCount:number;unallocatedMovements?:number;advancesToVerify?:number;banks:YearEndBank[];
 totals:{invoicedIncome:number;invoicedCosts:number;pendingReceivables:number;
   pendingPayables:number;bankClosingCents:number|null;bankStatements:number};
 warnings:string[];
};
type Props={
 userId:string;companyId:string;
 movementLabels:string[];bankLabels:string[];
};
const euro=(cents:number)=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(cents/100);
const number=(s:string):number|null=>{
 const str=s.trim().replace(/\s/g,"");
 if(!/^-?\d+(?:[.,]\d{1,2})?$/.test(str))return null;
 const n=Number(str.replace(",","."));
 return Number.isFinite(n)&&Math.abs(n)<1e12?Math.round(n*100)/100:null;
};
const currentYear=new Date().getFullYear();
export default function CompanyYearEndPanel({userId,companyId,movementLabels,bankLabels}:Props){
 const [year,setYear]=useState(currentYear-1);
 const [statements,setStatements]=useState<Statement[]>([]);
 const [docs,setDocs]=useState<Doc[]>([]);
 const [report,setReport]=useState<Summary|null>(null);
 const [entry,setEntry]=useState({account_label:"Conto principale",opening_balance:"",
   closing_balance:"",statement_document_id:""});
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const allLabels=useMemo(()=>[...new Set([...movementLabels,...bankLabels,
   ...statements.map(s=>s.account_label)].map(x=>x.trim()).filter(Boolean))].sort(),[
     movementLabels,bankLabels,statements,
   ]);
 const auth=useCallback(async()=>{
   const sb=getSupabaseClient();if(!sb)throw Error("Archivio non disponibile.");
   const {data}=await sb.auth.getSession();
   if(!data.session?.access_token)throw Error("Sessione scaduta.");
   return data.session.access_token;
 },[]);
 const refresh=useCallback(async()=>{
   const sb=getSupabaseClient();if(!sb)return;
   const [s,d]=await Promise.all([
    sb.from("financial_bank_yearend_balances")
     .select("id,account_label,fiscal_year,opening_balance,closing_balance,statement_document_id")
     .eq("user_id",userId).eq("company_id",companyId).eq("fiscal_year",year)
     .order("account_label").limit(200),
    sb.from("documents").select("id,title")
     .eq("user_id",userId).eq("company_id",companyId)
     .order("uploaded_at",{ascending:false}).limit(300),
   ]);
   if(s.error||d.error){setError("Dati di chiusura o archivio estratti non disponibili.");return;}
   setStatements((s.data??[]) as Statement[]);
   setDocs((d.data??[]) as Doc[]);
   try{
     const jwt=await auth();
     const response=await fetch("/api/finance/chiusura?companyId="+encodeURIComponent(companyId)
       +"&year="+year,{headers:{Authorization:"Bearer "+jwt},cache:"no-store"});
     const payload=await response.json();
     if(!response.ok)throw Error(payload.error||"Riepilogo non disponibile.");
     setReport(payload as Summary);
   }catch(e){setReport(null);setError(e instanceof Error?e.message:"Riepilogo non disponibile.");}
 },[userId,companyId,year,auth]);
 useEffect(()=>{setReport(null);setStatements([]);setDocs([]);
   setError("");setNotice("");void refresh();
 },[refresh]);

 async function save(e:FormEvent){
   e.preventDefault();if(busy)return;
   if(year>=currentYear){setError("Il saldo del 31 dicembre si può inserire soltanto per esercizi conclusi.");return;}
   const closing=number(entry.closing_balance);
   const opening=entry.opening_balance.trim()===""?null:number(entry.opening_balance);
   const label=entry.account_label.trim();
   if(label.length<2||label.length>80||closing===null||
     (entry.opening_balance.trim()!==""&&opening===null)){
     setError("Indica conto e saldo reale dal documento bancario; apertura facoltativa.");return;
   }
   if(!window.confirm("Confermi di aver riportato gli importi dall'estratto conto bancario? DocuMio non li certifica."))return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");setNotice("");
   const {error:issue}=await sb.from("financial_bank_yearend_balances").upsert({
     user_id:userId,company_id:companyId,fiscal_year:year,account_label:label,
     opening_balance:opening,closing_balance:closing,currency:"EUR",
     statement_document_id:entry.statement_document_id||null,
     provenance:"manual_from_statement",
   },{onConflict:"user_id,company_id,fiscal_year,account_label"});
   setBusy(false);
   if(issue){setError("Saldo non salvato: "+issue.message);return;}
   setNotice("Saldo da estratto conto registrato come dichiarazione dell'utente.");
   setEntry({...entry,opening_balance:"",closing_balance:"",statement_document_id:""});
   await refresh();
 }
 async function exportZip(){
   setBusy(true);setError("");
   try{
     const jwt=await auth();
     const res=await fetch("/api/finance/chiusura?companyId="+encodeURIComponent(companyId)
       +"&year="+year+"&format=zip",{
         headers:{Authorization:"Bearer "+jwt},cache:"no-store",
       });
     if(!res.ok){const error=await res.json().catch(()=>null);throw Error(error?.error??"Export non disponibile.");}
     const blob=await res.blob();
     const url=URL.createObjectURL(blob);
     const link=document.createElement("a");link.href=url;link.download="documio-commercialista-"+year+".zip";
     document.body.appendChild(link);link.click();link.remove();
     setTimeout(()=>URL.revokeObjectURL(url),1500);
   }catch(e){setError(e instanceof Error?e.message:"Errore nell'esportazione.");}
   finally{setBusy(false);}
 }
 function editStatement(row:Statement){
   setEntry({account_label:row.account_label,
     opening_balance:row.opening_balance===null?"":String(row.opening_balance),
     closing_balance:String(row.closing_balance),
     statement_document_id:row.statement_document_id??""});
 }
 return <section className="fc-panel fc-yearend" aria-label="Chiusura esercizio e saldi bancari">
   <h2><Landmark size={21}/> Dossier di fine anno per il commercialista</h2>
   <p className="fc-muted">Esporta fatture, scadenzario, movimenti e saldi bancari del
     31 dicembre in un unico ZIP. I saldi vanno riportati dall'estratto conto:
     quelli PSD2 attuali non sono automaticamente saldi storici.</p>
   {error&&<div className="fc-yearend-alert" role="alert"><AlertTriangle size={17}/>{error}</div>}
   {notice&&<p className="fc-yearend-notice" role="status">{notice}</p>}
   <div className="fc-yearend-toolbar">
     <label>Anno d'esercizio
       <input type="number" min={2000} max={currentYear} value={year}
         onChange={e=>setYear(Math.min(currentYear,Math.max(2000,Number(e.target.value)||currentYear)))}/>
     </label>
     <button type="button" className="fc-button" disabled={busy||!report}
       onClick={()=>void exportZip()}><Download size={16}/> Scarica pacchetto ZIP</button>
   </div>
   {report&&<div className="fc-yearend-metrics">
     <div><strong>{report.invoiceYearCount}</strong><small>Fatture anno</small></div>
     <div><strong>{report.openInvoiceCount}</strong><small>Fatture da riconciliare (fino al 31/12)</small></div>
     <div><strong>{report.movementYearCount}</strong><small>Movimenti importati</small></div>
     <div><strong>{report.unallocatedMovements??0}</strong><small>Bonifici con importi non attribuiti</small></div>
     <div><strong>{report.advancesToVerify??0}</strong><small>Acconti da verificare</small></div>
     <div><strong>{report.totals.bankClosingCents===null?"Non verificabile":euro(report.totals.bankClosingCents)}</strong>
       <small>Somma dei soli saldi bancari dichiarati (non certificati)</small></div>
   </div>}
   <h3>Saldi al 31/12/{year}: un conto alla volta</h3>
   <p className="fc-muted">Inserisci il <strong>saldo contabile</strong> riportato dalla banca,
     non il saldo disponibile. Se possibile, collega il PDF dell'estratto conto
     già caricato nell'archivio aziendale.</p>
   {year<currentYear?<form className="fc-yearend-form" onSubmit={e=>void save(e)}>
     <label>Identifica la banca/conto
       <input required minLength={2} maxLength={80} list="fc-yearend-account-options"
         value={entry.account_label}
         onChange={e=>setEntry({...entry,account_label:e.target.value})}/>
       <datalist id="fc-yearend-account-options">{allLabels.map(x=><option key={x} value={x}/>)}</datalist>
     </label>
     <label>Saldo contabile al 1° gennaio (facoltativo)
       <input inputMode="decimal" placeholder="Es. 10000,00"
         value={entry.opening_balance}
         onChange={e=>setEntry({...entry,opening_balance:e.target.value})}/>
     </label>
     <label>Saldo contabile al 31 dicembre (obbligatorio)
       <input required inputMode="decimal" placeholder="Es. 25000,00"
         value={entry.closing_balance}
         onChange={e=>setEntry({...entry,closing_balance:e.target.value})}/>
     </label>
     <label>Estratto conto nell'archivio (facoltativo)
       <select value={entry.statement_document_id}
         onChange={e=>setEntry({...entry,statement_document_id:e.target.value})}>
         <option value="">Nessun originale collegato</option>
         {docs.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}
       </select>
     </label>
     <button type="submit" disabled={busy} className="fc-button">
       <ShieldCheck size={16}/> Salva saldo dichiarato</button>
   </form>:<p className="fc-disclaimer">L'esercizio {year} non è terminato: è possibile
     esportare i dati provvisori, non inserire il saldo di chiusura al 31 dicembre.</p>}
   {!!statements.length&&<div className="fc-yearend-saved">
     {statements.map(s=><div key={s.id}><strong>{s.account_label}</strong>
       <span>{euro(Math.round(Number(s.closing_balance)*100))} ·
         {s.statement_document_id?" originale collegato":" originale non allegato"}</span>
       <button type="button" onClick={()=>editStatement(s)} disabled={busy}>Modifica</button>
     </div>)}
   </div>}
   {report&&<div className="fc-yearend-banks">
     <h3>Confronto con movimenti bancari importati</h3>
     {!report.banks.length?<p className="fc-muted">Nessun movimento o saldo dell'anno disponibile.</p>:
       report.banks.map(b=><div key={b.label}>
         <strong>{b.label}</strong><small>{b.transactions} movimenti ·
           somma movimenti {euro(b.importedCents)}</small>
         <small>Saldo 31/12: {b.closingCents===null?"Manca estratto conto":euro(b.closingCents)}</small>
         <small>Differenza teorica:
           {b.differenceCents===null?"non calcolabile senza entrambi i saldi di apertura e chiusura":
             euro(b.differenceCents)}
         </small>
       </div>)}
   </div>}
   <p className="fc-disclaimer"><FileText size={15}/> Un saldo dichiarato non diventa un
     saldo verificato automaticamente. Importazioni bancarie incomplete, pagamenti
     non riconciliati e saldi iniziali assenti impediscono di produrre un bilancio affidabile.</p>
 </section>;
}
