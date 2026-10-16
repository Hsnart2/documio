"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Banknote, CalendarClock, CheckCircle2,
  CircleAlert, FileUp, FileText, Landmark, Link2, LoaderCircle, Plus, Receipt,
  RefreshCw, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet, Building2, FolderOpen, Check,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  dateIt, dateIso, daysTo, eur, matchScore, paidFor,
  parseBankCsv, parseFatturaPaXml,
  type DeadlineRow, type InvoiceRow, type MatchRow, type MovementRow,
  type InvoiceDirection,
} from "@/lib/financial-control";
import {
  accountingCategories, categoryLabel, grossInvoiceSummary,
  suggestCategory, suggestReconciliations,
} from "@/lib/business-accounting";
import "./control-center.css";
import "./business-center.css";

type BankBalance = {
  accountLabel: string; amount: number; currency: string;
  balanceType: string; referenceDate: string;
};
type Connection = {
  id: string; institution_name: string; consent_status: string;
  last_sync_at: string | null; created_at: string; balances: BankBalance[];
};
type Bank = { id: string; name: string };
type ArchiveDocument = {
  id: string;
  title: string;
  category: string | null;
  total_amount: number | null;
  expiry_date: string | null;
  financial_direction: string | null;
  payment_status: string | null;
  uploaded_at: string | null;
};
type Company = { id:string; legal_name:string; vat_number:string|null; status:"active"|"archived" };
type AccountingRecord = {
  id:string; record_type:string; title:string; category:string;
  amount:number|null; tax_amount:number|null; due_date:string|null;
  reference_period:string|null; review_status:string; document_id:string|null;
  description:string|null;
};
type Section = "overview" | "invoices" | "accounts" | "deadlines" | "accounting";
const blankInvoice = {
  direction: "income" as InvoiceDirection,
  invoice_number: "", counterparty: "", issue_date: "",
  due_date: "", amount: "", notes: "", cost_category: "",
};
const blankDeadline = {
  category: "bollo" as DeadlineRow["category"],
  title: "", due_date: "", amount: "", reference_code: "", notes: "",
};
function money(value: number, currency = "EUR") {
  return currency === "EUR" ? eur(value)
    : `${value.toLocaleString("it-IT",{maximumFractionDigits:2})} ${currency}`;
}
function euroOnly(amount: number, currency: string) {
  return currency === "EUR" ? Number(amount) || 0 : 0;
}
function isoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
async function fingerprint(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
function statusOf(invoice: InvoiceRow, paid: number) {
  const remaining = Math.max(0, Number(invoice.amount) - paid);
  if (remaining <= 0.01) return { text: "Saldato (riconciliato)", kind: "ok" };
  if (invoice.due_date && daysTo(invoice.due_date) < 0)
    return { text: "Scaduta da verificare", kind: "danger" };
  if (paid > 0) return { text: "Parzialmente abbinata", kind: "warn" };
  return { text: "Da riconciliare", kind: "neutral" };
}

export default function FinancialControlCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState<Section>("overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([]);
  const [archivedDocuments, setArchivedDocuments] = useState<ArchiveDocument[]>([]);
  const [linkedDocumentId, setLinkedDocumentId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [bankEnabled, setBankEnabled] = useState(false);
  const [institutions, setInstitutions] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountLabel, setAccountLabel] = useState("Conto principale");
  const [xmlDirection, setXmlDirection] = useState<InvoiceDirection>("expense");
  const [invoiceForm, setInvoiceForm] = useState(blankInvoice);
  const [deadlineForm, setDeadlineForm] = useState(blankDeadline);
  const [selectedTx, setSelectedTx] = useState<Record<string, string>>({});
  const [companies,setCompanies] = useState<Company[]>([]);
  const [companyId,setCompanyId] = useState<string|null>(null);
  const [companyReady,setCompanyReady] = useState(false);
  const loadVersion = useRef(0);
  const [accountingRecords,setAccountingRecords] = useState<AccountingRecord[]>([]);
  const [reviewingContract,setReviewingContract] = useState<string|null>(null);
  const [contractReview,setContractReview] = useState<null|{
    documentTitle:string;summary:string;
    issues:Array<{topic:string;severity:string;passage:string;explanation:string;action:string}>;
    checklist:string[];limitations:string;
  }>(null);
  const [accountForm,setAccountForm] = useState({
    record_type:"f24",title:"",amount:"",tax_amount:"",
    reference_period:"",due_date:"",description:"",category:"da_verificare",
  });

  const loadData = useCallback(async (id: string, scopeId: string | null) => {
    const version = ++loadVersion.current;
    const supabase = getSupabaseClient();
    if (!supabase) { setError("Configurazione archivio non disponibile."); setLoading(false); return; }
    setLoading(true);
    // Filtra sempre nel database per azienda/personale, mai soltanto nell'UI.
    const scope = (query: any) => scopeId
      ? query.eq("company_id", scopeId) : query.is("company_id", null);
    const [a, b, c, d, e, f] = await Promise.all([
      scope(supabase.from("financial_invoices").select("*").eq("user_id", id))
        .order("issue_date", { ascending: false }).limit(2000),
      scope(supabase.from("financial_transactions").select("*").eq("user_id", id))
        .order("booking_date", { ascending: false }).limit(4000),
      scope(supabase.from("financial_matches").select("*").eq("user_id", id)).limit(4000),
      scope(supabase.from("financial_deadlines").select("*").eq("user_id", id))
        .order("due_date", { ascending: true }).limit(1000),
      scope(supabase.from("documents")
        .select("id,title,category,total_amount,expiry_date,financial_direction,payment_status,uploaded_at")
        .eq("user_id", id)).order("uploaded_at", { ascending: false }).limit(500),
      scope(supabase.from("financial_accounting_records").select("*").eq("user_id", id))
        .order("created_at", { ascending: false }).limit(500),
    ]);
    if (version !== loadVersion.current) return;
    const problem = a.error ?? b.error ?? c.error ?? d.error ?? f.error;
    if (problem) {
      setStorageReady(false);
      setError("Il Centro di controllo non è ancora attivo nel database. Non vengono mostrati saldi o pagamenti incompleti.");
    } else {
      setStorageReady(true);
      setError("");
      setInvoices((a.data ?? []) as InvoiceRow[]);
      setMovements((b.data ?? []) as MovementRow[]);
      setMatches((c.data ?? []) as MatchRow[]);
      setDeadlines((d.data ?? []) as DeadlineRow[]);
      setAccountingRecords((f.data ?? []) as AccountingRecord[]);
      // Il nuovo modulo resta utilizzabile anche se un archivio legacy
      // non presenta ancora tutte le colonne avanzate.
      setArchivedDocuments(e.error ? [] : (e.data ?? []) as ArchiveDocument[]);
    }
    setLoading(false);
  }, []);
  const headers = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: null };
    return data?.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` } : null;
  }, []);
  const loadConnections = useCallback(async () => {
    try {
      const auth = await headers();
      if (!auth) return;
      const response = await fetch("/api/finance/banks", { headers: auth, cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setBankEnabled(Boolean(data.enabled));
        setConnections(data.connections ?? []);
      }
    } catch {
      setBankEnabled(false);
    }
  }, [headers]);
  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();
    if (!supabase) { setCheckingLogin(false); return; }
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) { setUserId(data.user?.id ?? null); setCheckingLogin(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) { setUserId(session?.user?.id ?? null); setCheckingLogin(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!userId) {setCompanyReady(false);setCompanies([]);return;}
    let active=true;
    const supabase=getSupabaseClient();
    void (async()=>{
      const {data,error} = await supabase!.from("financial_companies")
        .select("id,legal_name,vat_number,status").eq("user_id",userId)
        .order("legal_name",{ascending:true});
      if(!active)return;
      const list=(data??[]) as Company[];
      setCompanies(list);
      const requested = new URLSearchParams(window.location.search).get("company");
      if(requested && list.some((item)=>item.id===requested))
        setCompanyId(requested);
      else {
        setCompanyId(null);
        if(requested && requested!=="personal")
          setError("Azienda richiesta non disponibile per questo account.");
      }
      setCompanyReady(true);
      if(error)setError("Archivio aziende in fase di attivazione.");
    })();
    return ()=>{active=false;};
  },[userId]);
  useEffect(() => {
    if (!userId || !companyReady) {
      if(!userId)setLoading(false);
      return;
    }
    loadVersion.current++;
    setSelectedTx({});
    setInvoices([]);setMovements([]);setMatches([]);setDeadlines([]);
    setAccountingRecords([]);setArchivedDocuments([]);setContractReview(null);
    void loadData(userId,companyId);
    if (companyId) {
      // Le API PSD2 correnti sono personali: non mostrare i relativi
      // conti/saldi in un contesto aziendale fino alla delega per impresa.
      setConnections([]);setBankEnabled(false);setInstitutions([]);
    } else void loadConnections();
    if (!companyId && window.location.search.includes("bank_return=1")) {
      setMessage("Autorizzazione bancaria ricevuta. Premi Sincronizza per verificare il consenso.");
    }
  }, [userId, companyId, companyReady, loadData, loadConnections]);

  const availableBalances = useMemo(() =>
    (companyId ? [] : connections).flatMap((connection) => connection.balances ?? [])
      .filter((balance) => balance.currency === "EUR" &&
        ["interimAvailable", "closingAvailable"].includes(balance.balanceType)),
    [connections,companyId],
  );
  const availableTotal = availableBalances.reduce((sum,balance) => sum + Number(balance.amount), 0);

  const metrics = useMemo(() => {
    const paid = (invoice: InvoiceRow) => paidFor(invoice.id, matches);
    const receivables = invoices.filter((i) => i.direction === "income" && i.currency === "EUR")
      .reduce((s, i) => s + Math.max(0, Number(i.amount) - paid(i)), 0);
    const payables = invoices.filter((i) => i.direction === "expense" && i.currency === "EUR")
      .reduce((s, i) => s + Math.max(0, Number(i.amount) - paid(i)), 0);
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 30);
    const thirtyDaysAgo = dateLimit.toISOString().slice(0, 10);
    const last30 = movements.filter((m) => m.booking_date >= thirtyDaysAgo &&
      m.booking_date <= isoToday() && m.currency === "EUR");
    const received = last30.reduce((s, t) => s + Math.max(0, Number(t.amount)), 0);
    const spent = last30.reduce((s, t) => s + Math.max(0, -Number(t.amount)), 0);
    return { receivables, payables, received, spent, cashflow: received - spent,
      overdue: invoices.filter((i) => i.due_date && daysTo(i.due_date) < 0 &&
        Number(i.amount) - paid(i) > 0.01).length };
  }, [invoices, matches, movements]);

  const provisional = useMemo(()=>grossInvoiceSummary(invoices),[invoices]);
  const reconciliationSuggestions = useMemo(() =>
    suggestReconciliations(invoices,movements,matches),
    [invoices,movements,matches],
  );
  const currentCompany = companies.find((item)=>item.id===companyId);
  function selectCompany(value:string) {
    if(working)return;
    const selected=value && companies.some((item)=>item.id===value)?value:null;
    const url=new URL(window.location.href);
    if(selected)url.searchParams.set("company",selected);
    else url.searchParams.delete("company");
    window.history.replaceState(null,"",url);
    window.dispatchEvent(new Event("documio:workspace"));
    setError("");setMessage("");setLinkedDocumentId(null);
    setCompanyId(selected);setTab("overview");
  }

  const actionItems = useMemo(() => {
    const invoiceActions = invoices.filter((invoice) => invoice.due_date &&
      Number(invoice.amount) - paidFor(invoice.id,matches) > 0.01 &&
      daysTo(invoice.due_date) <= 14).map((invoice) => ({
        id: "i" + invoice.id,
        title: `${invoice.direction === "income" ? "Incasso atteso" : "Pagamento"} · ${invoice.counterparty}`,
        date: invoice.due_date!, amount: Number(invoice.amount) - paidFor(invoice.id, matches),
        category: "Fattura", overdue: daysTo(invoice.due_date!) < 0,
      }));
    const other = deadlines.filter((deadline) => deadline.status === "open" &&
      daysTo(deadline.due_date) <= 14).map((deadline) => ({
        id: "d" + deadline.id, title: deadline.title, date: deadline.due_date,
        amount: deadline.amount, category: deadline.category, overdue: daysTo(deadline.due_date) < 0,
      }));
    return [...invoiceActions, ...other].sort((a,b) => a.date.localeCompare(b.date)).slice(0, 30);
  }, [invoices, matches, deadlines]);

  const suggestions = useMemo(() => {
    const notices: string[] = [];
    if (metrics.overdue) notices.push(
      `Ci sono ${metrics.overdue} fatture scadute senza incasso o pagamento confermato: verifica i movimenti prima di sollecitare.`,
    );
    if (metrics.receivables > 0) notices.push(
      `Crediti non ancora riconciliati: ${eur(metrics.receivables)}. Priorità: verificare incassi e sollecitare solo dopo controllo.`,
    );
    if (metrics.spent > metrics.received && movements.length) notices.push(
      "Negli ultimi 30 giorni le uscite bancarie superano le entrate. Controlla le spese maggiori e gli incassi previsti.",
    );
    if (metrics.payables > metrics.receivables) notices.push(
      "Le fatture passive ancora aperte superano quelle attive: controlla liquidità, termini e scadenze.",
    );
    if (!movements.length) notices.push(
      "Per capire se le fatture sono state pagate, importa un estratto CSV o collega una banca autorizzata.",
    );
    if (!deadlines.length) notices.push(
      "Aggiungi bolli, multe, imposte, assicurazioni e contratti per attivare la sorveglianza delle scadenze.",
    );
    // Analisi delle spese reali presenti nei conti acquisiti. Non è un
    // calcolo dell'utile o una valutazione professionale dei fornitori.
    const outgoing = movements.filter((t) => t.currency === "EUR" && Number(t.amount) < 0);
    const byMerchant = new Map<string, { name: string; amount: number; count: number }>();
    for (const tx of outgoing) {
      const merchant = (tx.counterparty || "").trim().slice(0, 100);
      if (!merchant) continue;
      const key = merchant.toLocaleLowerCase("it-IT").replace(/[^a-z0-9]/g, "");
      if (!key) continue;
      const current = byMerchant.get(key) ?? { name: merchant, amount: 0, count: 0 };
      current.amount += Math.abs(Number(tx.amount));
      current.count++;
      byMerchant.set(key, current);
    }
    const top = [...byMerchant.values()].sort((a,b)=>b.amount-a.amount)[0];
    if (top && top.amount >= 200 && top.count >= 2) {
      notices.push(
        `Nei movimenti caricati, ${top.name} è tra le principali uscite (${eur(top.amount)} su ${top.count} operazioni). Verifica contratti, condizioni e possibilità di negoziare tariffe.`,
      );
    }
    const rangeEnd = isoToday();
    const today = new Date(rangeEnd + "T00:00:00Z");
    const from = (days: number) => new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
    const currentMonthSpend = outgoing
      .filter((tx) => tx.booking_date >= from(30) && tx.booking_date <= rangeEnd)
      .reduce((total,tx)=>total + Math.abs(Number(tx.amount)),0);
    const previousMonthSpend = outgoing
      .filter((tx) => tx.booking_date >= from(60) && tx.booking_date < from(30))
      .reduce((total,tx)=>total + Math.abs(Number(tx.amount)),0);
    if (previousMonthSpend >= 200 && currentMonthSpend - previousMonthSpend >= 100
      && currentMonthSpend > previousMonthSpend * 1.2) {
      const percent = Math.round((currentMonthSpend / previousMonthSpend - 1) * 100);
      notices.push(
        `Le uscite bancarie registrate degli ultimi 30 giorni sono maggiori del ${percent}% rispetto ai 30 precedenti. Controlla acquisti straordinari e costi ricorrenti prima di tagliare spese.`,
      );
    }
    const overdueReceivables = invoices.filter((invoice) =>
      invoice.direction === "income" && invoice.currency === "EUR" &&
      invoice.due_date && daysTo(invoice.due_date) < 0 &&
      Number(invoice.amount) - paidFor(invoice.id,matches) > 0.01)
      .sort((a,b) => (Number(b.amount)-paidFor(b.id,matches))-
        (Number(a.amount)-paidFor(a.id,matches)));
    if (overdueReceivables.length) {
      const invoice = overdueReceivables[0];
      notices.push(
        `Verifica la fattura ${invoice.invoice_number} verso ${invoice.counterparty}:
        ${eur(Math.max(0,Number(invoice.amount)-paidFor(invoice.id,matches)))} scaduti nei dati inseriti. Se il bonifico non è arrivato, valuta un sollecito.`,
      );
    }
    return notices.slice(0, 8);
  }, [metrics, movements.length, deadlines.length]);

  async function confirmInvoiceCategory(invoice:InvoiceRow,category:string) {
    if(!userId || !accountingCategories.some((item)=>item.value===category))return;
    setWorking(true);setError("");
    const {error:issue}=await getSupabaseClient()!.from("financial_invoices")
      .update({cost_category:category,category_status:"confirmed"})
      .eq("id",invoice.id).eq("user_id",userId);
    setWorking(false);
    if(issue)setError(issue.message);
    else {setMessage("Categoria confermata da te; non equivale a deducibilità fiscale.");
      await loadData(userId,companyId);}
  }

  async function submitAccountingRecord(event:React.FormEvent) {
    event.preventDefault();
    if(!userId || working)return;
    const amount=accountForm.amount.trim()
      ? Number(accountForm.amount.replace(",",".")) : null;
    const taxAmount=accountForm.tax_amount.trim()
      ? Number(accountForm.tax_amount.replace(",",".")) : null;
    if([amount,taxAmount].some((v)=>v!==null && (!Number.isFinite(v)||v<0))) {
      setError("Controlla importi e tributi.");return;
    }
    if(accountForm.title.trim().length<2){setError("Inserisci una descrizione.");return;}
    setWorking(true);setError("");setMessage("");
    const {error:issue}=await getSupabaseClient()!.from("financial_accounting_records").insert({
      user_id:userId,company_id:companyId,
      record_type:accountForm.record_type,
      title:accountForm.title.trim(),category:accountForm.category,
      amount,tax_amount:taxAmount,
      reference_period:accountForm.reference_period.trim()||null,
      due_date:accountForm.due_date||null,
      description:accountForm.description.trim()||null,
      review_status:"needs_review",
    });
    setWorking(false);
    if(issue)setError("Registrazione non riuscita: "+issue.message);
    else {
      setAccountForm({record_type:"f24",title:"",amount:"",tax_amount:"",
        reference_period:"",due_date:"",description:"",category:"da_verificare"});
      setMessage("Registrazione provvisoria inserita: controlla documento e correttezza fiscale.");
      await loadData(userId,companyId);
    }
  }

  async function confirmAccountingRecord(record:AccountingRecord) {
    if(!userId||!window.confirm("Hai controllato l'importo e il documento originale?"))return;
    setWorking(true);setError("");
    const {error:issue}=await getSupabaseClient()!.from("financial_accounting_records")
      .update({review_status:"confirmed"})
      .eq("user_id",userId).eq("id",record.id);
    setWorking(false);
    if(issue)setError(issue.message);
    else {setMessage("Registrazione marcata come verificata manualmente.");
      await loadData(userId,companyId);}
  }

  async function reviewContractFile(record:AccountingRecord) {
    if(!record.document_id || reviewingContract)return;
    if(!window.confirm(
      "DocuMio invierà questo contratto al servizio AI per individuarne clausole e possibili criticità. Il risultato non è un parere legale. Procedere?"
    ))return;
    const auth=await headers();
    if(!auth){setError("Sessione non valida.");return;}
    setReviewingContract(record.document_id);setError("");setContractReview(null);
    try{
      const response=await fetch("/api/contracts/review",{
        method:"POST",
        headers:{...auth,"Content-Type":"application/json"},
        body:JSON.stringify({documentId:record.document_id,consentToAi:true}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Analisi non disponibile.");
      setContractReview(result.review);
      if(result.persisted===false)setMessage("Analisi visibile, ma il salvataggio è da ripetere.");
      else setMessage("Analisi contrattuale recuperata. Verifica ogni passaggio nell'originale.");
    }catch(problem){setError(problem instanceof Error?problem.message:"Contratto non analizzato.");}
    finally{setReviewingContract(null);}
  }
  async function openAccountingOriginal(record:AccountingRecord) {
    if(!record.document_id || !userId)return;
    const supabase=getSupabaseClient()!;
    const {data,error}=await supabase.from("documents").select("storage_path")
      .eq("id",record.document_id).eq("user_id",userId).maybeSingle();
    if(error||!data?.storage_path){setError("Documento originale non trovato.");return;}
    const {data:signed,error:signedError}=await supabase.storage.from("documents")
      .createSignedUrl(data.storage_path,120);
    if(signedError||!signed?.signedUrl){setError("Impossibile aprire l'originale.");return;}
    window.open(signed.signedUrl,"_blank","noopener,noreferrer");
  }

  async function submitInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) return;
    const amount = Number(invoiceForm.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) { setError("Importo fattura non valido."); return; }
    setWorking(true); setError(""); setMessage("");
    const supabase = getSupabaseClient()!;
    const { error: issue } = await supabase.from("financial_invoices").insert({
      user_id: userId, company_id: companyId, source: "manual",
      direction: invoiceForm.direction,
      invoice_number: invoiceForm.invoice_number.trim(),
      counterparty: invoiceForm.counterparty.trim(), issue_date: invoiceForm.issue_date,
      due_date: invoiceForm.due_date || null, amount, currency: "EUR",
      notes: invoiceForm.notes.trim() || null,
      document_id: linkedDocumentId,
      cost_category: invoiceForm.cost_category ||
        suggestCategory(invoiceForm.direction,`${invoiceForm.counterparty} ${invoiceForm.notes}`).category,
      category_status: invoiceForm.cost_category ? "confirmed" : "needs_review",
    });
    setWorking(false);
    if (issue) setError("Non è stato possibile registrare la fattura: " + issue.message);
    else { setInvoiceForm(blankInvoice); setLinkedDocumentId(null);
      setMessage("Fattura registrata; pagamento da verificare.");
      await loadData(userId,companyId); }
  }
  async function submitDeadline(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) return;
    const amount = deadlineForm.amount.trim()
      ? Number(deadlineForm.amount.replace(",", ".")) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setError("Importo scadenza non valido."); return;
    }
    setWorking(true); setError(""); setMessage("");
    const { error: issue } = await getSupabaseClient()!.from("financial_deadlines").insert({
      user_id: userId, company_id: companyId,
      source: "manual", category: deadlineForm.category,
      title: deadlineForm.title.trim(), due_date: deadlineForm.due_date,
      amount, reference_code: deadlineForm.reference_code.trim() || null,
      notes: deadlineForm.notes.trim() || null,
    });
    setWorking(false);
    if (issue) setError(issue.message);
    else { setDeadlineForm(blankDeadline); setMessage("Scadenza aggiunta.");
      await loadData(userId,companyId); }
  }
  async function importXml(file: File | undefined) {
    if (!file || !userId) return;
    if (file.size > 5_000_000 || file.size <= 0) {
      setError("Seleziona un XML FatturaPA valido fino a 5 MB.");return;
    }
    setWorking(true);setError("");setMessage("");
    let uploadedPath:string|null=null;
    let archivedId:string|null=null;
    const supabase=getSupabaseClient()!;
    try {
      if (companyId && !currentCompany?.vat_number)
        throw new Error("Prima di importare XML in questa azienda, inserisci la sua partita IVA nella sezione Aziende.");
      const xml=await file.text();
      const rows=parseFatturaPaXml(xml,xmlDirection,
        companyId ? currentCompany?.vat_number : null);
      const payload=await Promise.all(rows.map(async(row)=>({
        ...row,user_id:userId,company_id:companyId,
        cost_category:suggestCategory(row.direction,`${row.counterparty} ${row.notes||""}`).category,
        category_status:"needs_review",
        import_key:await fingerprint([
          "xml",companyId??"personal",row.direction,row.invoice_number,row.issue_date,
          row.counterparty.toLowerCase(),row.amount.toFixed(2),row.currency,
        ].join("|")),
      })));
      const keys=payload.map((item)=>item.import_key);
      const {data:existing,error:existingError}=await supabase.from("financial_invoices")
        .select("import_key").eq("user_id",userId).in("import_key",keys);
      if(existingError)throw existingError;
      const seen=new Set((existing??[]).map((item)=>item.import_key));
      const newRows=payload.filter((item)=>!seen.has(item.import_key));
      if(!newRows.length){
        setMessage("Fattura già presente in questo archivio: nessuna duplicazione.");
        await loadData(userId,companyId);
        return;
      }
      // Il file originale rimane nell'archivio privato con la fattura.
      const name=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-110)||"fattura.xml";
      const storagePath=`${userId}/fatture/${crypto.randomUUID()}-${name}`;
      const {error:storeError}=await supabase.storage.from("documents")
        .upload(storagePath,file,{contentType:"application/xml",upsert:false,cacheControl:"3600"});
      if(storeError)throw new Error("Non posso archiviare l'XML originale: "+storeError.message);
      uploadedPath=storagePath;
      const first=newRows[0];
      const {data:archived,error:archiveError}=await supabase.from("documents").insert({
        user_id:userId,company_id:companyId,
        title:`Fattura ${first.invoice_number} · ${first.counterparty}`.slice(0,180),
        category:"Lavoro",file_name:file.name,
        uploaded_at:new Date().toISOString(),
        summary:"Fattura XML FatturaPA importata; dati e categoria da verificare.",
        keywords:["fattura","XML",first.direction==="income"?"vendita":"acquisto"],
        size:file.size,storage_path:storagePath,
        financial_direction:first.direction,total_amount:first.amount,
        expiry_date:first.due_date,ai_status:"completed",
        financial_document_type:"invoice_xml",accounting_review_status:"needs_review",
        payment_status:"Da pagare",
      }).select("id").single();
      if(archiveError||!archived?.id)throw new Error("Archivio documento non riuscito: "+(archiveError?.message??""));
      archivedId=archived.id;
      // Per XML con più corpi il documento si collega alla prima fattura;
      // le altre sono registrate senza duplicare il riferimento al medesimo file.
      const inserts=newRows.map((item,index)=>({
        ...item,document_id:index===0?archived.id:null,
      }));
      const {error:issue}=await supabase.from("financial_invoices")
        .upsert(inserts,{onConflict:"user_id,import_key",ignoreDuplicates:true});
      if(issue)throw issue;
      uploadedPath=null;archivedId=null;
      setMessage(`Importate ${newRows.length} fatture XML in ${currentCompany?.legal_name||"personale"}:
        file originale archiviato, dati e IVA da verificare. Nessun pagamento marcato automaticamente.`);
      await loadData(userId,companyId);
    } catch(problem) {
      // Ripristina l'archivio solo se la scrittura della fattura non è riuscita.
      if(archivedId)await supabase.from("documents").delete().eq("id",archivedId).eq("user_id",userId);
      if(uploadedPath)await supabase.storage.from("documents").remove([uploadedPath]);
      setError(problem instanceof Error?problem.message:"Importazione XML non riuscita.");
    } finally {setWorking(false);}
  }

  async function importCsv(file: File | undefined) {
    if (!file || !userId) return;
    if (file.size > 5_000_000) { setError("CSV troppo grande (massimo 5 MB)."); return; }
    setWorking(true); setError(""); setMessage("");
    try {
      const parsed = parseBankCsv(await file.text());
      if (!parsed.rows.length) throw new Error("Nessun movimento valido trovato.");
      const occurrences = new Map<string, number>();
      const payload = await Promise.all(parsed.rows.map(async (row) => {
        const raw = [companyId ?? "personal",accountLabel.trim(),
          row.booking_date,row.amount.toFixed(2),
          row.currency,row.description,row.counterparty].join("|");
        const repeat = (occurrences.get(raw) ?? 0) + 1;
        occurrences.set(raw, repeat);
        return {
          ...row, user_id: userId, company_id: companyId, source: "csv",
          suggested_category: suggestCategory(Number(row.amount)>0?"income":"expense",
            `${row.counterparty} ${row.description}`).category,
          category_status: "needs_review",
          account_label: accountLabel.trim().slice(0, 80) || "Conto CSV",
          import_key: "csv:" + await fingerprint(raw + "|" + repeat),
        };
      }));
      const supabase = getSupabaseClient()!;
      for (let i = 0; i < payload.length; i += 100) {
        const { error: issue } = await supabase.from("financial_transactions")
          .upsert(payload.slice(i, i + 100),
            { onConflict: "user_id,import_key", ignoreDuplicates: true });
        if (issue) throw issue;
      }
      setMessage(`Analizzati ${payload.length} movimenti (righe non valide: ${parsed.rejected}). I duplicati già importati non sono reinseriti.`);
      await loadData(userId,companyId);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Errore di importazione."); }
    setWorking(false);
  }
  async function confirmMatch(invoice: InvoiceRow) {
    if (!userId) return;
    const used = new Set(matches.map((item) => item.transaction_id));
    const bank = movements.find((m) => m.id === selectedTx[invoice.id]);
    if (!bank || used.has(bank.id)) { setError("Seleziona un movimento ancora libero."); return; }
    const remaining = Math.max(0, Number(invoice.amount) - paidFor(invoice.id, matches));
    const allocation = Math.min(remaining, Math.abs(Number(bank.amount)));
    if (!allocation) return;
    const confirmed = window.confirm(
      `Confermi l'abbinamento di ${money(allocation,invoice.currency)} a ${invoice.counterparty}? Non viene disposto alcun pagamento.`,
    );
    if (!confirmed) return;
    setWorking(true); setError("");
    const { error: issue } = await getSupabaseClient()!.from("financial_matches").insert({
      user_id: userId, company_id: companyId, invoice_id: invoice.id,
      transaction_id: bank.id, allocated_amount: allocation,
    });
    setWorking(false);
    if (issue) setError(issue.message);
    else { setMessage("Pagamento collegato alla fattura e confermato da te.");
      setSelectedTx((state) => ({ ...state, [invoice.id]: "" })); await loadData(userId,companyId); }
  }
  async function markDeadline(deadline: DeadlineRow) {
    if (!userId || !window.confirm("Confermi che questa scadenza è stata gestita?")) return;
    const { error: issue } = await getSupabaseClient()!.from("financial_deadlines")
      .update({ status: "settled" }).eq("id",deadline.id).eq("user_id",userId);
    if (issue) setError(issue.message);
    else { setMessage("Scadenza confermata manualmente."); await loadData(userId,companyId); }
  }
  async function bankApi(action: string, connectionId?: string, institutionId?: string) {
    if (companyId) throw new Error("Connessioni bancarie aziendali non ancora abilitate: utilizza l'importazione CSV.");
    const auth = await headers();
    if (!auth) throw new Error("Devi effettuare nuovamente l'accesso.");
    const response = await fetch("/api/finance/banks", {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ action, connectionId, institutionId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Operazione bancaria non riuscita.");
    return result;
  }
  async function loadBanks() {
    setWorking(true); setError("");
    try {
      const auth = await headers();
      if (!auth) throw new Error("Accesso richiesto.");
      const response = await fetch("/api/finance/banks?view=institutions", { headers: auth });
      const data = await response.json();
      if (!response.ok || !data.enabled) throw new Error(data.error || "Integrazione bancaria non configurata.");
      setInstitutions(data.institutions ?? []);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Elenco banche non disponibile."); }
    setWorking(false);
  }
  async function connect() {
    if (!selectedBank) return;
    setWorking(true); setError("");
    try {
      const result = await bankApi("connect", undefined, selectedBank);
      if (typeof result.url !== "string" || !result.url.startsWith("https://ob.gocardless.com/"))
        throw new Error("Link bancario inatteso.");
      window.location.assign(result.url);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Banca non collegata."); setWorking(false); }
  }
  async function syncBank(id: string) {
    if (!userId) return;
    setWorking(true); setError("");
    try {
      const result = await bankApi("sync",id);
      setMessage(result.message ?? `Sincronizzazione completata: ${result.imported ?? 0} nuovi movimenti. ${result.warnings?.join(" ") ?? ""}`);
      await Promise.all([loadConnections(),loadData(userId,companyId)]);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Sincronizzazione non riuscita."); }
    setWorking(false);
  }
  async function disconnect(id: string) {
    if (!userId || !window.confirm(
      "Disconnettere la banca? Saranno eliminati i movimenti importati tramite questa connessione e i relativi abbinamenti. I CSV resteranno."
    )) return;
    setWorking(true); setError("");
    try {
      await bankApi("disconnect",id);
      setMessage("Consenso revocato tramite provider e dati collegati rimossi.");
      await Promise.all([loadConnections(),loadData(userId,companyId)]);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Revoca non riuscita."); }
    setWorking(false);
  }

  if (checkingLogin) return <main id="dm-main-content" className="fc-page"><p>Verifico la sessione…</p></main>;
  if (!userId) return (
    <main id="dm-main-content" className="fc-page"><div className="fc-login">
      <h1>Centro di controllo DocuMio</h1>
      <p>Questa area contiene dati economici privati. Accedi al tuo account.</p>
      <a className="fc-button" href="/">Torna all'accesso <ArrowRight size={16}/></a>
    </div></main>
  );

  const unmatched = movements.filter((m) => !matches.some((link) => link.transaction_id === m.id));
  return <main id="dm-main-content" className="fc-page">
    <header className="fc-header">
      <a href="/" className="fc-back"><ArrowLeft size={18}/> Archivio DocuMio</a>
      <span className="fc-secure"><ShieldCheck size={17}/> Accesso riservato</span>
    </header>

    <section className="fc-workspace-switch" aria-label="Scegli archivio">
      <div className="fc-workspace-caption">
        <span className="fc-workspace-symbol">{companyId?<Building2 size={23}/>:<FolderOpen size={23}/>}</span>
        <div>
          <small>AMBITO DI LAVORO</small>
          <strong>{currentCompany?.legal_name||"Personale e famiglia"}</strong>
          <p>Fatture, movimenti, costi e scadenze vengono separati per archivio.</p>
        </div>
      </div>
      <div className="fc-workspace-tools">
        <label htmlFor="fc-workspace-select">Cambia archivio</label>
        <select id="fc-workspace-select" value={companyId??""} disabled={!companyReady || working}
          onChange={(event)=>selectCompany(event.target.value)}>
          <option value="">Personale</option>
          {companies.map((company)=>
            <option key={company.id} value={company.id}>{company.legal_name}</option>)}
        </select>
        <a href="/aziende" className="fc-company-add"><Plus size={17}/> Crea azienda / gestisci</a>
      </div>
    </section>
    <section className="fc-hero">
      <div>
        <span className="fc-overline"><Sparkles size={16}/> DocuMio · Centro di controllo</span>
        <h1>I tuoi documenti diventano azioni.</h1>
        <p>Fatture, incassi, movimenti e scadenze in un unico posto. Gli abbinamenti suggeriti richiedono sempre la tua conferma.</p>
      </div>
      <div className="fc-hero-icon"><Wallet size={38}/></div>
    </section>

    <nav className="fc-tabs" aria-label="Sezioni finanziarie">
      {([
        ["overview","Panoramica",Sparkles],["invoices","Fatture",Receipt],
        ["accounts","Banche e movimenti",Landmark],["deadlines","Scadenze",CalendarClock],
        ["accounting","Contabilità e documenti",Building2],
      ] as const).map(([key,label,Icon]) =>
        <button key={key} className={tab === key ? "active" : ""} type="button"
          onClick={() => {setTab(key);setError("");setMessage("");}}>
          <Icon size={17}/>{label}
        </button>)}
    </nav>
    {error && <div className="fc-alert error" role="alert"><CircleAlert size={18}/>{error}</div>}
    {message && <div className="fc-alert success" role="status"><CheckCircle2 size={18}/>{message}</div>}
    {loading && <div className="fc-loading"><LoaderCircle size={20} className="fc-spin"/> Caricamento dati reali…</div>}
    {!loading && storageReady === false && <section className="fc-panel">
      <h2><ShieldCheck size={21}/> Attivazione del Centro di controllo</h2>
      <p className="fc-muted">
        La nuova interfaccia è pronta, ma il database non è ancora stato migrato.
        Per evitare informazioni fuorvianti, fatture e saldi non vengono mostrati
        finché le tabelle finanziarie non rispondono correttamente.
      </p>
      <p className="fc-disclaimer">
        Il gestore deve applicare la migrazione
        <strong> 20261015_financial_control_center.sql </strong>
        in Supabase e verificare i permessi di accesso.
        Nessuna tua operazione o documento esistente è stato modificato.
      </p>
      <a className="fc-button secondary" href="/">Torna all'archivio <ArrowRight size={16}/></a>
    </section>}

    {storageReady === true && tab === "overview" && <>
      <section className="fc-metrics">
        <article><span><Landmark size={17}/> Disponibilità bancaria</span>
          <strong>{availableBalances.length ? eur(availableTotal) : "—"}</strong>
          <small>{availableBalances.length
            ? `Saldi disponibili EUR di ${availableBalances.length} conti· dati PSD2`
            : "Non disponibile o banca da collegare"} · ultima sincronizzazione</small>
        </article>
        <article><span><TrendingUp size={17}/> Crediti da incassare</span><strong>{eur(metrics.receivables)}</strong><small>Fatture non riconciliate · EUR</small></article>
        <article><span><TrendingDown size={17}/> Debiti verso fornitori</span><strong>{eur(metrics.payables)}</strong><small>Fatture non riconciliate · EUR</small></article>
        <article><span><Banknote size={17}/> Entrate ultimi 30 giorni</span><strong>{eur(metrics.received)}</strong><small>Dai movimenti bancari acquisiti</small></article>
        <article><span><Wallet size={17}/> Flusso netto 30 giorni</span>
          <strong>{eur(metrics.cashflow)}</strong><small>Entrate meno uscite ({eur(metrics.spent)} di uscite)</small></article>
      </section>
      <div className="fc-two-col">
        <section className="fc-panel">
          <h2><CalendarClock size={21}/> Richiede attenzione</h2>
          <p className="fc-muted">Fatture e altre scadenze entro 14 giorni, incluse quelle già trascorse.</p>
          {actionItems.length ? <div className="fc-list">{actionItems.slice(0,8).map((item) =>
            <div className="fc-list-item" key={item.id}>
              <div><strong>{item.title}</strong><small>{item.category} · {dateIt(item.date)}</small></div>
              <div className="fc-item-right">{item.amount !== null && <strong>{eur(item.amount)}</strong>}
                <small className={item.overdue ? "fc-danger" : ""}>{item.overdue ? "Scaduta" : "In arrivo"}</small></div>
            </div>)}</div> : <div className="fc-empty">Non risultano scadenze nei dati inseriti.</div>}
        </section>
        <section className="fc-panel">
          <h2><Sparkles size={21}/> Opportunità e controlli</h2>
          <p className="fc-muted">Regole basate sui dati registrati: nessun suggerimento è una decisione automatica.</p>
          <div className="fc-advice">{suggestions.map((note,i) =>
            <p key={i}><BadgeCheck size={17}/>{note}</p>)}</div>
        </section>
      </div>
      <section className="fc-panel fc-balance-preview">
        <h2><Building2 size={21}/> Conto economico preliminare · fatture importate</h2>
        <p className="fc-muted">Riepilogo lordo basato solo sulle fatture caricate per {currentCompany?.legal_name||"l'archivio personale"}.
          Non è il bilancio ufficiale e non calcola l'utile fiscale.</p>
        <div className="fc-balance-metrics">
          <div><span>Fatture attive lorde</span><strong>{eur(provisional.income)}</strong></div>
          <div><span>Fatture passive lorde</span><strong>{eur(provisional.expense)}</strong></div>
          <div><span>Differenza grezza (non utile)</span><strong>{eur(provisional.provisionalDifference)}</strong></div>
        </div>
        <h3>Ripartizione provvisoria dei costi</h3>
        {!provisional.categorized.length
          ? <p className="fc-muted">Carica fatture e conferma le categorie per vedere la ripartizione.</p>
          : <div className="fc-category-summary">{provisional.categorized.slice(0,12).map(([code,amount])=>
            <div key={code}><span>{categoryLabel(code)}</span><strong>{eur(amount)}</strong></div>)}</div>}
        <div className="fc-disclaimer">Le registrazioni F24, stipendi e CONAI sono separate dai totali fatture per evitare doppie contabilizzazioni. IVA indetraibile, ammortamenti, rimanenze, ratei, risconti e competenze non sono calcolati automaticamente.</div>
      </section>
      <div className="fc-disclaimer">Questi importi rappresentano fatture e flussi bancari, non l'utile contabile né le imposte dovute. Le fonti potrebbero essere incomplete.</div>
    </>}

    {storageReady === true && tab === "invoices" && <>
      <div className="fc-two-col">
        <section className="fc-panel">
          <h2><Plus size={21}/> Registra una fattura</h2>
          {linkedDocumentId && <div className="fc-source-banner">
            <CheckCircle2 size={16}/>
            <span>Stai collegando la fattura a un documento del tuo archivio. Verifica numero, controparte e importo prima di salvare.</span>
            <button type="button" onClick={()=>setLinkedDocumentId(null)}>Scollega</button>
          </div>}
          <form onSubmit={(event)=>void submitInvoice(event)} className="fc-form">
            <label>Tipo<select value={invoiceForm.direction} onChange={(e)=>setInvoiceForm({...invoiceForm,direction:e.target.value as InvoiceDirection})}>
              <option value="income">Emessa · da incassare</option><option value="expense">Ricevuta · da pagare</option>
            </select></label>
            <div className="fc-fields">
              <label>Numero<input required maxLength={70} value={invoiceForm.invoice_number}
                onChange={(e)=>setInvoiceForm({...invoiceForm,invoice_number:e.target.value})} placeholder="Es. 24/2026"/></label>
              <label>Importo €<input required inputMode="decimal" value={invoiceForm.amount}
                onChange={(e)=>setInvoiceForm({...invoiceForm,amount:e.target.value})} placeholder="1500,00"/></label>
            </div>
            <label>Cliente o fornitore<input required maxLength={220} value={invoiceForm.counterparty}
              onChange={(e)=>setInvoiceForm({...invoiceForm,counterparty:e.target.value})} placeholder="Ragione sociale"/></label>
            <div className="fc-fields">
              <label>Data emissione<input required type="date" value={invoiceForm.issue_date}
                onChange={(e)=>setInvoiceForm({...invoiceForm,issue_date:e.target.value})}/></label>
              <label>Scadenza pagamento<input type="date" value={invoiceForm.due_date}
                onChange={(e)=>setInvoiceForm({...invoiceForm,due_date:e.target.value})}/></label>
            </div>
            <label>Categoria contabile
              <select value={invoiceForm.cost_category}
                onChange={(e)=>setInvoiceForm({...invoiceForm,cost_category:e.target.value})}>
                <option value="">Suggeriscila automaticamente (da verificare)</option>
                {accountingCategories.map((category)=><option key={category.value}
                  value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label>Note<input maxLength={500} value={invoiceForm.notes}
              onChange={(e)=>setInvoiceForm({...invoiceForm,notes:e.target.value})}/></label>
            <button className="fc-button" disabled={working} type="submit"><Plus size={17}/> Registra</button>
          </form>
        </section>
        <section className="fc-panel">
          <h2><FileUp size={21}/> Importa fatture elettroniche</h2>
          <p className="fc-muted">Legge i dati dalle fatture XML FatturaPA. Non accede al portale AdE senza deleghe e accordi con un intermediario abilitato.</p>
          <label className="fc-form">Il file è
            <select value={xmlDirection} onChange={(e)=>setXmlDirection(e.target.value as InvoiceDirection)}>
              <option value="expense">Una fattura ricevuta</option>
              <option value="income">Una fattura emessa</option>
            </select>
          </label>
          <label className="fc-file"><FileUp size={22}/> Seleziona file XML FatturaPA
            <input type="file" accept=".xml,text/xml,application/xml" disabled={working}
              onChange={(e)=>{void importXml(e.target.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          <small className="fc-muted">Importa numero, controparte, importo, IVA esposta, data e scadenza quando presenti.
            Il file XML originale viene conservato nell'archivio selezionato; l'imputazione contabile resta da confermare.</small>
        </section>
      </div>
      <section className="fc-panel">
        <h2><FileUp size={21}/> Fatture già presenti nell'archivio</h2>
        <p className="fc-muted">
          DocuMio individua documenti con importi e descrizioni compatibili con fatture.
          Selezionane uno per preparare la scheda; controlla tutti i campi prima del collegamento.
          Non vengono create nuove fatture automaticamente.
        </p>
        {(() => {
          const linked = new Set(invoices.map((item) => item.document_id).filter(Boolean));
          const candidates = archivedDocuments.filter((doc) =>
            !linked.has(doc.id) && Number(doc.total_amount) > 0 &&
            !["Pagato", "Contestato"].includes(doc.payment_status ?? "") &&
            (doc.financial_direction === "income" || doc.financial_direction === "expense") &&
            /fattur|invoice|nota di credito/i.test(doc.title),
          ).slice(0, 12);
          return candidates.length
            ? <div className="fc-list">{candidates.map((doc) =>
                <div key={doc.id} className="fc-list-item">
                  <div>
                    <strong>{doc.title}</strong>
                    <small>{doc.category || "Documento"} · {money(Number(doc.total_amount))}
                      {doc.expiry_date ? ` · Scad. ${dateIt(doc.expiry_date)}` : ""}
                    </small>
                  </div>
                  <button type="button" className="fc-inline-button" onClick={()=>{
                    setInvoiceForm({
                      ...blankInvoice,
                      direction: doc.financial_direction === "income" ? "income" : "expense",
                      counterparty: doc.title, amount: String(doc.total_amount ?? ""),
                      due_date: doc.expiry_date ?? "",
                      notes: "Precompilata da documento nell'archivio DocuMio. Verificare i dati.",
                    });
                    setLinkedDocumentId(doc.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}>Usa dati <ArrowRight size={15}/></button>
                </div>)}</div>
            : <div className="fc-empty">Nessuna fattura non collegata trovata nell'archivio attuale.</div>;
        })()}
      </section>
      <section className="fc-panel">
        <h2><Receipt size={21}/> Fatture e stato degli incassi/pagamenti</h2>
        {!invoices.length ? <div className="fc-empty">Nessuna fattura registrata.</div> :
          <div className="fc-invoice-list">{invoices.map((invoice) => {
            const paid = paidFor(invoice.id,matches);
            const status = statusOf(invoice,paid);
            const rem = Math.max(0,Number(invoice.amount)-paid);
            const options = unmatched.filter((transaction) =>
              transaction.currency === invoice.currency &&
              (invoice.direction === "income" ? transaction.amount > 0 : transaction.amount < 0))
              .sort((a,b)=>matchScore(invoice,b)-matchScore(invoice,a)).slice(0,100);
            const suggested = options.length > 0 && matchScore(invoice,options[0]) >= 80;
            return <article key={invoice.id} className="fc-invoice">
              <div className="fc-invoice-top">
                <div><strong>{invoice.counterparty}</strong><small>
                  {invoice.direction === "income" ? "Emessa" : "Ricevuta"} ·
                  {" "}{invoice.invoice_number} · {dateIt(invoice.issue_date)}
                  {invoice.document_id ? " · Documento DocuMio collegato" : ""}
                  {" · "}{categoryLabel(invoice.cost_category)}
                  {invoice.due_date ? ` · Scad. ${dateIt(invoice.due_date)}` : ""}
                </small></div>
                <span className={`fc-status ${status.kind}`}>{status.text}</span>
              </div>
              <div className="fc-invoice-money">
                <span>Totale <b>{money(Number(invoice.amount),invoice.currency)}</b></span>
                <span>Riconciliato <b>{money(paid,invoice.currency)}</b></span>
                <span>Residuo <b>{money(rem,invoice.currency)}</b></span>
                {invoice.vat_amount!=null && <span>IVA esposta in XML
                  <b>{money(Number(invoice.vat_amount),invoice.currency)}</b></span>}
              </div>
              <div className="fc-invoice-category">
                <label>Imputazione contabile
                  <select value={invoice.cost_category||"da_verificare"} disabled={working}
                    onChange={(event)=>void confirmInvoiceCategory(invoice,event.target.value)}>
                    {accountingCategories.map((c)=><option value={c.value} key={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <small>{invoice.category_status==="confirmed" ? "Categoria confermata" :
                  "Categoria proposta: verifica la descrizione e scegli quella corretta."}</small>
              </div>
              {rem > 0.01 && <div className="fc-match">
                <label>Abbina un movimento bancario (solo dopo controllo)
                  <select value={selectedTx[invoice.id] ?? ""} onChange={(e)=>
                    setSelectedTx((s)=>({...s,[invoice.id]:e.target.value}))}>
                    <option value="">Seleziona movimento…</option>
                    {options.map((m) => <option key={m.id} value={m.id}>
                      {matchScore(invoice,m) >= 80 ? "★ " : ""}{dateIt(m.booking_date)}
                      {" · "}{money(Math.abs(m.amount),m.currency)} · {m.counterparty || m.description.slice(0,42)}
                    </option>)}
                  </select>
                </label>
                <button type="button" disabled={working || !selectedTx[invoice.id]}
                  onClick={()=>void confirmMatch(invoice)}><Link2 size={16}/> Conferma abbinamento</button>
                {(() => {
                  const proposed = reconciliationSuggestions.find((item)=>item.invoiceId===invoice.id);
                  if (!proposed)return suggested ? <small>★ Controlla causale e importo prima di confermare.</small> : null;
                  return <div className="fc-match-suggestion">
                    <strong><Sparkles size={15}/> Movimento suggerito · {proposed.score}%</strong>
                    <small>{proposed.reasons.join(" · ")}{proposed.requiresReview
                      ? " · Possibile ambiguità: verifica prima di confermare." : ""}</small>
                    <button type="button" disabled={working}
                      onClick={()=>setSelectedTx((curr)=>({...curr,[invoice.id]:proposed.transactionId}))}>
                      <Check size={15}/> Seleziona suggerimento (non conferma)
                    </button>
                  </div>;
                })()}
              </div>}
            </article>;
          })}</div>}
      </section>
    </>}

    {storageReady === true && tab === "accounts" && <>
      <div className="fc-two-col">
        <section className="fc-panel">
          <h2><Landmark size={21}/> Collega banca in sola lettura</h2>
          {companyId && <div className="fc-disclaimer">
            Per questa azienda l'accesso PSD2 non è ancora associato a una delega aziendale.
            I saldi del tuo conto personale rimangono nascosti. Importa il CSV dell'azienda
            qui a destra e verifica i movimenti proposti.
          </div>}
          <p className="fc-muted">Il consenso è gestito dalla banca tramite provider Open Banking regolamentato. DocuMio non chiede password bancarie e non può inviare bonifici.</p>
          {connections.length ? <div className="fc-list">{connections.map((connection) =>
            <div className="fc-bank" key={connection.id}>
              <div><strong>{connection.institution_name}</strong>
                <small>Stato: {connection.consent_status} · Ultimo controllo: {connection.last_sync_at
                  ? new Date(connection.last_sync_at).toLocaleDateString("it-IT") : "mai"}</small>
                {(connection.balances ?? []).map((balance,index) =>
                  <small key={index} className="fc-bank-balance">
                    {balance.accountLabel}: <strong>{money(balance.amount,balance.currency)}</strong>
                    {" · "}{balance.balanceType === "interimAvailable" || balance.balanceType === "closingAvailable"
                      ? "disponibile" : "contabile"}
                    {" · Rif. "}{dateIt(balance.referenceDate.slice(0,10))}
                  </small>)}
              </div>
              <div className="fc-bank-buttons">
                <button disabled={working} onClick={()=>void syncBank(connection.id)}><RefreshCw size={15}/> Sincronizza</button>
                <button disabled={working} onClick={()=>void disconnect(connection.id)}>Scollega</button>
              </div>
            </div>)}</div> : <div className="fc-empty">Nessuna banca collegata.</div>}
          {bankEnabled ? <>
            {institutions.length === 0 && <button disabled={working} className="fc-button secondary"
              onClick={()=>void loadBanks()}><Landmark size={16}/> Scegli una banca italiana</button>}
            {!!institutions.length && <div className="fc-form">
              <label>Seleziona banca
                <select value={selectedBank} onChange={(e)=>setSelectedBank(e.target.value)}>
                  <option value="">Scegli istituto…</option>
                  {institutions.map((bank)=><option key={bank.id} value={bank.id}>{bank.name}</option>)}
                </select>
              </label>
              <button type="button" className="fc-button" disabled={!selectedBank || working}
                onClick={()=>void connect()}><ShieldCheck size={16}/> Autorizza presso la banca</button>
            </div>}
          </> : <div className="fc-disclaimer">Collegamento live da attivare: servono credenziali del provider Open Banking e le verifiche contrattuali necessarie. Nel frattempo puoi importare i movimenti CSV.</div>}
        </section>
        <section className="fc-panel">
          <h2><FileUp size={21}/> Importa estratto conto CSV</h2>
          <p className="fc-muted">Alternativa immediata alle API. Supporta colonne Data, Importo, Descrizione oppure Dare/Avere. Non importa il saldo come movimento.</p>
          <div className="fc-form">
            <label>Identifica il conto<input maxLength={80} value={accountLabel}
              onChange={(e)=>setAccountLabel(e.target.value)}/></label>
            <label className="fc-file"><FileUp size={22}/> Carica CSV banca
              <input type="file" accept=".csv,text/csv,text/plain" disabled={working}
                onChange={(e)=>{void importCsv(e.target.files?.[0]);e.currentTarget.value="";}}/>
            </label>
          </div>
          <small className="fc-muted">Gli importi e la data vengono convalidati; movimenti ambigui sono scartati. Controlla il riepilogo dopo l'importazione.</small>
        </section>
      </div>
      <section className="fc-panel">
        <h2><Wallet size={21}/> Movimenti registrati</h2>
        {!movements.length ? <div className="fc-empty">Non risultano movimenti importati.</div> :
          <div className="fc-list">{movements.slice(0,150).map((movement) =>
            <div className="fc-list-item" key={movement.id}>
              <div><strong>{movement.counterparty || movement.description || "Movimento bancario"}</strong>
                <small>{dateIt(movement.booking_date)} · {movement.account_label || movement.source}
                  {matches.some((match)=>match.transaction_id === movement.id) ? " · Riconciliato" : " · Da verificare"}</small></div>
              <strong className={movement.amount < 0 ? "fc-danger" : "fc-income"}>{money(movement.amount,movement.currency)}</strong>
            </div>)}</div>}
      </section>
    </>}

    {storageReady === true && tab === "deadlines" && <>
      <div className="fc-two-col">
        <section className="fc-panel">
          <h2><CalendarClock size={21}/> Aggiungi una scadenza</h2>
          <form onSubmit={(event)=>void submitDeadline(event)} className="fc-form">
            <label>Categoria<select value={deadlineForm.category} onChange={(e)=>
              setDeadlineForm({...deadlineForm,category:e.target.value as DeadlineRow["category"]})}>
              <option value="bollo">Bollo veicolo</option><option value="multa">Multe</option>
              <option value="imposta">Imposte e tributi</option><option value="assicurazione">Assicurazioni</option>
              <option value="contratto">Contratti / rinnovi</option><option value="fattura">Altri pagamenti</option>
              <option value="altro">Altro</option>
            </select></label>
            <label>Descrizione<input required maxLength={220} placeholder="Es. Bollo auto / targa..."
              value={deadlineForm.title} onChange={(e)=>setDeadlineForm({...deadlineForm,title:e.target.value})}/></label>
            <div className="fc-fields">
              <label>Data<input type="date" required value={deadlineForm.due_date}
                onChange={(e)=>setDeadlineForm({...deadlineForm,due_date:e.target.value})}/></label>
              <label>Importo € (facoltativo)<input inputMode="decimal" value={deadlineForm.amount}
                onChange={(e)=>setDeadlineForm({...deadlineForm,amount:e.target.value})}/></label>
            </div>
            <label>Riferimento (targa, IUV, pratica…)<input maxLength={120}
              value={deadlineForm.reference_code}
              onChange={(e)=>setDeadlineForm({...deadlineForm,reference_code:e.target.value})}/></label>
            <label>Note<input maxLength={500} value={deadlineForm.notes}
              onChange={(e)=>setDeadlineForm({...deadlineForm,notes:e.target.value})}/></label>
            <button className="fc-button" type="submit" disabled={working}><Plus size={17}/> Aggiungi</button>
          </form>
        </section>
        <section className="fc-panel">
          <h2><ShieldCheck size={21}/> Verifica presso fonti ufficiali</h2>
          <p className="fc-muted">DocuMio registra e ricorda le date inserite; non dichiara verificato un debito prima di ottenere dati attendibili dalla fonte.</p>
          <a className="fc-official" href="https://aci.gov.it/servizi/bollo-auto/" target="_blank" rel="noopener noreferrer">
            <span><strong>ACI · Bollo auto</strong><small>Scadenza, pagamenti e servizi regionali con accesso SPID/CIE</small></span><ArrowRight size={17}/>
          </a>
          <a className="fc-official" href="https://bollo.aci.it/" target="_blank" rel="noopener noreferrer">
            <span><strong>ACI · Paga / verifica bollo</strong><small>Servizio ufficiale, disponibilità secondo Regione</small></span><ArrowRight size={17}/>
          </a>
          <a className="fc-official" href="https://www.pagopa.gov.it/" target="_blank" rel="noopener noreferrer">
            <span><strong>PagoPA e notifiche</strong><small>Verifica avvisi e multe presso l'ente emittente, app IO o SEND</small></span><ArrowRight size={17}/>
          </a>
          <div className="fc-disclaimer">Controllare tutte le multe dalla sola targa non è attualmente un servizio pubblico universale disponibile a DocuMio.</div>
        </section>
      </div>
      <section className="fc-panel"><h2><CalendarClock size={21}/> Scadenze registrate</h2>
        {!deadlines.length ? <div className="fc-empty">Non hai ancora registrato scadenze.</div> :
          <div className="fc-list">{deadlines.map((deadline) =>
            <div key={deadline.id} className="fc-list-item">
              <div><strong>{deadline.title}</strong><small>{deadline.category} · {dateIt(deadline.due_date)}
                {deadline.reference_code ? ` · ${deadline.reference_code}` : ""}
                {" · "}{deadline.status === "settled" ? "Gestita manualmente" : deadline.status === "cancelled" ? "Annullata" : daysTo(deadline.due_date) < 0 ? "Scaduta" : "In attesa"}
              </small></div>
              <div className="fc-item-right">
                {deadline.amount !== null && <strong>{eur(Number(deadline.amount))}</strong>}
                {deadline.status === "open" && <button type="button" onClick={()=>void markDeadline(deadline)}
                  disabled={working}><CheckCircle2 size={15}/> Segna gestita</button>}
              </div>
            </div>)}</div>}
      </section>
    </>}
    {storageReady === true && tab === "accounting" && <>
      <div className="fc-two-col">
        <section className="fc-panel">
          <h2><Building2 size={21}/> F24, stipendi, CONAI e contratti</h2>
          <p className="fc-muted">Registra gli estremi dei documenti e indica l'importo solo se certo.
            È un registro di controllo, non una scrittura di partita doppia automatica.
            Per i file usa il caricamento dell'archivio selezionato.</p>
          <a className="fc-button secondary" href={companyId
            ? `/carica?company=${encodeURIComponent(companyId)}` : "/carica"}>
            <FileUp size={17}/> Carica documenti in questo archivio
          </a>
          <form className="fc-form fc-accounting-form" onSubmit={(event)=>void submitAccountingRecord(event)}>
            <label>Tipo documento
              <select value={accountForm.record_type} onChange={(event)=>
                setAccountForm({...accountForm,record_type:event.target.value})}>
                <option value="f24">F24 / versamento tributi</option>
                <option value="payroll">Busta paga / stipendi</option>
                <option value="conai">CONAI / contributi ambientali</option>
                <option value="bank_statement">Estratto conto</option>
                <option value="contract">Contratto</option>
                <option value="other">Altro documento</option>
              </select>
            </label>
            <label>Descrizione<input required maxLength={220} value={accountForm.title}
              placeholder="Es. F24 settembre, cedolini ottobre, contratto fornitore..."
              onChange={(event)=>setAccountForm({...accountForm,title:event.target.value})}/></label>
            <div className="fc-fields">
              <label>Importo (€), se certo<input inputMode="decimal" value={accountForm.amount}
                onChange={(event)=>setAccountForm({...accountForm,amount:event.target.value})}/></label>
              <label>Periodo di riferimento<input value={accountForm.reference_period} maxLength={60}
                placeholder="Es. 10/2026"
                onChange={(event)=>setAccountForm({...accountForm,reference_period:event.target.value})}/></label>
            </div>
            <div className="fc-fields">
              <label>Quota tributi indicata (€), se presente<input inputMode="decimal" value={accountForm.tax_amount}
                onChange={(event)=>setAccountForm({...accountForm,tax_amount:event.target.value})}/></label>
              <label>Scadenza da verificare<input type="date" value={accountForm.due_date}
                onChange={(event)=>setAccountForm({...accountForm,due_date:event.target.value})}/></label>
            </div>
            <label>Categoria proposta
              <select value={accountForm.category} onChange={(event)=>
                setAccountForm({...accountForm,category:event.target.value})}>
                {accountingCategories.map((item)=>
                  <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>Note<input maxLength={500} value={accountForm.description}
              onChange={(event)=>setAccountForm({...accountForm,description:event.target.value})}/></label>
            <button className="fc-button" type="submit" disabled={working}>
              <Plus size={17}/> Registra per verifica
            </button>
          </form>
        </section>
        <section className="fc-panel">
          <h2><FileText size={21}/> Registro documenti amministrativi</h2>
          <p className="fc-muted">Non vengono sommati direttamente alle fatture per evitare duplicazioni.
            Conserva buste paga e contratti nel tuo archivio privato; gli estremi e gli importi richiedono conferma.</p>
          {!accountingRecords.length
            ? <div className="fc-empty">Nessuna registrazione inserita in questo archivio.</div>
            : <div className="fc-list">{accountingRecords.map((record)=>
              <div className="fc-list-item" key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <small>{record.record_type.toUpperCase()} · {categoryLabel(record.category)}
                    {record.reference_period ? " · "+record.reference_period : ""}
                    {record.due_date ? " · scad. "+dateIt(record.due_date):""}
                  </small>
                  <small>{record.review_status==="confirmed" ? "Confermato manualmente" :
                    "Da verificare con il documento originale"}</small>
                </div>
                <div className="fc-item-right">
                  {record.amount!=null && <strong>{eur(Number(record.amount))}</strong>}
                  {record.document_id && <button type="button" disabled={working}
                    onClick={()=>void openAccountingOriginal(record)}><FileText size={15}/> Originale</button>}
                  {record.record_type==="contract" && record.document_id && (
                    <button type="button" disabled={Boolean(reviewingContract)}
                      onClick={()=>void reviewContractFile(record)}>
                      {reviewingContract===record.document_id?<LoaderCircle size={15}/>:<Sparkles size={15}/>}
                      {reviewingContract===record.document_id?"Analizzo…":"Esamina clausole"}
                    </button>)}
                  {record.review_status!=="confirmed" && <button type="button"
                    disabled={working} onClick={()=>void confirmAccountingRecord(record)}>
                    <Check size={16}/> Conferma
                  </button>}
                </div>
              </div>)}</div>}
        </section>
      </div>
      {contractReview && <section className="fc-panel fc-contract-review" role="region"
        aria-label="Analisi AI del contratto">
        <h2><Sparkles size={21}/> Contratto · {contractReview.documentTitle}</h2>
        <p className="fc-muted">{contractReview.summary}</p>
        <h3>Clausole e punti da verificare</h3>
        {contractReview.issues.length
          ? <div className="fc-contract-issues">{contractReview.issues.map((item,index)=>
            <article key={index}>
              <span className={item.severity==="important"?"warn":"neutral"}>
                {item.severity==="important"?"Priorità di controllo":"Da verificare"}</span>
              <strong>{item.topic}</strong>
              <blockquote>{item.passage||"Passaggio non individuato"}</blockquote>
              <p>{item.explanation}</p>
              <small>Controllo suggerito: {item.action}</small>
            </article>)}</div>
          : <div className="fc-empty">Nessuna clausola segnalata dall'AI: non significa che il contratto sia privo di rischi.</div>}
        <h3>Verifiche da fare</h3>
        <ul className="fc-contract-checklist">
          {contractReview.checklist.map((item,index)=><li key={index}>{item}</li>)}
        </ul>
        <div className="fc-disclaimer">{contractReview.limitations}</div>
      </section>}
      <div className="fc-disclaimer">Non vengono elaborate o trasmesse dichiarazioni fiscali,
        modelli F24, cedolini o bilanci ufficiali. DocuMio segnala ciò che manca,
        organizza la documentazione e prepara dati controllabili dal professionista.</div>
    </>}

    <footer className="fc-footer">
      <span>DocuMio · Dati privati protetti dal tuo account</span>
      <span>L'AI supporta l'analisi: atti, adempimenti e decisioni rilevanti richiedono verifica professionale.</span>
    </footer>
  </main>;
}
