"use client";

import { useMemo, useState } from "react";
import { Building2,Check,FileSearch,RefreshCw,Truck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceRow } from "@/lib/financial-control";
import {
  accountingCategories,categoryLabel,findSupplierRule,
  normalizeVat,supplierNameKey,type SupplierRule,
} from "@/lib/business-accounting";

export type RegisteredSupplier=SupplierRule & {
  user_id:string;company_id:string;note:string|null;
};
type SupplierGroup={
  key:string;name:string;vat:string|null;count:number;
  supplier:RegisteredSupplier|null;unresolved:number;
};
type Props={
  supabase:SupabaseClient|null;
  userId:string;
  companyId:string|null;
  invoices:InvoiceRow[];
  suppliers:RegisteredSupplier[];
  onUpdated:()=>Promise<void>;
};

const supplierCategories=accountingCategories.filter(x=>
  x.group==="cost"||x.group==="review"||x.group==="tax");

export default function SupplierManager({supabase,userId,companyId,invoices,suppliers,onUpdated}:Props) {
  const [categories,setCategories]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [force,setForce]=useState(false);
  const [add,setAdd]=useState(false);
  const [newName,setNewName]=useState("");
  const [newVat,setNewVat]=useState("");
  const [newCategory,setNewCategory]=useState("da_verificare");

  const groups=useMemo(()=>{
    const groups=new Map<string,SupplierGroup>();
    for(const invoice of invoices) {
      if(invoice.direction!=="expense")continue;
      const supplier=findSupplierRule(suppliers,invoice.counterparty,invoice.vat_number);
      const vat=normalizeVat(invoice.vat_number);
      const key=supplier ? "supplier:"+supplier.id :
        vat ? "vat:"+vat : "name:"+supplierNameKey(invoice.counterparty);
      if(!key||key==="name:")continue;
      const previous=groups.get(key);
      if(previous){
        previous.count++;
        if(invoice.category_status!=="confirmed")previous.unresolved++;
      } else groups.set(key,{
        key,name:supplier?.legal_name||invoice.counterparty,
        vat:vat||null,count:1,supplier:supplier??null,
        unresolved:invoice.category_status==="confirmed"?0:1,
      });
    }
    for(const supplier of suppliers){
      const key="supplier:"+supplier.id;
      if(!groups.has(key))groups.set(key,{
        key,name:supplier.legal_name,vat:supplier.vat_number,
        count:0,unresolved:0,supplier,
      });
    }
    return [...groups.values()].sort((a,b)=>b.unresolved-a.unresolved||
      b.count-a.count||a.name.localeCompare(b.name,"it"));
  },[invoices,suppliers]);

  async function saveRule(group:SupplierGroup,category:string) {
    if(!supabase||!companyId||saving)return;
    if(!supplierCategories.some(x=>x.value===category) || category==="da_verificare") {
      setError("Seleziona la categoria del fornitore.");return;
    }
    if(force&&!window.confirm(
      "Vuoi aggiornare ANCHE fatture già classificate o corrette manualmente per questo fornitore?"))
      return;
    setError("");setSuccess("");setSaving(group.key);
    try{
      let id=group.supplier?.id;
      if(id) {
        const {error:issue}=await supabase.from("financial_suppliers")
          .update({default_category:category,updated_at:new Date().toISOString()})
          .eq("id",id).eq("user_id",userId).eq("company_id",companyId);
        if(issue)throw issue;
      } else {
        const {data,error:issue}=await supabase.from("financial_suppliers").insert({
          user_id:userId,company_id:companyId,
          legal_name:group.name.trim(),vat_number:group.vat||null,
          default_category:category,
        }).select("id").single();
        if(issue||!data?.id)throw issue??new Error("Fornitore non registrato.");
        id=data.id;
      }
      const {data:changed,error:rpcError}=await supabase.rpc("documio_apply_supplier_category",{
        p_supplier_id:id,p_include_manual:force,
      });
      if(rpcError)throw rpcError;
      setSuccess(`Fornitore ${group.name}: categoria ${categoryLabel(category)} salvata.
        Aggiornate ${Number(changed??0)} fatture ricevute. Le nuove fatture useranno questa regola.`);
      setForce(false);setAdd(false);setNewName("");setNewVat("");
      await onUpdated();
    }catch(err){setError(err instanceof Error?err.message:"Aggiornamento fornitore non riuscito.");}
    finally{setSaving(null);}
  }

  if(!companyId)return <section className="fc-panel">
    <h2><Building2 size={20}/> Fornitori per azienda</h2>
    <p className="fc-muted">Seleziona un'azienda dal menu in alto per associare fornitori e categorie senza mescolare gli archivi.</p>
  </section>;

  return <section className="fc-panel fc-supplier-manager" aria-label="Gestione fornitori">
    <header className="fc-supplier-head">
      <div>
        <h2><Building2 size={21}/> Rubrica fornitori</h2>
        <p className="fc-muted">
          DocuMio riconosce i fornitori dalle fatture ricevute. Indica una sola volta il tipo di costo
          e aggiorna le loro fatture passate e future. Le descrizioni esplicite
          (ad esempio leasing anziché cartone) hanno la precedenza.
        </p>
      </div>
      <button type="button" className="fc-inline-button" onClick={()=>setAdd(x=>!x)}>
        {add?"Chiudi":"Aggiungi fornitore"}
      </button>
    </header>
    {error&&<p className="fc-alert error" role="alert">{error}</p>}
    {success&&<p className="fc-alert success" role="status">{success}</p>}
    {add&&<form className="fc-supplier-add" onSubmit={(e)=>{
      e.preventDefault();
      if(newName.trim().length<2){setError("Inserisci il nome del fornitore.");return;}
      const group:SupplierGroup={
        key:"new:"+newName,name:newName.trim(),vat:normalizeVat(newVat)||null,
        supplier:null,count:0,unresolved:0,
      };
      void saveRule(group,newCategory);
    }}>
      <label>Fornitore<input value={newName} maxLength={220} required
        placeholder="Es. Cartiera, corriere, società di leasing…"
        onChange={e=>setNewName(e.target.value)}/></label>
      <label>Partita IVA<input value={newVat} maxLength={22} placeholder="Se disponibile"
        onChange={e=>setNewVat(e.target.value)}/></label>
      <label>Categoria
        <select value={newCategory} onChange={e=>setNewCategory(e.target.value)}>
          {supplierCategories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <button className="fc-button" type="submit" disabled={Boolean(saving)||newCategory==="da_verificare"}>
        <Check size={16}/> Salva e applica
      </button>
    </form>}
    <label className="fc-supplier-force">
      <input type="checkbox" checked={force} onChange={(event)=>setForce(event.target.checked)}/>
      <span>Riclassifica anche le fatture già corrette manualmente
        <small>Normalmente DocuMio preserva le correzioni manuali e le descrizioni specifiche.</small>
      </span>
    </label>
    {!groups.length ? <div className="fc-empty">
      Non ci sono ancora fornitori. Importa fatture di acquisto XML oppure aggiungine uno.
    </div>:
      <div className="fc-supplier-list">{groups.map(group=>{
        const draft=categories[group.key]??group.supplier?.default_category??"da_verificare";
        return <article key={group.key} className="fc-supplier-row">
          <span className="fc-supplier-avatar"><Truck size={19}/></span>
          <div className="fc-supplier-info">
            <strong>{group.name}</strong>
            <small>{group.vat?"P.IVA "+group.vat+" · ":""}
              {group.count} fatture ricevute{group.unresolved? " · "+group.unresolved+" da verificare":""}</small>
            {group.supplier?.default_category!=="da_verificare"&&group.supplier&&
              <small className="fc-supplier-saved"><Check size={13}/> Regola memorizzata: {categoryLabel(group.supplier.default_category)}</small>}
          </div>
          <div className="fc-supplier-choice">
            <label>Imputazione
              <select aria-label={`Categoria per ${group.name}`} value={draft}
                onChange={(e)=>setCategories(old=>({...old,[group.key]:e.target.value}))}
                disabled={Boolean(saving)}>
                {supplierCategories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <button type="button" disabled={Boolean(saving)||draft==="da_verificare"}
              className="fc-inline-button" onClick={()=>void saveRule(group,draft)}>
              {saving===group.key?<RefreshCw size={15}/>:<Check size={15}/>}
              Applica a questo fornitore
            </button>
          </div>
        </article>;
      })}</div>}
    <div className="fc-disclaimer"><FileSearch size={15}/>
      Le categorie classificano le fatture, ma non costituiscono da sole un bilancio,
      un costo fiscalmente deducibile o una contabilizzazione in partita doppia.
      Quando una fattura contiene voci miste, controllane la ripartizione.
    </div>
  </section>;
}
