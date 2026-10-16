"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, CheckCircle2, CircleAlert, FileText, FileUp,
  FolderOpen, LoaderCircle, RefreshCw, ShieldCheck, Sparkles,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { prepareFileForUpload } from "@/lib/prepare-upload-file";
import "./batch-upload.css";

type Stage = "pending" | "preparing" | "uploading" | "saving" | "saved" | "failed";
type UploadEntry = {
  id: string;
  name: string;
  bytes: number;
  stage: Stage;
  error?: string;
};
type DocumentKind = "other"|"invoice_pdf"|"bank_statement"|"payroll"|"f24"|"contract";
type QueuedFile = { id: string; file: File; companyId:string|null; kind:DocumentKind };
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH = 12;
const MAX_PARALLEL = 3;

function byteSize(size: number) {
  return size >= 1024 * 1024
    ? (size / (1024 * 1024)).toFixed(1) + " MB"
    : (size / 1024).toFixed(0) + " KB";
}
function safeName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-").slice(-120) || "documento.pdf";
}
async function supportedFile(file: File) {
  const name = file.name.toLowerCase();
  if (!/\.(pdf|png|jpe?g)$/.test(name)) return false;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (name.endsWith(".pdf"))
    return bytes[0]===37 && bytes[1]===80 && bytes[2]===68
      && bytes[3]===70 && bytes[4]===45;
  if (/\.jpe?g$/.test(name))
    return bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  return [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
}

export default function BatchUploadPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [generalError, setGeneralError] = useState("");
  const [companies,setCompanies] = useState<Array<{id:string;legal_name:string}>>([]);
  const [companyId,setCompanyId] = useState<string|null>(null);
  const [companyReady,setCompanyReady] = useState(false);
  const [scopeError,setScopeError] = useState("");
  const [documentKind,setDocumentKind] = useState<DocumentKind>("other");
  const queueRef = useRef<QueuedFile[]>([]);
  const inFlightRef = useRef(0);
  const filesRef = useRef(new Map<string, QueuedFile>());

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    void supabase.auth.getSession().then(({data}) => {
      if (!active) return;
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user.id ?? null);
      if (!session) {
        queueRef.current = [];
        filesRef.current.clear();
        setEntries([]);
      }
      setAuthReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(()=>{
    if(!userId){setCompanies([]);setCompanyReady(false);setCompanyId(null);return;}
    let active=true;
    void (async()=>{
      const supabase=getSupabaseClient();
      const {data,error}=await supabase!.from("financial_companies")
        .select("id,legal_name").eq("user_id",userId)
        .order("legal_name",{ascending:true});
      if(!active)return;
      const list=(data??[]) as Array<{id:string;legal_name:string}>;
      setCompanies(list);
      const requested=new URLSearchParams(window.location.search).get("company");
      if(requested && requested!=="personal" && !list.some((x)=>x.id===requested)) {
        setScopeError("L'azienda selezionata non appartiene a questo account o il modulo non è disponibile.");
        setCompanyReady(false);
      } else {
        setScopeError("");
        setCompanyId(requested&&requested!=="personal"?requested:null);
        setCompanyReady(!error);
        if(error)setScopeError("Impossibile verificare l'archivio aziendale.");
      }
    })();
    return ()=>{active=false;};
  },[userId]);

  useEffect(() => {
    if (!userId) { setAvailable(false); return; }
    let active = true;
    void (async() => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase!.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Sessione non valida.");
        const response = await fetch("/api/document-ai/trigger",{
          headers:{ Authorization:"Bearer " + token },cache:"no-store",
        });
        const result = await response.json();
        if (active) setAvailable(response.ok && Boolean(result.available));
      } catch {
        if (active) setAvailable(false);
      }
    })();
    return () => {active=false;};
  }, [userId]);

  function setStage(id:string, stage:Stage, error?:string) {
    setEntries((old)=>old.map((row)=>row.id === id
      ? { ...row, stage, error } : row));
  }

  async function saveFile(entry: QueuedFile, owner: string) {
    const file = entry.file;
    const supabase = getSupabaseClient();
    if (!supabase) { setStage(entry.id,"failed","Archivio non configurato."); return; }
    try {
      if (file.size === 0 || file.size > MAX_FILE_BYTES)
        throw new Error("File vuoto oppure superiore a 20 MB.");
      if (!/\.(pdf|png|jpe?g|heic|heif)$/i.test(file.name))
        throw new Error("Sono ammessi PDF, JPG, PNG e HEIC convertibili in JPG.");
      setStage(entry.id,"preparing");
      const prepared = (await prepareFileForUpload(file)).file;
      if (prepared.size === 0 || prepared.size > MAX_FILE_BYTES ||
        !(await supportedFile(prepared)))
        throw new Error("File non leggibile, danneggiato o con formato non supportato.");

      setStage(entry.id,"uploading");
      const path = owner + "/" + crypto.randomUUID() + "-" + safeName(prepared.name);
      const {error: uploadError} = await supabase.storage
        .from("documents").upload(path,prepared,{
          cacheControl:"3600",contentType:prepared.type || undefined,upsert:false,
        });
      if (uploadError) throw new Error("Caricamento non riuscito: " + uploadError.message);

      setStage(entry.id,"saving");
      const {data,error:saveError} = await supabase.from("documents").insert({
        user_id:owner,
        company_id:entry.companyId,
        financial_document_type:entry.kind==="other"?null:entry.kind,
        accounting_review_status:entry.kind==="other"?"not_applicable":"needs_review",
        file_name:prepared.name,
        title:prepared.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").slice(0,180),
        category:"Altro",
        summary:"File salvato. Analisi AI in attesa.",
        keywords:[],
        uploaded_at:new Date().toISOString(),
        size:prepared.size,
        storage_path:path,
        payment_status:"Da pagare",
        ai_status:"queued",
      }).select("id").single();
      if (saveError || !data?.id) {
        await supabase.storage.from("documents").remove([path]);
        throw new Error("Impossibile archiviare la scheda del file.");
      }

      // F24/paghe/contratti restano "da verificare", anche dopo aver
      // caricato il PDF. Una scheda amministrativa non inventa gli importi.
      if(["f24","payroll","bank_statement","contract"].includes(entry.kind)) {
        const {error:recordError}=await supabase.from("financial_accounting_records").insert({
          user_id:owner,company_id:entry.companyId,
          document_id:data.id,record_type:entry.kind,title:prepared.name,
          category:"da_verificare",review_status:"needs_review",
        });
        if(recordError)setGeneralError(
          "Alcune schede contabili non sono state create automaticamente. I file restano salvati; puoi completarle da Contabilità e documenti.");
      }
      // Stato salvato = file nello Storage e scheda registrata.
      // La richiesta AI parte DOPO, senza bloccare questa conferma.
      setStage(entry.id,"saved");
      filesRef.current.delete(entry.id);
      void (async() => {
        try {
          const {data:session} = await supabase.auth.getSession();
          if (!session.session?.access_token) return;
          await fetch("/api/document-ai/trigger",{
            method:"POST",
            headers:{
              Authorization:"Bearer " + session.session.access_token,
              "Content-Type":"application/json",
            },
            body:JSON.stringify({documentId:data.id}),
          });
        } catch {
          // Il job e' gia' nella coda persistente sul database.
        }
      })();
    } catch (problem) {
      setStage(entry.id,"failed",problem instanceof Error
        ? problem.message : "Caricamento non riuscito.");
    }
  }

  function pump(owner: string) {
    while(inFlightRef.current < MAX_PARALLEL && queueRef.current.length) {
      const next = queueRef.current.shift()!;
      inFlightRef.current++;
      void saveFile(next,owner).finally(()=>{
        inFlightRef.current--;
        pump(owner);
      });
    }
  }

  function queueFiles(files: File[]) {
    if (!userId || !available || !companyReady || scopeError) return;
    const batch = files.slice(0,MAX_BATCH);
    if (!batch.length) return;
    setGeneralError(files.length > MAX_BATCH
      ? "Per evitare sovraccarichi sono stati selezionati i primi 12 file. Potrai aggiungere gli altri in una seconda selezione."
      : "");
    const queued = batch.map((file)=>({
      id:crypto.randomUUID(),file,companyId,kind:documentKind,
    }));
    queued.forEach((item)=>filesRef.current.set(item.id,item));
    setEntries((current)=>[
      ...queued.map((item)=>({
        id:item.id,name:item.file.name,bytes:item.file.size,stage:"pending" as Stage,
      })),...current,
    ].slice(0,100));
    queueRef.current.push(...queued);
    pump(userId);
  }

  function retry(id:string) {
    const entry = filesRef.current.get(id);
    if (!entry || !userId || !available || !companyReady) return;
    setStage(id,"pending");
    queueRef.current.push(entry);
    pump(userId);
  }

  const saved=entries.filter((item)=>item.stage==="saved").length;
  const failed=entries.filter((item)=>item.stage==="failed").length;
  const active=entries.filter((item)=>
    ["pending","preparing","uploading","saving"].includes(item.stage)).length;

  return <main id="dm-main-content" className="du-page">
    <header className="du-header">
      <a href="/" className="du-back"><ArrowLeft size={18}/> Torna a DocuMio</a>
      <span className="du-secure"><ShieldCheck size={16}/> Archivio privato</span>
    </header>
    <section className="du-hero">
      <div className="du-kicker"><Sparkles size={17}/> DocuMio · Caricamento rapido</div>
      <h1>Carica tanti documenti. Senza aspettare l'AI.</h1>
      <p>Seleziona o trascina foto e PDF. Ogni file viene salvato nel tuo archivio non appena termina il trasferimento; la classificazione AI avviene separatamente.</p>
    </section>
    {!authReady ? <div className="du-info"><LoaderCircle size={18}/> Verifico l'accesso…</div>
    : !userId ? <div className="du-info">
      <CircleAlert size={20}/> Accedi al tuo account prima di caricare documenti.
      <a href="/">Vai all'accesso</a>
    </div>
    : available === null ? <div className="du-info"><LoaderCircle size={18}/> Verifico l'archivio…</div>
    : !available ? <div className="du-info">
      <CircleAlert size={20}/>
      <div><strong>Funzione in attivazione.</strong>
      <p>È necessaria la migrazione della coda AI su Supabase. Il caricamento singolo approfondito rimane disponibile nell'archivio principale.</p>
      <a href="/">Torna all'archivio</a></div>
    </div>
    : <>
      <section className="du-workspace-picker">
        <div className="du-workspace-heading"><FolderOpen size={20}/>
          <div><strong>In quale archivio?</strong>
            <small>La scelta vale per tutti i file della prossima selezione.</small></div>
        </div>
        <div className="du-workspace-fields">
          <label>Archivio
            <select value={companyId??""} disabled={!companyReady} onChange={(event)=>{
              const next=event.target.value;
              setCompanyId(next||null);
              const url=new URL(window.location.href);
              if(next)url.searchParams.set("company",next); else url.searchParams.delete("company");
              window.history.replaceState(null,"",url);
              window.dispatchEvent(new Event("documio:workspace"));
            }}>
              <option value="">Personale</option>
              {companies.map((company)=><option key={company.id} value={company.id}>
                {company.legal_name}</option>)}
            </select>
          </label>
          <label>Tipo documento
            <select value={documentKind}
              onChange={(event)=>setDocumentKind(event.target.value as DocumentKind)}>
              <option value="other">Documento generico</option>
              <option value="invoice_pdf">Fattura PDF / immagine</option>
              <option value="bank_statement">Estratto conto PDF</option>
              <option value="f24">Modello F24</option>
              <option value="payroll">Busta paga / cedolino</option>
              <option value="contract">Contratto da controllare</option>
            </select>
          </label>
        </div>
        <a href={companyId? `/controllo?company=${encodeURIComponent(companyId)}` : "/controllo"}>
          Per fatture elettroniche XML e movimenti CSV usa il Centro di controllo →
        </a>
      </section>
      <label className={`du-drop ${dragging ? "dragging":""}`}
        onDragOver={(event)=>{event.preventDefault();setDragging(true);}}
        onDragLeave={(event)=>{event.preventDefault();setDragging(false);}}
        onDrop={(event)=>{
          event.preventDefault();setDragging(false);
          queueFiles(Array.from(event.dataTransfer.files));
        }}>
        <FileUp size={32}/>
        <strong>Seleziona fino a 12 documenti alla volta</strong>
        <span>Oppure trascinali qui · PDF, JPG, PNG, HEIC compatibile · fino a 20 MB ciascuno</span>
        <input type="file" multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/*"
          onChange={(event)=>{
            queueFiles(Array.from(event.currentTarget.files??[]));
            event.currentTarget.value="";
          }}/>
      </label>
      {scopeError && <p className="du-error" role="alert">{scopeError}</p>}
      {generalError && <p className="du-error" role="alert">{generalError}</p>}
      <section className="du-results">
        <div className="du-results-head">
          <div>
            <h2>Caricamenti</h2>
            <p>Il file viene registrato subito dopo l'upload. L'AI può richiedere più tempo.</p>
          </div>
          <div className="du-counts">
            {saved>0 && <span><CheckCircle2 size={16}/> {saved} salvati</span>}
            {active>0 && <span><LoaderCircle size={16}/> {active} in corso</span>}
            {failed>0 && <span><CircleAlert size={16}/> {failed} da riprovare</span>}
          </div>
        </div>
        {!entries.length && <div className="du-empty"><FolderOpen size={25}/>
          Non hai ancora selezionato documenti.</div>}
        {!!entries.length && <div className="du-list">
          {entries.map((entry)=>{
            const label = ({
              pending:"In coda",preparing:"Preparo il file",uploading:"Trasferimento",
              saving:"Registro il documento",saved:"File salvato · AI separata",
              failed:"Non completato",
            } as Record<Stage,string>)[entry.stage];
            return <article key={entry.id} className={`du-row ${entry.stage}`}>
              <span className="du-file-icon"><FileText size={21}/></span>
              <div className="du-file-info">
                <strong>{entry.name}</strong>
                <small>{byteSize(entry.bytes)} · {label}</small>
                {entry.error && <p role="alert">{entry.error}</p>}
              </div>
              {entry.stage==="saved" ? <CheckCircle2 size={23} className="du-check"/>
               : entry.stage==="failed" ? <button type="button"
                 onClick={()=>retry(entry.id)}><RefreshCw size={16}/> Riprova</button>
               : <LoaderCircle size={19} className="du-spinner"/>}
            </article>;
          })}
        </div>}
        {saved>0 && <a className="du-open" href="/">Apri i documenti salvati
          <FolderOpen size={17}/></a>}
      </section>
      <div className="du-disclaimer">I documenti non vengono condivisi tra utenti. Il riconoscimento AI può commettere errori: importi, scadenze, collegamenti di ricevute e pagamenti devono essere verificati. Per file importanti, conserva anche l'originale.</div>
    </>}
  </main>;
}
