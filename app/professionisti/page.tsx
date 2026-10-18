"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle, ArrowRight, BookOpenCheck, BriefcaseBusiness, Check,
  ClipboardCheck, Copy, FileCheck2, FolderKanban, Plus, ShieldCheck,
  Sparkles, UserRound, Users, X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  CASE_TYPES, STUDIO_TYPES, caseTypesFor, checklistFor,
  type CaseType, type StudioType,
} from "@/lib/professional-workflows";
import "./professionisti.css";

type Studio = {
  id:string;owner_user_id:string;name:string;studio_type:StudioType;created_at:string;
};
type Member = {user_id:string;member_email:string;role:"professional"|"collaborator"|"viewer"};
type Client = {
  id:string;studio_id:string;client_type:"persona"|"azienda";
  display_name:string;email:string|null;vat_number:string|null;status:string;
};
type CaseRow = {
  id:string;studio_id:string;client_id:string;case_type:CaseType;title:string;
  description:string;status:string;due_date:string|null;created_at:string;
};
type Task = {id:string;title:string;is_done:boolean;sort_order:number};
type Invite = {id:string;email:string;role:string;expires_at:string;accepted_at:string|null;revoked_at:string|null};
type Guidance = {
  summary:string;actions?:Array<{step:string;why:string;verify:string}>;
  limitations:string;aiUsed:boolean;notice?:string;
};
type Role = "owner"|"professional"|"collaborator"|"viewer";
const roleLabel:Record<Role,string> = {
  owner:"Titolare",professional:"Professionista",collaborator:"Collaboratore",viewer:"Sola lettura",
};
const statuses = [
  {value:"aperta",label:"Aperta"},
  {value:"in_lavorazione",label:"In lavorazione"},
  {value:"da_verificare",label:"Da verificare"},
  {value:"completata",label:"Completata dopo revisione"},
  {value:"archiviata",label:"Archiviata"},
] as const;
const safeDate=(value:string|null)=>value?new Date(value+"T12:00:00").toLocaleDateString("it-IT"):"Non indicata";
const bytesHex=(bytes:Uint8Array)=>Array.from(bytes).map((b)=>b.toString(16).padStart(2,"0")).join("");

