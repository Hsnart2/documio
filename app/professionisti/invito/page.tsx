"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MailCheck, ShieldCheck, AlertTriangle } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import "../professionisti.css";

const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer))
  .map((x)=>x.toString(16).padStart(2,"0")).join("");

export default function AcceptStudioInvitation() {
  const [token,setToken]=useState("");
  const [email,setEmail]=useState<string|null>(null);
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState(false);

  useEffect(()=>{
    const secret=new URLSearchParams(window.location.hash.replace(/^#/,"")).get("token")??"";
    if(/^[a-f0-9]{64}$/i.test(secret))setToken(secret);
    else setError("Invito mancante o non valido.");
    // Il token non va inviato al server o ad altri siti come parte dell'URL.
    window.history.replaceState(null,"",window.location.pathname+window.location.search);
    const supabase=getSupabaseClient();
    if(!supabase){setReady(true);setError("Archivio non configurato.");return;}
    let alive=true;
    void supabase.auth.getUser().then(({data})=>{
      if(alive){setEmail(data.user?.email??null);setReady(true);}
    });
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(alive)setEmail(session?.user?.email??null);
    });
    return ()=>{alive=false;listener.subscription.unsubscribe();};
  },[]);

  async function accept() {
    if(!token||!email)return;
    const supabase=getSupabaseClient();if(!supabase)return;
    setLoading(true);setError("");
    try{
      const tokenHash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
      const {data,error:issue}=await supabase.rpc("documio_accept_professional_invite",{
        p_token_hash:tokenHash,
      });
      if(issue||!data)throw new Error(
        "Invito non accettato. Verifica che l'email dell'account corrisponda a quella invitata, che sia confermata e che il link non sia scaduto."
      );
      setDone(true);setToken("");
    }catch(problem){setError(problem instanceof Error?problem.message:"Invito non disponibile.");}
    finally{setLoading(false);}
  }

  return <main id="dm-main-content" className="prf-page">
    <header className="prf-header">
      <div className="prf-eyebrow"><ShieldCheck size={15}/> DOCUMIO PROFESSIONAL</div>
      <h1>Invito a uno studio</h1>
      <p>L'accesso è consentito soltanto all'account con indirizzo email verificato a cui è stato destinato l'invito.</p>
    </header>
    <section className="prf-panel">
      {done?<><h2><MailCheck size={21}/> Accesso autorizzato</h2>
        <p>Il tuo account è stato collegato allo studio con il ruolo indicato dall'invito.</p>
        <a className="prf-primary" href="/professionisti">Apri lo studio <ArrowRight size={17}/></a>
      </>:
      <>
        <h2><MailCheck size={21}/> Verifica identità</h2>
        {error&&<div className="prf-alert" role="alert"><AlertTriangle size={17}/>{error}</div>}
        {!ready?<p>Verifica della sessione…</p>:
          !email?<><p>Accedi con l'email invitata, poi riapri il link ricevuto.</p>
            <a href="/" className="prf-primary">Accedi a DocuMio <ArrowRight size={17}/></a>
          </>:<>
            <p>Stai utilizzando l'account <strong>{email}</strong>. Controlla che sia quello invitato.</p>
            <p className="prf-muted">L'accettazione non condivide automaticamente l'archivio documentale personale del titolare. Potrai vedere solo le schede dello studio autorizzate dal tuo ruolo.</p>
            <button className="prf-primary" disabled={loading||!token}
              type="button" onClick={()=>void accept()}>
              <ShieldCheck size={17}/>{loading?"Verifica in corso…":"Accetta invito"}
            </button>
          </>}
      </>}
      <p style={{marginTop:22}}><a href="/professionisti"><ArrowLeft size={14} style={{verticalAlign:"middle"}}/> Torna agli studi</a></p>
    </section>
  </main>;
}
