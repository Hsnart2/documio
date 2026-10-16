"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronRight, FileText,
  Landmark, Plus, ShieldCheck, Sparkles, UploadCloud, Wallet, X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import "./company-workspaces.css";

type Company = {
  id: string;
  legal_name: string;
  vat_number: string | null;
  tax_code: string | null;
  legal_form: string | null;
  activity: string | null;
  address: string | null;
  fiscal_year_end: string;
  status: "active" | "archived";
  created_at: string;
};
const initialForm = { legal_name:"",vat_number:"",tax_code:"",
  legal_form:"",activity:"",address:"" };

export default function CompanyWorkspacesPage() {
  const [userId,setUserId]=useState<string|null>(null);
  const [authReady,setAuthReady]=useState(false);
  const [companies,setCompanies]=useState<Company[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [working,setWorking]=useState(false);
  const [newCompany,setNewCompany]=useState(false);
  const [editingCompanyId,setEditingCompanyId]=useState<string|null>(null);
  const [form,setForm]=useState(initialForm);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function loadCompanies(id:string) {
    const supabase=getSupabaseClient();
    if (!supabase) {setError("Archivio non configurato.");return;}
    const {data,error:loadError}=await supabase.from("financial_companies")
      .select("id,legal_name,vat_number,tax_code,legal_form,activity,address,fiscal_year_end,status,created_at")
      .eq("user_id",id).order("legal_name",{ascending:true});
    setLoaded(true);
    if(loadError){setError("Modulo multi-azienda non ancora attivato nel database.");return;}
    setCompanies((data??[]) as Company[]);
  }

  useEffect(()=>{
    const supabase=getSupabaseClient();
    if(!supabase){setAuthReady(true);return;}
    let active=true;
    void supabase.auth.getUser().then(({data})=>{
      if(!active)return;
      setUserId(data.user?.id??null);setAuthReady(true);
      if(data.user?.id)void loadCompanies(data.user.id);
    });
    const {data:sub}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(!active)return;
      setUserId(session?.user.id??null);setAuthReady(true);
      if(session?.user.id)void loadCompanies(session.user.id);
      else {setCompanies([]);setLoaded(false);}
    });
    return ()=>{active=false;sub.subscription.unsubscribe();};
  },[]);

  function editCompany(company:Company) {
    setEditingCompanyId(company.id);
    setForm({
      legal_name:company.legal_name,vat_number:company.vat_number??"",
      tax_code:company.tax_code??"",legal_form:company.legal_form??"",
      activity:company.activity??"",address:company.address??"",
    });
    setNewCompany(true);setError("");setNotice("");
  }

  async function createCompany(event:FormEvent) {
    event.preventDefault();
    const name=form.legal_name.trim();
    if(!userId || working)return;
    if(name.length<2){setError("Inserisci una ragione sociale valida.");return;}
    const vat=form.vat_number.replace(/\s/g,"").toUpperCase();
    if(vat && !/^[A-Z0-9]{8,20}$/.test(vat)){setError("Partita IVA non valida: verifica il codice.");return;}
    setWorking(true);setError("");setNotice("");
    const supabase=getSupabaseClient()!;
    const payload={
      legal_name:name,vat_number:vat||null,
      tax_code:form.tax_code.trim().toUpperCase()||null,
      legal_form:form.legal_form.trim()||null,
      activity:form.activity.trim()||null,address:form.address.trim()||null,
    };
    const {data,error:createError}=editingCompanyId
      ? await supabase.from("financial_companies").update(payload)
          .eq("id",editingCompanyId).eq("user_id",userId).select("id").single()
      : await supabase.from("financial_companies")
          .insert({...payload,user_id:userId}).select("id").single();
    setWorking(false);
    if(createError){setError(createError.message);return;}
    const wasEditing=Boolean(editingCompanyId);
    setForm(initialForm);setNewCompany(false);setEditingCompanyId(null);
    setNotice(wasEditing
      ? "Anagrafica aziendale aggiornata. Le fatture restano da verificare."
      : "Azienda creata. Da questo momento puoi gestirla separatamente dalle altre.");
    await loadCompanies(userId);
    if(!wasEditing&&data?.id)
      window.location.assign("/controllo?company="+encodeURIComponent(data.id));
  }

  if(!authReady)return <main className="cw-page"><p>Verifico la sessione…</p></main>;
  if(!userId)return <main className="cw-page"><section className="cw-empty">
    <ShieldCheck size={29}/><h1>Area aziende riservata</h1>
    <p>Accedi a DocuMio per gestire le tue aziende.</p><a href="/">Vai all'accesso <ArrowRight size={17}/></a>
  </section></main>;
  return <main className="cw-page">
    <header className="cw-header">
      <a href="/controllo"><ArrowLeft size={18}/> Centro di controllo</a>
      <span><ShieldCheck size={16}/> Ogni archivio è separato</span>
    </header>

    <section className="cw-hero">
      <div>
        <small><Sparkles size={16}/> IL TUO UFFICIO DIGITALE</small>
        <h1>Le tue aziende, tutte sotto controllo.</h1>
        <p>Gestisci più attività con fatture, costi, scadenze, estratti conto e documenti distinti. Il tuo archivio personale resta separato.</p>
      </div>
      <Building2 size={55} aria-hidden="true"/>
    </section>

    {error && <div role="alert" className="cw-error">{error}</div>}
    {notice && <div role="status" className="cw-success"><CheckCircle2 size={17}/>{notice}</div>}

    <section className="cw-workspaces">
      <div className="cw-title">
        <div><span>ARCHIVI</span><h2>Scegli dove lavorare</h2></div>
        <button type="button" className="cw-new" onClick={()=>{setEditingCompanyId(null);setForm(initialForm);setNewCompany(true);setError("");}}>
          <Plus size={18}/> Crea azienda
        </button>
      </div>
      <div className="cw-grid">
        <article className="cw-card cw-personal">
          <span className="cw-icon"><FileText size={25}/></span>
          <div><small>ARCHIVIO PERSONALE</small><h3>La mia documentazione</h3>
            <p>Casa, famiglia, utenze, documenti e spese personali.</p></div>
          <div className="cw-card-actions">
            <a href="/?company=personal&view=documents#documio-library">Documenti <ChevronRight size={16}/></a>
            <a href="/controllo">Finanze <ChevronRight size={16}/></a>
          </div>
        </article>
        {!loaded && <div className="cw-card">Carico le aziende…</div>}
        {companies.map((company)=><article key={company.id} className="cw-card">
          <span className="cw-icon"><Building2 size={25}/></span>
          <div><small>{company.status==="archived"?"AZIENDA ARCHIVIATA":"AZIENDA"}</small>
            <h3>{company.legal_name}</h3>
            <p>{company.vat_number? "P. IVA "+company.vat_number+" · ": ""}
              {company.activity||company.legal_form||"Archivio aziendale indipendente"}
            </p>
          </div>
          <div className="cw-card-actions">
            <a href={`/controllo?company=${encodeURIComponent(company.id)}`}>Contabilità <Wallet size={16}/></a>
            <a href={`/carica?company=${encodeURIComponent(company.id)}`}>Carica file <UploadCloud size={16}/></a>
            <a href={`/?company=${encodeURIComponent(company.id)}&view=documents#documio-library`}>Archivio <FileText size={16}/></a>
            <button type="button" className="cw-company-edit"
              onClick={()=>editCompany(company)}>Modifica dati</button>
          </div>
        </article>)}
      </div>
      {loaded && !companies.length && <p className="cw-hint">Non hai ancora creato aziende. Puoi iniziare dal pulsante «Crea azienda»; nulla verrà spostato dall'archivio personale automaticamente.</p>}
    </section>

    <section className="cw-guidance">
      <span><Landmark size={23}/></span>
      <div>
        <h2>Cosa gestisce già il modulo amministrativo</h2>
        <p>Fatture XML, entrate e uscite bancarie CSV, riconciliazioni con conferma, scadenze e categorie di costo suggerite. Buste paga, F24 e contratti possono essere archiviati e collegati alla rispettiva azienda; l'interpretazione fiscale e legale rimane da verificare.</p>
      </div>
    </section>

    {newCompany && <div className="cw-overlay" onMouseDown={()=>!working&&setNewCompany(false)}>
      <section className="cw-modal" role="dialog" aria-modal="true" aria-labelledby="cw-modal-title"
        onMouseDown={(e)=>e.stopPropagation()}>
        <button type="button" className="cw-close" aria-label="Chiudi" disabled={working}
          onClick={()=>setNewCompany(false)}><X size={19}/></button>
        <span className="cw-icon"><Building2 size={23}/></span>
        <h2 id="cw-modal-title">{editingCompanyId?"Modifica anagrafica aziendale":"Crea archivio aziendale"}</h2>
        <p>{editingCompanyId
          ? "Aggiorna le informazioni, in particolare la partita IVA usata per verificare gli XML intestati all'impresa."
          : "La ragione sociale identifica un nuovo spazio riservato. Puoi gestire altre aziende senza mescolare i dati."}</p>
        <form onSubmit={(e)=>void createCompany(e)} className="cw-form">
          <label>Ragione sociale *<input autoFocus required maxLength={180}
            value={form.legal_name} placeholder="Es. Azienda S.r.l."
            onChange={(e)=>setForm({...form,legal_name:e.target.value})}/></label>
          <div className="cw-form-grid">
            <label>Partita IVA<input maxLength={20} value={form.vat_number}
              onChange={(e)=>setForm({...form,vat_number:e.target.value})}/></label>
            <label>Codice fiscale<input maxLength={20} value={form.tax_code}
              onChange={(e)=>setForm({...form,tax_code:e.target.value})}/></label>
          </div>
          <div className="cw-form-grid">
            <label>Forma giuridica<input value={form.legal_form} maxLength={80}
              placeholder="S.r.l., S.n.c., ditta individuale…"
              onChange={(e)=>setForm({...form,legal_form:e.target.value})}/></label>
            <label>Attività<input value={form.activity} maxLength={160}
              placeholder="Es. produzione imballaggi"
              onChange={(e)=>setForm({...form,activity:e.target.value})}/></label>
          </div>
          <label>Sede / note anagrafiche<input value={form.address} maxLength={300}
            onChange={(e)=>setForm({...form,address:e.target.value})}/></label>
          <div className="cw-modal-actions">
            <button type="button" disabled={working} onClick={()=>setNewCompany(false)}>Annulla</button>
            <button type="submit" disabled={working||form.legal_name.trim().length<2}>
              <Plus size={17}/>{working?"Salvataggio…":editingCompanyId?"Salva modifiche":"Crea azienda"}</button>
          </div>
        </form>
      </section>
    </div>}
  </main>;
}
