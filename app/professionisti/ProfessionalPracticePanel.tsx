"use client";

import { useCallback,useEffect,useRef,useState,type FormEvent } from "react";
import { CalendarClock,CheckCircle2,ClipboardList,FileText,Plus,Scale } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { requirementsFor } from "@/lib/professional-requirements";
import type { CaseType } from "@/lib/professional-workflows";

type Requirement={
 id:string;requirement_code:string;label:string;mandatory:boolean;
 status:"missing"|"provided"|"verified"|"not_applicable";document_id:string|null;
};
const statusLabels:Record<Requirement["status"],string>={
 missing:"Mancante",provided:"Da verificare",verified:"Verificato",
 not_applicable:"Non applicabile",
};
type Doc={id:string;original_name:string};
type Event={
 id:string;title:string;event_date:string;event_type:string;date_status:string;
 notes:string|null;document_id:string|null;
};
type Props={
 studioId:string;clientId:string;caseId:string;kind:CaseType;
 canEdit:boolean;canConfirm:boolean;
};
const eventTypes=[
 {value:"fatto",label:"Fatto rilevante"},
 {value:"udienza",label:"Udienza"},
 {value:"deposito",label:"Deposito"},
 {value:"notifica",label:"Notifica"},
 {value:"comunicazione",label:"Comunicazione"},
 {value:"altro",label:"Altro evento"},
];