export default function ProfessionalStudiosPage() {
  const [userId,setUserId]=useState<string|null>(null);
  const [ready,setReady]=useState(false);
  const [studios,setStudios]=useState<Studio[]>([]);
  const [studioId,setStudioId]=useState("");
  const [members,setMembers]=useState<Member[]>([]);
  const [clients,setClients]=useState<Client[]>([]);
  const [cases,setCases]=useState<CaseRow[]>([]);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [caseId,setCaseId]=useState("");
  const [tasks,setTasks]=useState<Task[]>([]);
  const [studioForm,setStudioForm]=useState({name:"",studio_type:"commercialista" as StudioType});
  const [clientForm,setClientForm]=useState({client_type:"azienda" as Client["client_type"],display_name:"",email:"",vat_number:""});
  const [caseForm,setCaseForm]=useState({client_id:"",case_type:"contabilita" as CaseType,title:"",description:"",due_date:""});
  const [inviteForm,setInviteForm]=useState({email:"",role:"collaborator" as Member["role"]});
  const [inviteLink,setInviteLink]=useState("");
  const [newTask,setNewTask]=useState("");
  const [question,setQuestion]=useState("");
  const [guidance,setGuidance]=useState<Guidance|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(false);
  const [moduleUnavailable,setModuleUnavailable]=useState(false);
  const scopeRun=useRef(0);
  const caseRun=useRef(0);

  const selectedStudio=studios.find((s)=>s.id===studioId)??null;
  const selectedCase=cases.find((c)=>c.id===caseId)??null;
  const role:Role=selectedStudio?.owner_user_id===userId?"owner"
    : members.find((m)=>m.user_id===userId)?.role??"viewer";
  const canEdit=role!=="viewer";
  const possibleTypes=caseTypesFor(selectedStudio?.studio_type??"multiservizi");
  const casesByClient=useMemo(()=>cases.filter((c)=>c.client_id===caseForm.client_id),[cases,caseForm.client_id]);
  const openTasks=tasks.filter((t)=>!t.is_done).length;

  const refreshStudios=useCallback(async (id:string,preferred?:string)=>{
    const supabase=getSupabaseClient();
    if(!supabase)return;
    const {data,error:issue}=await supabase.from("professional_studios")
      .select("id,owner_user_id,name,studio_type,created_at")
      .order("created_at",{ascending:true}).limit(50);
    if(issue){
      setModuleUnavailable(true);
      setError("La sezione Studi professionali non è ancora stata attivata sul database.");
      return;
    }
    const list=(data??[]) as Studio[];
    setStudios(list);setModuleUnavailable(false);
    setStudioId((prev)=>preferred&&list.some((s)=>s.id===preferred)?preferred:
      list.some((s)=>s.id===prev)?prev:list[0]?.id??"");
    if(!list.length)setCaseId("");
    void id;
  },[]);

  useEffect(()=>{
    const supabase=getSupabaseClient();
    if(!supabase){setReady(true);setError("Configurazione archivio assente.");return;}
    let alive=true;
    void supabase.auth.getUser().then(({data})=>{
      if(!alive)return;
      setUserId(data.user?.id??null);setReady(true);
      if(data.user?.id)void refreshStudios(data.user.id);
    });
    const {data:sub}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(!alive)return;
      setUserId(session?.user?.id??null);
      if(session?.user?.id)void refreshStudios(session.user.id);
      else {
        setStudios([]);setStudioId("");setClients([]);setCases([]);
        setMembers([]);setTasks([]);setGuidance(null);
      }
    });
    return ()=>{alive=false;sub.subscription.unsubscribe();};
  },[refreshStudios]);

  const refreshArea=useCallback(async (sid:string)=>{
    const client=getSupabaseClient();
    if(!client)return;
    const run=++scopeRun.current;
    const [clientResult,caseResult,memberResult,inviteResult]=await Promise.all([
      client.from("professional_clients")
        .select("id,studio_id,client_type,display_name,email,vat_number,status")
        .eq("studio_id",sid).order("display_name").limit(500),
      client.from("professional_cases")
        .select("id,studio_id,client_id,case_type,title,description,status,due_date,created_at")
        .eq("studio_id",sid).order("created_at",{ascending:false}).limit(300),
      client.from("professional_studio_members")
        .select("user_id,member_email,role").eq("studio_id",sid).limit(100),
      client.from("professional_studio_invites")
        .select("id,email,role,expires_at,accepted_at,revoked_at").eq("studio_id",sid)
        .order("created_at",{ascending:false}).limit(40),
    ]);
    if(run!==scopeRun.current)return;
    if(clientResult.error||caseResult.error||memberResult.error){
      setError("Impossibile caricare clienti e fascicoli per questo studio.");
      return;
    }
    const myClients=(clientResult.data??[]) as Client[];
    const myCases=(caseResult.data??[]) as CaseRow[];
    setClients(myClients);setCases(myCases);
    setMembers((memberResult.data??[]) as Member[]);
    setInvites((inviteResult.data??[]) as Invite[]);
    setCaseId((prev)=>myCases.some((c)=>c.id===prev)?prev:myCases[0]?.id??"");
    setCaseForm((prev)=>({
      ...prev,
      client_id:myClients.some((c)=>c.id===prev.client_id)?prev.client_id:myClients[0]?.id??"",
    }));
  },[]);

  useEffect(()=>{
    scopeRun.current+=1;
    setClients([]);setCases([]);setMembers([]);setInvites([]);
    setCaseId("");setGuidance(null);setInviteLink("");
    if(studioId)void refreshArea(studioId);
  },[studioId,refreshArea]);

  const refreshTasks=useCallback(async (sid:string,cid:string)=>{
    const supabase=getSupabaseClient();if(!supabase)return;
    const run=++caseRun.current;
    const {data,error:issue}=await supabase.from("professional_case_tasks")
      .select("id,title,is_done,sort_order").eq("studio_id",sid).eq("case_id",cid)
      .order("sort_order").order("created_at").limit(150);
    if(run!==caseRun.current)return;
    if(issue){setError("Checklist non disponibile.");return;}
    setTasks((data??[]) as Task[]);
  },[]);
  useEffect(()=>{
    caseRun.current+=1;setTasks([]);setGuidance(null);
    if(studioId&&caseId)void refreshTasks(studioId,caseId);
  },[studioId,caseId,refreshTasks]);

  async function createStudio(e:FormEvent) {
    e.preventDefault();
    const name=studioForm.name.trim();
    if(!userId||name.length<2)return;
    const supabase=getSupabaseClient();if(!supabase)return;
    setLoading(true);setError("");
    const {data,error:issue}=await supabase.from("professional_studios")
      .insert({owner_user_id:userId,name,studio_type:studioForm.studio_type})
      .select("id").single();
    setLoading(false);
    if(issue||!data){setError("Impossibile creare lo studio: "+(issue?.message??"riprova"));return;}
    setStudioForm({...studioForm,name:""});
    setNotice("Studio creato. I documenti personali e aziendali preesistenti non vengono condivisi automaticamente.");
    await refreshStudios(userId,data.id);
  }
  async function createClient(e:FormEvent) {
    e.preventDefault();
    if(!userId||!studioId||!canEdit)return;
    const name=clientForm.display_name.trim();
    if(name.length<2)return;
    const supabase=getSupabaseClient();if(!supabase)return;
    setLoading(true);setError("");
    const {error:issue}=await supabase.from("professional_clients").insert({
      studio_id:studioId,created_by:userId,client_type:clientForm.client_type,
      display_name:name,email:clientForm.email.trim()||null,
      vat_number:clientForm.client_type==="azienda"?clientForm.vat_number.trim()||null:null,
    });
    setLoading(false);
    if(issue){setError("Cliente non salvato: "+issue.message);return;}
    setNotice("Anagrafica cliente salvata nello studio selezionato.");
    setClientForm({client_type:"azienda",display_name:"",email:"",vat_number:""});
    await refreshArea(studioId);
  }
  async function createCase(e:FormEvent) {
    e.preventDefault();
    if(!userId||!studioId||!canEdit||!caseForm.client_id)return;
    const title=caseForm.title.trim();
    if(title.length<3)return;
    const caseType=possibleTypes.some((type)=>type.value===caseForm.case_type)
      ? caseForm.case_type : possibleTypes[0]?.value;
    if(!caseType){setError("Tipo pratica non disponibile.");return;}
    const supabase=getSupabaseClient();if(!supabase)return;
    setLoading(true);setError("");
    const {data,error:issue}=await supabase.from("professional_cases").insert({
      studio_id:studioId,client_id:caseForm.client_id,case_type:caseType,
      title,description:caseForm.description.trim().slice(0,5000),
      due_date:caseForm.due_date||null,created_by:userId,
    }).select("id").single();
    if(issue||!data){setLoading(false);setError("Pratica non creata: "+(issue?.message??"riprova"));return;}
    const checklist=checklistFor(caseType);
    const {error:taskError}=await supabase.from("professional_case_tasks").insert(
      checklist.map((label,index)=>({
        studio_id:studioId,case_id:data.id,title:label,sort_order:index,created_by:userId,
      })),
    );
    setLoading(false);
    setNotice(taskError
      ? "Fascicolo creato, ma la checklist non è stata salvata. Puoi aggiungere le verifiche manualmente."
      : "Fascicolo creato con checklist organizzativa da verificare.");
    setCaseForm({...caseForm,title:"",description:"",due_date:""});
    await refreshArea(studioId);setCaseId(data.id);
  }
  async function updateStatus(status:string) {
    if(!selectedCase||!canEdit)return;
    if(status==="completata"&&!window.confirm("Confermi la revisione umana degli originali? La checklist non certifica l'adempimento."))return;
    const supabase=getSupabaseClient();if(!supabase)return;
    const {error:issue}=await supabase.from("professional_cases")
      .update({status}).eq("studio_id",studioId).eq("id",selectedCase.id);
    if(issue){setError("Stato non aggiornato: "+issue.message);return;}
    setCases((prev)=>prev.map((c)=>c.id===selectedCase.id?{...c,status}:c));
  }
  async function toggleTask(task:Task) {
    if(!selectedCase||!canEdit)return;
    const supabase=getSupabaseClient();if(!supabase)return;
    const {error:issue}=await supabase.from("professional_case_tasks")
      .update({is_done:!task.is_done})
      .eq("studio_id",studioId).eq("case_id",selectedCase.id).eq("id",task.id);
    if(issue){setError("Verifica non aggiornata: "+issue.message);return;}
    setTasks((prev)=>prev.map((t)=>t.id===task.id?{...t,is_done:!task.is_done}:t));
    setGuidance(null);
  }
  async function addTask(e:FormEvent) {
    e.preventDefault();if(!selectedCase||!userId||!canEdit)return;
    const name=newTask.trim();if(name.length<3)return;
    const supabase=getSupabaseClient();if(!supabase)return;
    const {error:issue}=await supabase.from("professional_case_tasks").insert({
      studio_id:studioId,case_id:selectedCase.id,title:name,created_by:userId,
      sort_order:tasks.length+1,
    });
    if(issue){setError("Verifica non salvata: "+issue.message);return;}
    setNewTask("");await refreshTasks(studioId,selectedCase.id);
  }
  async function inviteMember(e:FormEvent) {
    e.preventDefault();
    if(!userId||role!=="owner"||!studioId)return;
    const email=inviteForm.email.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setError("Indirizzo email non valido.");return;}
    const supabase=getSupabaseClient();if(!supabase)return;
    const secret=bytesHex(crypto.getRandomValues(new Uint8Array(32)));
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
    setLoading(true);setError("");
    const {error:issue}=await supabase.from("professional_studio_invites").insert({
      studio_id:studioId,created_by:userId,email,role:inviteForm.role,
      token_hash:bytesHex(new Uint8Array(digest)),
      expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString(),
    });
    setLoading(false);
    if(issue){setError("Invito non creato: "+issue.message);return;}
    setInviteLink(window.location.origin+"/professionisti/invito#token="+secret);
    setInviteForm({...inviteForm,email:""});
    setNotice("Invito valido per 7 giorni: può accettarlo solo un account con quell'email verificata.");
    await refreshArea(studioId);
  }
  async function removeMember(member:Member) {
    if(role!=="owner"||!studioId||
      !window.confirm("Revocare subito l'accesso di "+member.member_email+" a questo studio?"))return;
    const supabase=getSupabaseClient();if(!supabase)return;
    const {data,error:issue}=await supabase.rpc("documio_remove_professional_member",{
      p_studio_id:studioId,p_user_id:member.user_id,
    });
    if(issue||!data){setError("Collaboratore non rimosso. Riprova.");return;}
    setNotice("Accesso allo studio revocato.");await refreshArea(studioId);
  }
  async function revokeInvite(invite:Invite) {
    if(role!=="owner"||!window.confirm("Revocare l'invito per "+invite.email+"?"))return;
    const supabase=getSupabaseClient();if(!supabase)return;
    const {data,error:issue}=await supabase.rpc("documio_revoke_professional_invite",{
      p_invite_id:invite.id,
    });
    if(issue||!data){setError("Invito non revocato.");return;}
    setNotice("Invito revocato.");await refreshArea(studioId);
  }
  async function copyInvitation() {
    try{await navigator.clipboard.writeText(inviteLink);setNotice("Link d'invito copiato.");}
    catch{setError("Seleziona e copia manualmente il link.");}
  }
  async function requestGuidance() {
    if(!selectedCase||!question.trim()||!userId)return;
    if(!window.confirm(
      "Inviare all'AI titolo, descrizione e checklist di questa pratica? Non saranno inviati nominativo, codice fiscale o email della scheda cliente. Controlla prima che i testi liberi non contengano dati non necessari."
    ))return;
    const supabase=getSupabaseClient();if(!supabase)return;
    const {data}=await supabase.auth.getSession();
    if(!data.session?.access_token){setError("Sessione scaduta.");return;}
    setLoading(true);setGuidance(null);setError("");
    try{
      const res=await fetch("/api/professionisti/assistente",{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
        body:JSON.stringify({caseId:selectedCase.id,question:question.trim(),consentToAi:true}),
      });
      const payload=await res.json();
      if(!res.ok)throw new Error(payload.error||"Analisi non disponibile.");
      setGuidance(payload as Guidance);
    }catch(err){setError(err instanceof Error?err.message:"Analisi non riuscita.");}
    finally{setLoading(false);}
  }

  return (
    <main id="dm-main-content" className="prf-page">
      <header className="prf-header">
        <div className="prf-eyebrow"><ShieldCheck size={15}/> DOCUMIO PROFESSIONAL</div>
        <h1>La scrivania del tuo studio</h1>
        <p>Un unico spazio per clienti, fascicoli, checklist e supporto AI.
          Nessun invio a enti e nessuna consulenza automaticamente certificata.</p>
      </header>
      {!ready ? <p>Verifica sessione…</p> : !userId ?
        <section className="prf-panel">
          <h2>Accesso richiesto</h2><p>Accedi a DocuMio per utilizzare lo spazio professionale.</p>
          <a className="prf-primary" href="/">Vai all'accesso <ArrowRight size={17}/></a>
        </section> :
      <>
        {error&&<div className="prf-alert" role="alert"><AlertTriangle size={17}/><span>{error}</span><button type="button" onClick={()=>setError("")} aria-label="Chiudi errore"><X size={16}/></button></div>}
        {notice&&<div className="prf-notice" role="status"><Check size={17}/>{notice}<button type="button" onClick={()=>setNotice("")} aria-label="Chiudi avviso"><X size={16}/></button></div>}
        {!moduleUnavailable&&<>
          <section className="prf-panel">
            <div className="prf-panel-head"><h2><BriefcaseBusiness size={21}/> Studi professionali</h2><span>{studios.length} studi</span></div>
            {studios.length>0&&<label className="prf-field">Studio attivo
              <select value={studioId} onChange={(e)=>setStudioId(e.target.value)}>
                {studios.map((studio)=><option value={studio.id} key={studio.id}>{studio.name} · {STUDIO_TYPES.find((s)=>s.value===studio.studio_type)?.label}</option>)}
              </select>
            </label>}
            <form className="prf-row-form" onSubmit={(e)=>void createStudio(e)}>
              <label className="prf-field">Nuovo studio
                <input required minLength={2} maxLength={160} placeholder="Nome dello studio"
                  value={studioForm.name} onChange={(e)=>setStudioForm({...studioForm,name:e.target.value})}/>
              </label>
              <label className="prf-field">Attività
                <select value={studioForm.studio_type}
                  onChange={(e)=>setStudioForm({...studioForm,studio_type:e.target.value as StudioType})}>
                  {STUDIO_TYPES.map((type)=><option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <button className="prf-primary" type="submit" disabled={loading}><Plus size={17}/> Crea studio</button>
            </form>
          </section>
          {selectedStudio&&<>
            <div className="prf-summary" aria-label="Riepilogo">
              <div><Users size={22}/><strong>{clients.length}</strong><small>Clienti</small></div>
              <div><FolderKanban size={22}/><strong>{cases.length}</strong><small>Fascicoli</small></div>
              <div><ShieldCheck size={22}/><strong>{roleLabel[role]}</strong><small>Il tuo ruolo</small></div>
            </div>
            <section className="prf-grid">
              <div className="prf-panel">
                <div className="prf-panel-head"><h2><UserRound size={21}/> Anagrafiche clienti</h2></div>
                {canEdit&&<form className="prf-stack" onSubmit={(e)=>void createClient(e)}>
                  <label className="prf-field">Tipo
                    <select value={clientForm.client_type} onChange={(e)=>setClientForm({...clientForm,client_type:e.target.value as Client["client_type"]})}>
                      <option value="azienda">Azienda</option><option value="persona">Persona</option>
                    </select>
                  </label>
                  <label className="prf-field">Nominativo / ragione sociale
                    <input required minLength={2} maxLength={180} placeholder="Cliente"
                      value={clientForm.display_name} onChange={(e)=>setClientForm({...clientForm,display_name:e.target.value})}/>
                  </label>
                  <label className="prf-field">Email (facoltativa)
                    <input type="email" maxLength={254} value={clientForm.email}
                      onChange={(e)=>setClientForm({...clientForm,email:e.target.value})}/>
                  </label>
                  {clientForm.client_type==="azienda"&&<label className="prf-field">Partita IVA (facoltativa)
                    <input maxLength={20} value={clientForm.vat_number}
                      onChange={(e)=>setClientForm({...clientForm,vat_number:e.target.value})}/>
                  </label>}
                  <button className="prf-primary" disabled={loading}><Plus size={17}/> Aggiungi cliente</button>
                </form>}
                <div className="prf-client-list">
                  {clients.map((c)=><button type="button" className={c.id===caseForm.client_id?"is-selected":""}
                    key={c.id} onClick={()=>setCaseForm((prev)=>({...prev,client_id:c.id}))}>
                    <span><strong>{c.display_name}</strong><small>{c.client_type==="azienda"?"Azienda":"Privato"} · {cases.filter((f)=>f.client_id===c.id).length} pratiche</small></span>
                    <ArrowRight size={16}/>
                  </button>)}
                  {!clients.length&&<p className="prf-muted">Non ci sono clienti in questo studio.</p>}
                </div>
              </div>
              <div className="prf-panel">
                <div className="prf-panel-head"><h2><ClipboardCheck size={21}/> Nuovo fascicolo</h2></div>
                {canEdit&&clients.length>0?<form className="prf-stack" onSubmit={(e)=>void createCase(e)}>
                  <label className="prf-field">Cliente
                    <select required value={caseForm.client_id} onChange={(e)=>setCaseForm({...caseForm,client_id:e.target.value})}>
                      <option value="">Seleziona un cliente</option>
                      {clients.map((c)=><option key={c.id} value={c.id}>{c.display_name}</option>)}
                    </select>
                  </label>
                  <label className="prf-field">Tipo di pratica
                    <select value={possibleTypes.some((t)=>t.value===caseForm.case_type)?caseForm.case_type:possibleTypes[0]?.value??"altro"}
                      onChange={(e)=>setCaseForm({...caseForm,case_type:e.target.value as CaseType})}>
                      {possibleTypes.map((type)=><option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </label>
                  <label className="prf-field">Titolo
                    <input required minLength={3} maxLength={200} placeholder="Es. Contabilità anno corrente"
                      value={caseForm.title} onChange={(e)=>setCaseForm({...caseForm,title:e.target.value})}/>
                  </label>
                  <label className="prf-field">Note della pratica
                    <textarea maxLength={5000} rows={3} value={caseForm.description}
                      placeholder="Fatti e dati già verificati, senza informazioni superflue"
                      onChange={(e)=>setCaseForm({...caseForm,description:e.target.value})}/>
                  </label>
                  <label className="prf-field">Data da controllare (inserita dall'utente)
                    <input type="date" value={caseForm.due_date}
                      onChange={(e)=>setCaseForm({...caseForm,due_date:e.target.value})}/>
                  </label>
                  <button className="prf-primary" disabled={loading}><Plus size={17}/> Apri fascicolo</button>
                </form>:
                  <p className="prf-muted">{!clients.length?"Aggiungi prima un cliente.":"Il ruolo di sola lettura non può modificare i fascicoli."}</p>}
                {casesByClient.length>0&&<p className="prf-muted">Fascicoli per il cliente selezionato: {casesByClient.length}</p>}
              </div>
            </section>
            <section className="prf-panel">
              <div className="prf-panel-head"><h2><FolderKanban size={21}/> Fascicoli e verifiche</h2><span>{cases.length} pratiche</span></div>
              {cases.length>0&&<label className="prf-field">Pratica da esaminare
                <select value={caseId} onChange={(e)=>setCaseId(e.target.value)}>
                  {cases.map((c)=><option key={c.id} value={c.id}>
                    {c.title} · {clients.find((cl)=>cl.id===c.client_id)?.display_name??"Cliente"} · {c.status.replaceAll("_"," ")}
                  </option>)}
                </select>
              </label>}
              {selectedCase?<>
                <div className="prf-case-bar">
                  <span><FileCheck2 size={18}/>{CASE_TYPES.find((t)=>t.value===selectedCase.case_type)?.label}</span>
                  <span>Data indicata: {safeDate(selectedCase.due_date)}</span>
                  {canEdit&&<select aria-label="Stato della pratica" value={selectedCase.status}
                    onChange={(e)=>void updateStatus(e.target.value)}>
                    {statuses.map((s)=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>}
                </div>
                <div className="prf-task-head"><h3>Checklist operativa</h3><small>{tasks.length-openTasks}/{tasks.length} completate</small></div>
                <div className="prf-progress"><span style={{width:`${tasks.length?Math.round(100*(tasks.length-openTasks)/tasks.length):0}%`}}/></div>
                <div className="prf-tasks">
                  {tasks.map((task)=><label key={task.id} className={task.is_done?"is-done":""}>
                    <input type="checkbox" checked={task.is_done} disabled={!canEdit}
                      onChange={()=>void toggleTask(task)}/>
                    <span>{task.title}</span>
                  </label>)}
                  {!tasks.length&&<p className="prf-muted">Aggiungi le verifiche necessarie per questa pratica.</p>}
                </div>
                {canEdit&&<form className="prf-row-form" onSubmit={(e)=>void addTask(e)}>
                  <label className="prf-field">Aggiungi una verifica
                    <input minLength={3} maxLength={220} value={newTask} required
                      onChange={(e)=>setNewTask(e.target.value)} placeholder="Verifica personalizzata"/>
                  </label>
                  <button className="prf-outline" type="submit"><Plus size={16}/> Aggiungi</button>
                </form>}
                <div className="prf-assistant">
                  <h3><Sparkles size={19}/> Assistente per il professionista</h3>
                  <p>Indica il problema: DocuMio propone controlli e passi successivi.
                    Non accede automaticamente a norme aggiornate, casellari, piattaforme CAF o fascicoli PCT.</p>
                  <label className="prf-field">Cosa vuoi verificare?
                    <textarea rows={2} maxLength={900} value={question}
                      onChange={(e)=>setQuestion(e.target.value)}
                      placeholder="Es. Cosa manca prima di inviare la pratica?"/>
                  </label>
                  <button className="prf-primary" disabled={!question.trim()||loading} type="button"
                    onClick={()=>void requestGuidance()}><Sparkles size={17}/>{loading?"Analisi in corso…":"Proponi verifiche con AI"}</button>
                  {guidance&&<div className="prf-answer">
                    <strong>{guidance.aiUsed?"Proposte AI da verificare":"Verifiche dalla checklist"}</strong>
                    <p>{guidance.summary}</p>
                    {guidance.actions?.map((a,i)=><article key={i}>
                      <b>{a.step}</b><p>{a.why}</p><small>Da controllare: {a.verify}</small>
                    </article>)}
                    <p className="prf-muted">{guidance.limitations}</p>
                    {guidance.notice&&<p className="prf-muted">{guidance.notice}</p>}
                  </div>}
                </div>
              </>:<p className="prf-muted">Nessun fascicolo: creane uno per iniziare.</p>}
            </section>
            <section className="prf-panel">
              <div className="prf-panel-head"><h2><Users size={21}/> Collaboratori e permessi</h2><span>{1+members.length} accessi</span></div>
              <p className="prf-muted">Il titolare amministra lo studio; professionisti e collaboratori modificano fascicoli,
                gli utenti in sola lettura li consultano. I documenti dell'archivio personale e aziendale
                non sono condivisi automaticamente con il team.</p>
              <ul className="prf-people">
                <li><ShieldCheck size={17}/> Titolare dello studio <span>Owner</span></li>
                {members.map((m)=><li key={m.user_id}><UserRound size={17}/>{m.member_email}
                  <span>{roleLabel[m.role]}</span>
                  {role==="owner"&&<button className="prf-mini-danger" type="button"
                    onClick={()=>void removeMember(m)}>Rimuovi</button>}
                </li>)}
              </ul>
              {role==="owner"&&<>
                <form className="prf-row-form" onSubmit={(e)=>void inviteMember(e)}>
                  <label className="prf-field">Email collaboratore
                    <input required type="email" maxLength={254} value={inviteForm.email}
                      onChange={(e)=>setInviteForm({...inviteForm,email:e.target.value})}/>
                  </label>
                  <label className="prf-field">Permesso
                    <select value={inviteForm.role} onChange={(e)=>setInviteForm({...inviteForm,role:e.target.value as Member["role"]})}>
                      <option value="professional">Professionista</option>
                      <option value="collaborator">Collaboratore</option>
                      <option value="viewer">Sola lettura</option>
                    </select>
                  </label>
                  <button className="prf-primary" disabled={loading}><Plus size={16}/> Crea invito</button>
                </form>
                {inviteLink&&<div className="prf-invite"><p>Condividi questo link esclusivamente con l'indirizzo invitato:</p>
                  <input readOnly value={inviteLink} onFocus={(e)=>e.currentTarget.select()}/>
                  <button type="button" className="prf-outline" onClick={()=>void copyInvitation()}><Copy size={16}/> Copia link</button>
                </div>}
                {invites.some((i)=>!i.accepted_at&&!i.revoked_at)&&<div className="prf-invites">
                  {invites.filter((i)=>!i.accepted_at&&!i.revoked_at).map((i)=><div key={i.id}
                    className="prf-pending-invite">
                    <span>{i.email} · {roleLabel[i.role as Role]??i.role} · scade {safeDate(i.expires_at.slice(0,10))}</span>
                    <button type="button" className="prf-mini-danger" onClick={()=>void revokeInvite(i)}>Revoca</button>
                  </div>)}
                </div>}
              </>}
            </section>
            <aside className="prf-footer-note"><BookOpenCheck size={20}/>
              Questo modulo organizza pratiche e verifiche. Non compila né invia
              automaticamente dichiarazioni, atti, PEC o modelli ufficiali. La revisione del professionista resta necessaria.
            </aside>
          </>}
        </>}
      </>}
    </main>
  );
}
