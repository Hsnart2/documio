"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Building2,
  CheckCircle2, CircleAlert, Clock3, Cpu, Download,
  FileText, HardDrive, LockKeyhole, Mail, PlugZap,
  Receipt, RefreshCw, Search, ShieldCheck, UsersRound,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import "./owner.css";

type Period = 7 | 30 | 90;
type Tab = "panoramica" | "clienti" | "consumi" | "integrazioni";
type Customer = {
  id:string; email:string|null; created_at:string; last_sign_in_at:string|null;
  last_activity:string|null; documents:number; documents_period:number;
  document_bytes:number; invoices:number; companies:number; active_days:number;
  api_calls:number; api_errors:number; input_tokens:number; output_tokens:number;
  email_connections:number; bank_connections:number;
};
type Company = {
  id:string; user_id:string; legal_name:string; documents:number;
  document_bytes:number; invoices:number; api_calls:number;
};
type Day = { day:string; active:number; uploads:number; invoices:number; api_calls:number };
type Provider = {
  provider:string; feature:string; calls:number; errors:number;
  input_tokens:number; output_tokens:number; cached_input_tokens:number;
};
type Integration = { id:string; name:string; type:string; configured:boolean; detail:string };
type Totals = {
  registered:number; signedInPeriod:number; trackedToday:number; trackedPeriod:number;
  documents:number; uploadedPeriod:number; documentBytes:number; invoices:number;
  companies:number; apiCalls:number; apiErrors:number; inputTokens:number;
  outputTokens:number; aiQueued:number; emailConnections:number; bankConnections:number;
};
type Overview = {
  periodDays:number; generatedAt:string; activityRecordedSince:string; totals:Totals;
  customers:Customer[]; companies:Company[]; daily:Day[];
  providerUsage:Provider[]; integrations:Integration[];
  notes:{api:string;storage:string;active:string};
};