export default function ProfessionalPracticePanel({
 studioId,clientId,caseId,kind,canEdit,canConfirm,
}:Props){
 const [reqs,setReqs]=useState<Requirement[]>([]);
 const [docs,setDocs]=useState<Doc[]>([]);
 const [events,setEvents]=useState<Event[]>([]);
 const [eventForm,setEventForm]=useState({
   title:"",event_date:"",event_type:"fatto",notes:"",
   date_status:"da_verificare",document_id:"",
 });
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const generation=useRef(0);
 const isLegal=["contratto","contenzioso","successione"].includes(kind);
 const pending=reqs.filter(r=>r.mandatory&&r.status==="missing").length;
 const confirmed=reqs.filter(r=>r.status==="verified").length;

 const reload=useCallback(async()=>{
   const sb=getSupabaseClient();if(!sb)return;
   const seq=++generation.current;
   const [r,links,ev]=await Promise.all([
     sb.from("professional_case_requirements")
       .select("id,requirement_code,label,mandatory,status,document_id")
       .eq("studio_id",studioId).eq("client_id",clientId)
       .eq("case_id",caseId).order("created_at").limit(120),
     sb.from("professional_document_case_links")
       .select("document_id").eq("studio_id",studioId).eq("client_id",clientId)
       .eq("case_id",caseId).limit(180),
     isLegal?sb.from("professional_legal_events")
       .select("id,title,event_date,event_type,date_status,notes,document_id")
       .eq("studio_id",studioId).eq("case_id",caseId)
       .order("event_date",{ascending:true}).limit(150)
       :Promise.resolve({data:[] as Event[],error:null}),
   ]);
   if(seq!==generation.current)return;
   if(r.error||links.error||ev.error){setError("Scheda pratica non disponibile.");return;}
   const ids=(links.data??[]).map(l=>l.document_id);
   let documents:Doc[]=[];
   if(ids.length){
     const {data,error:docError}=await sb.from("professional_documents")
       .select("id,original_name").eq("client_id",clientId).in("id",ids).limit(180);
     if(docError){setError("Originali della pratica non disponibili.");return;}
     documents=(data??[]) as Doc[];
   }
   if(seq!==generation.current)return;
   setReqs((r.data??[]) as Requirement[]);
   setDocs(documents);setEvents((ev.data??[]) as Event[]);
 },[studioId,clientId,caseId,isLegal]);
 useEffect(()=>{setReqs([]);setDocs([]);setEvents([]);setError("");setNotice("");
   void reload();return ()=>{generation.current+=1;};
 },[reload]);

 async function prepare(){
   if(!canEdit||busy)return;
   const sb=getSupabaseClient();if(!sb)return;
   const {data:{user}}=await sb.auth.getUser();
   if(!user){setError("Sessione scaduta.");return;}
   const templates=requirementsFor(kind);
   setBusy(true);setError("");
   const {error:issue}=await sb.from("professional_case_requirements").upsert(
     templates.map(x=>({
       studio_id:studioId,client_id:clientId,case_id:caseId,
       requirement_code:x.code,label:x.label,mandatory:x.mandatory,
     })),{onConflict:"case_id,requirement_code",ignoreDuplicates:true},
   );
   setBusy(false);
   if(issue){setError("Elenco non salvato: "+issue.message);return;}
   setNotice("Elenco documenti preparato: controlla ogni voce sul caso concreto.");
   await reload();
 }
 async function updateRequirement(req:Requirement,docId:string){
   if(!canEdit||busy)return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {error:issue}=await sb.from("professional_case_requirements")
     .update({document_id:docId||null,status:docId?"provided":"missing"})
     .eq("id",req.id).eq("case_id",caseId);
   setBusy(false);
   if(issue){setError("Documento non associato: "+issue.message);return;}
   await reload();
 }
 async function decide(req:Requirement,status:"verified"|"not_applicable"){
   if(!canConfirm||busy)return;
   if(!window.confirm("Confermi la verifica professionale del requisito sugli originali?"))return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {error:issue}=await sb.from("professional_case_requirements")
     .update({status}).eq("id",req.id).eq("case_id",caseId);
   setBusy(false);
   if(issue){setError("Conferma non riuscita: "+issue.message);return;}
   setNotice("Verifica attribuita al professionista.");
   await reload();
 }
 async function addEvent(e:FormEvent){
   e.preventDefault();if(!canEdit||busy||!isLegal)return;
   const sb=getSupabaseClient();if(!sb)return;
   const {data:{user}}=await sb.auth.getUser();
   if(!user){setError("Sessione scaduta.");return;}
   setBusy(true);setError("");
   const {error:issue}=await sb.from("professional_legal_events").insert({
     studio_id:studioId,client_id:clientId,case_id:caseId,
     created_by:user.id,title:eventForm.title.trim(),
     event_date:eventForm.event_date,event_type:eventForm.event_type,
     notes:eventForm.notes.trim().slice(0,2000)||null,
     document_id:eventForm.document_id||null,
     date_status:canConfirm?eventForm.date_status:"da_verificare",
   });
   setBusy(false);
   if(issue){setError("Evento non inserito: "+issue.message);return;}
   setNotice("Evento registrato. Le date processuali non vengono calcolate automaticamente.");
   setEventForm({title:"",event_date:"",event_type:"fatto",notes:"",
     date_status:"da_verificare",document_id:""});
   await reload();
 }
 return <section className="prf-panel">
   <div className="prf-panel-head"><h2><ClipboardList size={21}/>
     {isLegal?"Fascicolo legale e verifiche":"Documenti richiesti e controlli CAF"}</h2>
     <span>{confirmed} verificati · {pending} obbligatori mancanti</span></div>
   <p className="prf-muted">Elenco organizzativo, da adattare al caso e alle istruzioni ufficiali.
     Un requisito è verificato soltanto dopo conferma di un professionista.
     La sua completezza non equivale all'avvenuto deposito della pratica.</p>
   {error&&<div className="prf-alert" role="alert">{error}</div>}
   {notice&&<div className="prf-notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
   {reqs.length===0&&canEdit&&<button className="prf-primary" type="button" disabled={busy}
     onClick={()=>void prepare()}><Plus size={16}/> Prepara elenco documenti</button>}
   <div className="prf-requirements">
     {reqs.map(req=><article key={req.id}>
       <div className="prf-requirement-title"><FileText size={17}/><strong>{req.label}</strong>
         <small>{req.mandatory?"Richiesto da verificare":"Eventuale"} · {statusLabels[req.status]}</small></div>
       {(canEdit||req.document_id)&&<label className="prf-field">Originale collegato
         <select disabled={!canEdit||busy} value={req.document_id??""}
           onChange={e=>void updateRequirement(req,e.target.value)}>
           <option value="">Nessun documento</option>
           {docs.map(d=><option key={d.id} value={d.id}>{d.original_name}</option>)}
         </select></label>}
       {canConfirm&&req.status!=="verified"&&<>
         {req.document_id&&<button type="button" className="prf-outline"
           disabled={busy} onClick={()=>void decide(req,"verified")}>Conferma prova</button>}
         {req.status!=="not_applicable"&&<button type="button" className="prf-outline"
           disabled={busy} onClick={()=>void decide(req,"not_applicable")}>Non applicabile</button>}
       </>}
     </article>)}
     {!reqs.length&&<p className="prf-muted">Elenco non ancora preparato. Non assumere che la pratica sia completa.</p>}
   </div>
   {isLegal&&<div className="prf-legal">
     <h3><Scale size={19}/> Cronologia atti e scadenze indicate</h3>
     <p className="prf-muted">Le date sono inserite dall'operatore o riportate negli atti.
       DocuMio non calcola termini processuali né deposita atti sul PCT.</p>
     {canEdit&&<form className="prf-stack" onSubmit={e=>void addEvent(e)}>
       <div className="prf-row-form">
         <label className="prf-field">Data da controllare
           <input required type="date" value={eventForm.event_date}
             onChange={e=>setEventForm({...eventForm,event_date:e.target.value})}/></label>
         <label className="prf-field">Tipo
           <select value={eventForm.event_type}
             onChange={e=>setEventForm({...eventForm,event_type:e.target.value})}>
             {eventTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
           </select></label>
       </div>
       <label className="prf-field">Oggetto
         <input required minLength={3} maxLength={200} value={eventForm.title}
           onChange={e=>setEventForm({...eventForm,title:e.target.value})}/></label>
       <label className="prf-field">Note
         <textarea rows={2} maxLength={2000} value={eventForm.notes}
           onChange={e=>setEventForm({...eventForm,notes:e.target.value})}/></label>
       <label className="prf-field">Atto o prova (facoltativo)
         <select value={eventForm.document_id}
           onChange={e=>setEventForm({...eventForm,document_id:e.target.value})}>
           <option value="">Nessun originale</option>
           {docs.map(d=><option key={d.id} value={d.id}>{d.original_name}</option>)}
         </select></label>
       {canConfirm&&<label className="prf-field">Verifica data
         <select value={eventForm.date_status}
           onChange={e=>setEventForm({...eventForm,date_status:e.target.value})}>
           <option value="da_verificare">Da verificare</option>
           <option value="confermata_dal_professionista">Confermata dal professionista</option>
         </select></label>}
       <button className="prf-primary" type="submit" disabled={busy}>
         <CalendarClock size={16}/> Registra evento</button>
     </form>}
     <div className="prf-accounting-list">
       {events.map(event=><div key={event.id}>
         <span><strong>{event.title}</strong><small>
           {new Date(event.event_date+"T12:00:00").toLocaleDateString("it-IT")} · {event.event_type}
           {" · "}{event.date_status==="confermata_dal_professionista"
             ?"Confermata dall'operatore professionale":"Data da verificare"}
         </small></span>
       </div>)}
       {!events.length&&<p className="prf-muted">Nessun evento registrato.</p>}
     </div>
   </div>}
 </section>;
}
