"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Check, FilePlus2, FileText, Link2, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type Doc={
 id:string;original_name:string;content_type:string;file_size:number;
 uploaded_at:string;client_id:string;studio_id:string;sha256:string;
};
type Linked={document_id:string};
type Props={
 studioId:string;clientId:string;caseId:string;canEdit:boolean;
 onSelected:(ids:string[])=>void;
};
const types:Record<string,string>={
 pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",
 png:"image/png",xml:"application/xml",
};
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
const humanSize=(n:number)=>n>=1024*1024?(n/1048576).toFixed(1)+" MB":Math.ceil(n/1024)+" KB";

export default function ProfessionalDocumentsPanel({
 studioId,clientId,caseId,canEdit,onSelected,
}:Props){
 const [docs,setDocs]=useState<Doc[]>([]);
 const [links,setLinks]=useState<Linked[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const generation=useRef(0);
 const linkedIds=new Set(links.map(l=>l.document_id));

 const reload=useCallback(async()=>{
   const sb=getSupabaseClient();if(!sb)return;
   const run=++generation.current;
   const [d,l]=await Promise.all([
     sb.from("professional_documents")
       .select("id,original_name,content_type,file_size,uploaded_at,client_id,studio_id,sha256")
       .eq("studio_id",studioId).eq("client_id",clientId)
       .order("uploaded_at",{ascending:false}).limit(150),
     sb.from("professional_document_case_links")
       .select("document_id").eq("studio_id",studioId)
       .eq("client_id",clientId).eq("case_id",caseId).limit(200),
   ]);
   if(run!==generation.current)return;
   if(d.error||l.error){setError("Archivio del cliente non disponibile.");return;}
   setDocs((d.data??[]) as Doc[]);
   setLinks((l.data??[]) as Linked[]);
 },[studioId,clientId,caseId]);
 useEffect(()=>{
   setDocs([]);setLinks([]);setSelected([]);setError("");setNotice("");setFile(null);
   void reload();
   return ()=>{generation.current+=1;};
 },[reload]);

 async function accessToken(){
   const sb=getSupabaseClient();if(!sb)throw Error("Archivio non configurato.");
   const {data}=await sb.auth.getSession();
   if(!data.session?.access_token)throw Error("Devi effettuare l'accesso.");
   return data.session.access_token;
 }
 async function upload(){
   if(!file||!canEdit)return;
   const ext=file.name.split(".").pop()?.toLowerCase()??"";
   const mime=types[ext];
   if(!mime||file.size<1||file.size>20*1024*1024){
     setError("Formati: PDF, JPG, PNG o XML, fino a 20 MB.");return;
   }
   const sb=getSupabaseClient();if(!sb)return;
   const studio=studioId,customer=clientId,practice=caseId;
   setBusy(true);setError("");setNotice("");
   try{
     const digest=hex(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
     const jwt=await accessToken();
     async function call(body:Record<string,unknown>){
       const res=await fetch("/api/professionisti/documenti/upload",{
         method:"POST",cache:"no-store",
         headers:{"Content-Type":"application/json",Authorization:"Bearer "+jwt},
         body:JSON.stringify(body),
       });
       const data=await res.json();
       if(!res.ok)throw Error(data.error||"Caricamento non riuscito.");
       return data;
     }
     const signed=await call({action:"start",clientId:customer,caseId:practice,
       name:file.name,mime,size:file.size,sha256:digest});
     const {error:uploadError}=await sb.storage.from(signed.bucket)
       .uploadToSignedUrl(signed.path,signed.token,file,{contentType:mime,upsert:false});
     if(uploadError)throw Error("Invio dell'originale non riuscito: "+uploadError.message);
     const saved=await call({action:"finish",intentId:signed.intentId});
     if(studio===studioId&&customer===clientId&&practice===caseId){
       setFile(null);
       setNotice(saved.linked
         ?"Originale integro archiviato e collegato alla pratica."
         :(saved.notice??"Documento caricato; verifica il collegamento alla pratica."));
       await reload();
     }
   }catch(problem){setError(problem instanceof Error?problem.message:"Upload non completato.");}
   finally{setBusy(false);}
 }
 async function attach(doc:Doc){
   if(!canEdit)return;
   const sb=getSupabaseClient();if(!sb)return;
   setBusy(true);setError("");
   const {data:{user}}=await sb.auth.getUser();
   if(!user){setError("Sessione scaduta.");setBusy(false);return;}
   const {error:issue}=await sb.from("professional_document_case_links").insert({
     studio_id:studioId,client_id:clientId,case_id:caseId,
     document_id:doc.id,linked_by:user.id,
   });
   if(issue)setError("Documento non associato: "+issue.message);
   else{setNotice("Documento associato alla pratica.");await reload();}
   setBusy(false);
 }
 async function openDocument(doc:Doc){
   const w=window.open("","_blank");
   try{
     const jwt=await accessToken();
     const res=await fetch("/api/professionisti/documenti/open?documentId="+encodeURIComponent(doc.id),{
       headers:{Authorization:"Bearer "+jwt},cache:"no-store",
     });
     const data=await res.json();
     if(!res.ok)throw Error(data.error||"File non disponibile.");
     if(w)w.location.href=data.url;
     else window.location.href=data.url;
   }catch(problem){
     if(w)w.close();
     setError(problem instanceof Error?problem.message:"Impossibile aprire il documento.");
   }
 }
 function toggle(id:string){
   const next=selected.includes(id)?selected.filter(v=>v!==id):
     selected.length<2?[...selected,id]:selected;
   setSelected(next);onSelected(next);
 }
 return <section className="prf-panel">
   <div className="prf-panel-head"><h2><LockKeyhole size={21}/> Archivio privato del cliente</h2>
     <span>{docs.length} documenti</span></div>
   <p className="prf-muted">Originali privati per cliente. Un file può essere collegato
     a più pratiche dello stesso cliente; le autorizzazioni si controllano per ogni accesso.</p>
   {error&&<div className="prf-alert" role="alert">{error}</div>}
   {notice&&<div className="prf-notice" role="status"><Check size={16}/>{notice}</div>}
   {canEdit&&<div className="prf-document-upload">
     <label className="prf-field">Carica un originale (PDF, JPG, PNG o fattura XML)
       <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xml"
         disabled={busy} onChange={(event:ChangeEvent<HTMLInputElement>)=>{
           setFile(event.currentTarget.files?.[0]??null);setError("");
         }}/>
     </label>
     <button type="button" className="prf-primary" disabled={!file||busy}
       onClick={()=>void upload()}><FilePlus2 size={17}/>{busy?"Operazione in corso…":"Salva e collega"}</button>
   </div>}
   <div className="prf-document-list">
     {docs.map(doc=><article key={doc.id}>
       <FileText size={20}/>
       <div className="prf-document-desc">
         <strong>{doc.original_name}</strong>
         <small>{humanSize(doc.file_size)} · {new Date(doc.uploaded_at).toLocaleDateString("it-IT")}
           {" · "}{linkedIds.has(doc.id)?"Associato alla pratica":"Nell'archivio del cliente"}</small>
       </div>
       <div className="prf-document-actions">
         {linkedIds.has(doc.id)&&<label title="Includi questo originale nella prossima analisi AI">
           <input type="checkbox" checked={selected.includes(doc.id)}
             onChange={()=>toggle(doc.id)}/> AI
         </label>}
         {!linkedIds.has(doc.id)&&canEdit&&<button type="button" className="prf-outline"
           disabled={busy} onClick={()=>void attach(doc)}><Link2 size={15}/> Associa</button>}
         <button type="button" className="prf-outline"
           onClick={()=>void openDocument(doc)}><Search size={15}/> Apri</button>
       </div>
     </article>)}
     {!docs.length&&<p className="prf-muted"><ShieldCheck size={16}/> Nessun documento:
       puoi caricare gli originali direttamente nel fascicolo selezionato.</p>}
   </div>
   <p className="prf-muted">Per l'AI puoi selezionare al massimo due originali già collegati.
      Verranno inviati al fornitore AI soltanto dopo una conferma esplicita.</p>
 </section>;
}