function num(value:number|null|undefined) {return Number(value||0).toLocaleString("it-IT");}
function bytes(value:number|null|undefined) {
  const n=Number(value||0);
  if(n<1024)return num(n)+" B";
  if(n<1024**2)return (n/1024).toLocaleString("it-IT",{maximumFractionDigits:1})+" KB";
  if(n<1024**3)return (n/1024**2).toLocaleString("it-IT",{maximumFractionDigits:1})+" MB";
  return (n/1024**3).toLocaleString("it-IT",{maximumFractionDigits:2})+" GB";
}
function day(value:string|null|undefined,withTime=false) {
  if(!value)return "Mai";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return "—";
  return new Intl.DateTimeFormat("it-IT",{
    timeZone:"Europe/Rome",day:"2-digit",month:"short",year:"numeric",
    ...(withTime?{hour:"2-digit",minute:"2-digit"}:{}),
  }).format(d);
}
function csvCell(value:string|number) {
  const cleaned=String(value).replace(/^[\s]*[=+\-@]/,"'$&").replace(/"/g,'""');
  return '"'+cleaned+'"';
}
function downloadCustomers(items:Customer[],period:number) {
  const rows=[["Email","Registrazione","Ultimo login","Documenti","Nuovi documenti",
    "Byte documenti","Fatture","Aziende","Giorni attivi","Chiamate AI",
    "Errori API","Token in","Token out","Email collegate","Banche collegate"].map(csvCell).join(";")];
  items.forEach(c=>rows.push([
    c.email||c.id,c.created_at,c.last_sign_in_at||"",c.documents,c.documents_period,
    c.document_bytes,c.invoices,c.companies,c.active_days,c.api_calls,c.api_errors,
    c.input_tokens,c.output_tokens,c.email_connections,c.bank_connections,
  ].map(csvCell).join(";")));
  const blob=new Blob(["\uFEFF"+rows.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="documio-clienti-"+period+"giorni.csv";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Trend({series,metric}:{series:Day[];metric:"active"|"uploads"|"api_calls"}) {
  const maximum=Math.max(1,...series.map(x=>x[metric]||0));
  return <div className="own-trend">
    <div className="own-chart" role="img" aria-label={"Andamento giornaliero: "+metric}}>
      {series.map(point=><span key={point.day} className="own-daybar"
        title={point.day+": "+num(point[metric])} style={{height:Math.max(3,100*point[metric]/maximum)+"%"}}/>)}
    </div>
    <div className="own-axis"><span>{series[0]?day(series[0].day):"—"}</span>
      <span>{series.length?day(series[series.length-1].day):"—"}</span></div>
  </div>;
}
function Stat({title,value,hint,icon:Icon}:{title:string;value:string;hint:string;icon:typeof Activity}) {
  return <article className="own-stat"><div className="own-stat-label">{title}<Icon size={18}/></div>
    <strong>{value}</strong><small>{hint}</small></article>;
}

export default function OwnerPage() {
  const [period,setPeriod]=useState<Period>(30);
  const [tab,setTab]=useState<Tab>("panoramica");
  const [data,setData]=useState<Overview|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [metric,setMetric]=useState<"active"|"uploads"|"api_calls">("active");
  const [refresh,setRefresh]=useState(0);
  const load=useCallback(async(signal:AbortSignal)=>{
    setLoading(true);setError("");
    try{
      const supabase=getSupabaseClient();
      if(!supabase)throw new Error("Supabase non configurato.");
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)throw new Error("Accedi prima a DocuMio con l'account Owner verificato.");
      const response=await fetch("/api/owner/overview?days="+period,{
        cache:"no-store",signal,headers:{Authorization:"Bearer "+session.access_token},
      });
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||"Impossibile leggere le statistiche.");
      if(!signal.aborted)setData(payload as Overview);
    }catch(problem){
      if(!signal.aborted){setData(null);setError(problem instanceof Error?problem.message:"Errore di caricamento.");}
    }finally{if(!signal.aborted)setLoading(false);}
  },[period]);
  useEffect(()=>{
    const abort=new AbortController();void load(abort.signal);
    return ()=>abort.abort();
  },[load,refresh]);
  const customers=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (data?.customers||[]).filter(c=>!q ||
      c.email?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) ||
      (data?.companies||[]).some(company=>company.user_id===c.id &&
        company.legal_name.toLowerCase().includes(q)));
  },[data,search]);
  const t=data?.totals;
  const tabs:Array<{key:Tab;title:string;icon:typeof Activity}>=[
    {key:"panoramica",title:"Panoramica",icon:BarChart3},
    {key:"clienti",title:"Clienti",icon:UsersRound},
    {key:"consumi",title:"Consumi API",icon:Cpu},
    {key:"integrazioni",title:"Collegamenti",icon:PlugZap},
  ];

  return <main id="dm-main-content" className="own-page"><div className="own-width">
    <div className="own-topline"><a href="/"><ArrowLeft size={17}/> Torna a DocuMio</a>
      <span><LockKeyhole size={15}/> Riservato all'Owner</span></div>
    <header className="own-hero">
      <div><p><ShieldCheck size={16}/> DOCUMIO · OWNER CONTROL CENTER</p>
        <h1>La tua app, tutta sotto controllo.</h1>
        <span>Utenti, aziende, documenti, consumi API e servizi collegati. Senza aprire gli archivi dei clienti.</span>
      </div><div className="own-hero-icon"><BarChart3 size={52} strokeWidth={1.5}/></div>
    </header>
    <div className="own-toolbar">
      <nav aria-label="Pannello Owner" className="own-tabs">{tabs.map(x=>
        <button key={x.key} type="button" onClick={()=>setTab(x.key)}
          className={tab===x.key?"selected":""}><x.icon size={16}/>{x.title}</button>)}</nav>
      <div className="own-toolbar-right">
        <label>Periodo <select value={period} onChange={e=>setPeriod(Number(e.target.value) as Period)}>
          <option value={7}>7 giorni</option><option value={30}>30 giorni</option>
          <option value={90}>90 giorni</option></select></label>
        <button type="button" onClick={()=>setRefresh(n=>n+1)} disabled={loading}><RefreshCw size={16}/> Aggiorna</button>
      </div>
    </div>
    {error && <section className="own-message own-error" role="alert"><CircleAlert size={24}/>
      <div><h2>Area Owner non disponibile</h2><p>{error}</p>
        <p>Serve l'account DocuMio verificato <strong>nextmindsoftware@gmail.com</strong>.</p>
        <a href="/">Apri l'accesso <ArrowRight size={15}/></a></div></section>}
    {loading&&!data&&!error&&<section className="own-message"><RefreshCw size={22}/> Caricamento statistiche reali…</section>}
    {data&&t&&<>
      {tab==="panoramica"&&<>
        <div className="own-section-title"><div><small>RIEPILOGO</small><h2>Stato dell'applicazione</h2></div>
          <span>Aggiornato: {day(data.generatedAt,true)}</span></div>
        <div className="own-stat-grid">
          <Stat title="Utenti registrati" value={num(t.registered)} hint="Account presenti" icon={UsersRound}/>
          <Stat title="Ultimo login nel periodo" value={num(t.signedInPeriod)} hint="Account con accesso recente" icon={Activity}/>
          <Stat title="Utenti attivi oggi" value={num(t.trackedToday)} hint="Rilevazione effettiva UTC" icon={Clock3}/>
          <Stat title="Documenti" value={num(t.documents)} hint={"+"+num(t.uploadedPeriod)+" nel periodo"} icon={FileText}/>
          <Stat title="Fatture" value={num(t.invoices)} hint="Registrazioni contabili" icon={Receipt}/>
          <Stat title="Spazio documenti" value={bytes(t.documentBytes)} hint="Dimensioni dichiarate" icon={HardDrive}/>
          <Stat title="Chiamate API" value={num(t.apiCalls)} hint={num(t.apiErrors)+" errori"} icon={Cpu}/>
          <Stat title="AI da elaborare" value={num(t.aiQueued)} hint="In coda, in corso, errori" icon={CircleAlert}/>
        </div>
        <section className="own-panel">
          <div className="own-panel-head"><div><small>ANDAMENTO</small><h2>Quanto viene usata DocuMio</h2></div>
            <div className="own-switch">
              {([{key:"active",label:"Utenti"},{key:"uploads",label:"Caricamenti"},{key:"api_calls",label:"API"}] as const).map(x=>
                <button type="button" key={x.key} className={metric===x.key?"active":""}
                  onClick={()=>setMetric(x.key)}>{x.label}</button>)}
            </div>
          </div><Trend series={data.daily} metric={metric}/>
          <p className="own-note"><Activity size={15}/>{data.notes.active} Monitoraggio avviato il {day(data.activityRecordedSince)}.</p>
        </section>
        <div className="own-columns">
          <section className="own-panel"><div className="own-panel-head"><div><small>AI</small><h2>Consumi misurati</h2></div><Cpu size={20}/></div>
            <div className="own-twometrics"><div><span>Token input</span><strong>{num(t.inputTokens)}</strong></div>
              <div><span>Token output</span><strong>{num(t.outputTokens)}</strong></div></div>
            <p className="own-note">Sono token registrati dall'API, non importi fatturati.</p>
            <button className="own-action" onClick={()=>setTab("consumi")}>Dettaglio consumi <ArrowRight size={16}/></button>
          </section>
          <section className="own-panel"><div className="own-panel-head"><div><small>COLLEGAMENTI</small><h2>Integrazioni configurate</h2></div><PlugZap size={20}/></div>
            <div className="own-large-inline"><strong>{num(data.integrations.filter(x=>x.configured).length)} / {num(data.integrations.length)}</strong>
              <span>servizi con configurazione presente</span></div>
            <p className="own-note">La presenza della chiave non prova lo stato operativo del provider.</p>
            <button className="own-action" onClick={()=>setTab("integrazioni")}>Apri integrazioni <ArrowRight size={16}/></button>
          </section>
        </div>
      </>}

      {tab==="clienti"&&<>
        <div className="own-section-title"><div><small>CLIENTI</small><h2>Utilizzo per account</h2></div>
          <button className="own-export" type="button" onClick={()=>downloadCustomers(customers,period)}><Download size={17}/> Esporta CSV</button></div>
        <section className="own-panel">
          <div className="own-filter"><label><Search size={18}/>
            <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Cerca email, ID o azienda…" aria-label="Cerca clienti"/></label>
            <span>{num(customers.length)} account</span></div>
          <div className="own-table-scroll"><table className="own-table">
            <thead><tr><th>Cliente</th><th>Ultimo login</th><th>Documenti</th><th>Spazio</th><th>Fatture</th><th>API / Token</th><th>Dettagli</th></tr></thead>
            <tbody>{customers.slice(0,200).map(c=><Fragment key={c.id}>
              <tr><td><strong>{c.email||"Account senza email"}</strong><small>Creato il {day(c.created_at)} · {num(c.companies)} aziende</small></td>
                <td>{day(c.last_sign_in_at,true)}<small>{num(c.active_days)} giorni attivi</small></td>
                <td>{num(c.documents)}<small>+{num(c.documents_period)} nel periodo</small></td>
                <td>{bytes(c.document_bytes)}</td><td>{num(c.invoices)}</td>
                <td>{num(c.api_calls)} chiamate<small>{num(c.input_tokens+c.output_tokens)} token · {num(c.api_errors)} errori</small></td>
                <td><button type="button" className="own-detail" aria-expanded={expanded===c.id}
                  onClick={()=>setExpanded(v=>v===c.id?null:c.id)}>{expanded===c.id?"Chiudi":"Apri"}</button></td>
              </tr>
              {expanded===c.id&&<tr className="own-expanded"><td colSpan={7}>
                <div className="own-expanded-metrics">
                  <div>Ultima attività<strong>{day(c.last_activity,true)}</strong></div>
                  <div>Email collegate<strong>{num(c.email_connections)}</strong></div>
                  <div>Banche collegate<strong>{num(c.bank_connections)}</strong></div>
                  <div>Token in / out<strong>{num(c.input_tokens)} / {num(c.output_tokens)}</strong></div>
                </div>
                <div className="own-company-details"><strong>Aziende gestite</strong>
                  {data.companies.filter(x=>x.user_id===c.id).length===0
                    ? <p>Solo archivio personale.</p>
                    : data.companies.filter(x=>x.user_id===c.id).map(company=>
                      <div key={company.id}><Building2 size={16}/><span>{company.legal_name}</span>
                        <small>{num(company.documents)} documenti · {num(company.invoices)} fatture · {bytes(company.document_bytes)} · {num(company.api_calls)} chiamate API</small></div>)}
                </div>
              </td></tr>}
            </Fragment>)}</tbody>
          </table></div>
          {!customers.length&&<p className="own-note">Nessun account corrisponde alla ricerca.</p>}
          {customers.length>200&&<p className="own-note">Mostrati i primi 200 account; il CSV include tutti i risultati filtrati.</p>}
        </section>
        <p className="own-privacy-note"><ShieldCheck size={16}/> Sono visibili solo informazioni amministrative e statistiche: non si aprono file o dati bancari dei clienti.</p>
      </>}

      {tab==="consumi"&&<>
        <div className="own-section-title"><div><small>API</small><h2>Consumi per funzione</h2></div><span>Ultimi {period} giorni</span></div>
        <div className="own-stat-grid own-api-grid">
          <Stat title="Chiamate registrate" value={num(t.apiCalls)} hint="API monitorate" icon={Cpu}/>
          <Stat title="Input AI" value={num(t.inputTokens)} hint="Token provider" icon={BarChart3}/>
          <Stat title="Output AI" value={num(t.outputTokens)} hint="Token provider" icon={Activity}/>
          <Stat title="Errori API" value={num(t.apiErrors)} hint="Chiamate fallite" icon={CircleAlert}/>
        </div>
        <section className="own-panel"><div className="own-panel-head"><div><small>FORNITORI API</small><h2>Chiamate e token</h2></div></div>
          {data.providerUsage.length?<div className="own-table-scroll"><table className="own-table">
            <thead><tr><th>Provider</th><th>Funzione</th><th>Chiamate</th><th>Input</th><th>Output</th><th>Cache input</th><th>Errori</th></tr></thead>
            <tbody>{data.providerUsage.map((x,i)=><tr key={x.provider+x.feature+i}>
              <td><strong>{x.provider}</strong></td><td>{x.feature}</td><td>{num(x.calls)}</td>
              <td>{num(x.input_tokens)}</td><td>{num(x.output_tokens)}</td>
              <td>{num(x.cached_input_tokens)}</td><td>{num(x.errors)}</td>
            </tr>)}</tbody>
          </table></div>:<div className="own-empty"><Cpu size={24}/> Nessuna chiamata registrata nel periodo.</div>}
          <p className="own-note">{data.notes.api}</p>
        </section>
        <div className="own-info"><CircleAlert size={22}/><div>
          <strong>Costi provider e fatture</strong>
          <p>Il saldo OpenAI, il traffico Vercel e i GB fatturati da Supabase non si possono dedurre dai soli archivi. Il pannello mostra token effettivi delle chiamate monitorate e dimensioni dichiarate dei documenti; per i costi in euro servirà integrare la fatturazione dei provider.</p>
        </div></div>
      </>}

      {tab==="integrazioni"&&<>
        <div className="own-section-title"><div><small>SERVIZI</small><h2>API e collegamenti</h2></div><span>Nessuna chiave esposta</span></div>
        <div className="own-integrations">{data.integrations.map(x=><article key={x.id} className="own-integration">
          <div className="own-integration-mark"><PlugZap size={22}/></div>
          <div className="own-integration-main"><small>{x.type}</small><strong>{x.name}</strong><p>{x.detail}</p></div>
          <span className={x.configured?"own-status yes":"own-status no"}>
            {x.configured?<CheckCircle2 size={15}/>:<CircleAlert size={15}/>}
            {x.configured?"Configurato":"Da configurare"}</span>
        </article>)}</div>
        <div className="own-columns"><section className="own-panel"><div className="own-panel-head">
          <div><small>CLIENTI</small><h2>Email e banche collegate</h2></div><Mail size={20}/></div>
          <div className="own-twometrics"><div><span>Collegamenti email</span><strong>{num(t.emailConnections)}</strong></div>
            <div><span>Collegamenti bancari</span><strong>{num(t.bankConnections)}</strong></div></div>
        </section><section className="own-panel"><div className="own-panel-head">
          <div><small>SICUREZZA</small><h2>Archivi privati</h2></div><ShieldCheck size={20}/></div>
          <p className="own-note">La console non legge password, token OAuth, IBAN o contenuti dei documenti. Il server e il database verificano l'identità Owner.</p>
        </section></div>
        <p className="own-privacy-note"><LockKeyhole size={16}/> “Configurato” indica solo la presenza delle variabili sul server. Non equivale a un controllo in tempo reale del servizio.</p>
      </>}
    </>}
  </div></main>;
}
