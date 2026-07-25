"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  FileText,
  Loader2,
  Send,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

const DAY = 24 * 60 * 60 * 1000;
const paymentTypes = new Set(["Ricevuta", "Quietanza", "Pagamento"]);

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(value: unknown, months: number) {
  const first = toDate(value);
  if (!first) return null;
  const day = first.getDate();
  const result = new Date(first.getFullYear(), first.getMonth() + months, 1, 12);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateLabel(date: Date | null) {
  return date
    ? date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
    : "data non disponibile";
}

function firstName(user: any) {
  const metadata = user?.user_metadata ?? {};
  const value = metadata.full_name || metadata.name || metadata.given_name;
  if (typeof value === "string" && value.trim()) return value.trim().split(/\s+/)[0];
  const emailPart = String(user?.email ?? "").split("@")[0].split(/[._-]/)[0];
  return emailPart ? emailPart.charAt(0).toUpperCase() + emailPart.slice(1).toLowerCase() : "";
}

function normalizedTitle(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b202\d\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function SmartHomeV2() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [documents, setDocuments] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState("deadlines");
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.location.pathname !== "/") return;
    let mount: HTMLDivElement | null = null;
    let observer: MutationObserver | null = null;

    const install = () => {
      const main = document.querySelector("main");
      const hero = main?.querySelector(":scope > .hero");
      if (!(main instanceof HTMLElement) || !(hero instanceof HTMLElement)) return false;

      mount = document.getElementById("documio-smart-home-root") as HTMLDivElement | null;
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-smart-home-root";
        main.insertBefore(mount, hero);
      }

      document.body.classList.add("smart-home-active");
      Array.from(main.querySelectorAll(":scope > section")).forEach((section) => {
        const text = section.textContent ?? "";
        if (
          (text.includes("Parzialmente pagati") && text.includes("Totale da pagare")) ||
          (text.includes("Partially paid") && text.includes("Total still to pay"))
        ) {
          section.classList.add("legacy-dashboard-hidden");
        }
      });
      setTarget(mount);
      return true;
    };

    if (!install()) {
      observer = new MutationObserver(() => {
        if (install()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      document.body.classList.remove("smart-home-active");
      document.querySelectorAll(".legacy-dashboard-hidden").forEach((element) =>
        element.classList.remove("legacy-dashboard-hidden"),
      );
      mount?.remove();
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;

    const load = async (user: any) => {
      if (!active) return;
      if (!user) {
        setDocuments([]);
        setAttachments([]);
        setLoading(false);
        return;
      }

      setName(firstName(user));
      setLoading(true);
      const [docs, files] = await Promise.all([
        supabase
          .from("documents")
          .select("id,title,file_name,storage_path,category,uploaded_at,expiry_date,payment_status,total_amount,paid_amount,remaining_amount,installment_count,installment_amount,financing_total_amount,first_installment_date,is_financing,paid_installments,appointment_completed_at")
          .eq("user_id", user.id)
          .order("uploaded_at", { ascending: false })
          .limit(1000),
        supabase
          .from("document_attachments")
          .select("id,document_id,attachment_type,amount,payment_date,uploaded_at")
          .eq("user_id", user.id)
          .order("uploaded_at", { ascending: false })
          .limit(2500),
      ]);
      if (!active) return;
      if (docs.error) console.error("Smart Home documents:", docs.error.message);
      if (files.error) console.error("Smart Home attachments:", files.error.message);
      setDocuments(docs.data ?? []);
      setAttachments(files.data ?? []);
      setLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => void load(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const summary = useMemo(() => {
    const today = todayStart();
    const thirtyDays = new Date(today.getTime() + 30 * DAY);
    const sevenDaysAgo = new Date(today.getTime() - 7 * DAY);
    const byDocument = new Map<string, any[]>();
    attachments.forEach((attachment) => {
      const list = byDocument.get(attachment.document_id) ?? [];
      list.push(attachment);
      byDocument.set(attachment.document_id, list);
    });

    const payments: any[] = [];
    const deadlines: any[] = [];
    const recent: any[] = [];
    const advice: any[] = [];
    let dueNowTotal = 0;

    const groups = new Map<string, any[]>();
    documents.forEach((document) => {
      const key = normalizedTitle(document.title);
      if (key.length >= 5) groups.set(key, [...(groups.get(key) ?? []), document]);
    });
    groups.forEach((group) => {
      if (group.length > 1) {
        advice.push({
          id: `duplicate:${group[0].id}`,
          documentId: group[0].id,
          title: group[0].title,
          text: `${group.length} documenti hanno un titolo molto simile: controlla se sono duplicati.`,
        });
      }
    });

    documents.forEach((document) => {
      const linked = byDocument.get(document.id) ?? [];
      const receipts = linked.filter((item) => paymentTypes.has(item.attachment_type));
      const receiptPaid = receipts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const paid = Math.max(Number(document.paid_amount) || 0, receiptPaid);
      const count = Number(document.installment_count) || 0;
      const installment = Number(document.installment_amount) || 0;
      const planTotal = Number(document.financing_total_amount) || 0;
      const declaredTotal = Number(document.total_amount) || 0;
      const total = planTotal || (count && installment ? count * installment : declaredTotal);
      const remaining = total > 0
        ? Math.max(0, total - paid)
        : Math.max(0, Number(document.remaining_amount) || 0);
      const tracked = Boolean(total || remaining || installment || document.is_financing || receipts.length);
      const paidInstallments = Math.max(Number(document.paid_installments) || 0, receipts.length);
      const nextInstallment = count > paidInstallments
        ? addMonths(document.first_installment_date, paidInstallments)
        : null;
      const expiry = document.appointment_completed_at ? null : toDate(document.expiry_date);
      const nextDate = [nextInstallment, expiry]
        .filter(Boolean)
        .sort((a: any, b: any) => a.getTime() - b.getTime())[0] ?? null;
      const paidStatus = document.payment_status === "Pagato" || (total > 0 && remaining <= 0.01);
      const disputed = document.payment_status === "Contestato";

      if (tracked && !paidStatus && !disputed && remaining > 0) {
        const dueNow = installment ? Math.min(installment, remaining) : remaining;
        dueNowTotal += dueNow;
        payments.push({
          id: `pay:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `${money(dueNow)} da pagare${nextDate ? ` · ${dateLabel(nextDate)}` : ""}`,
          date: nextDate,
        });
      }

      if (nextDate && nextDate >= today && nextDate <= thirtyDays && !paidStatus && !disputed) {
        deadlines.push({
          id: `deadline:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `${nextInstallment === nextDate ? "Rata" : "Scadenza"} prevista il ${dateLabel(nextDate)}.`,
          date: nextDate,
        });
      }

      const uploaded = new Date(document.uploaded_at);
      if (!Number.isNaN(uploaded.getTime()) && uploaded >= sevenDaysAgo) {
        recent.push({
          id: `new:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `Aggiunto il ${dateLabel(uploaded)}${document.category ? ` · ${document.category}` : ""}.`,
          date: uploaded,
        });
      }

      if (document.payment_status === "Pagato" && receipts.length === 0) {
        advice.push({
          id: `receipt:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: "Risulta pagato, ma manca una ricevuta o quietanza collegata.",
        });
      }
      if (nextDate && nextDate < today && !paidStatus && !disputed) {
        const days = Math.max(1, Math.ceil((today.getTime() - nextDate.getTime()) / DAY));
        advice.push({
          id: `late:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `La scadenza risulta superata da ${days} giorni.`,
        });
      }
    });

    payments.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
    deadlines.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
    recent.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    return { payments, deadlines, recent, advice, dueNowTotal };
  }, [documents, attachments]);

  const details = activeCard === "payments"
    ? summary.payments
    : activeCard === "deadlines"
      ? summary.deadlines
      : activeCard === "new"
        ? summary.recent
        : summary.advice;

  const openDocument = async (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document?.storage_path) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(document.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const ask = async (question?: string) => {
    const clean = String(question ?? input).trim();
    if (!clean || asking) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);
    setInput("");
    setAsking(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question: clean, language: "it" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Risposta non disponibile.");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer || "Non ho trovato informazioni sufficienti.",
          documentIds: Array.isArray(result.documentIds) ? result.documentIds : [],
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Non riesco a rispondere.");
    } finally {
      setAsking(false);
    }
  };

  if (!target) return null;

  const cards = [
    {
      key: "payments",
      label: "Da pagare",
      value: summary.payments.length,
      caption: summary.payments.length ? `${money(summary.dueNowTotal)} da gestire` : "Nessun pagamento urgente",
      icon: WalletCards,
    },
    {
      key: "deadlines",
      label: "Prossime scadenze",
      value: summary.deadlines.length,
      caption: summary.deadlines[0]?.date ? `La prima è il ${dateLabel(summary.deadlines[0].date)}` : "Nessuna nei prossimi 30 giorni",
      icon: CalendarDays,
    },
    {
      key: "new",
      label: "Nuovi documenti",
      value: summary.recent.length,
      caption: "Caricati negli ultimi 7 giorni",
      icon: FileText,
    },
    {
      key: "advice",
      label: "Consigli AI",
      value: summary.advice.length,
      caption: summary.advice.length ? "Controlli consigliati" : "Nessuna anomalia evidente",
      icon: Sparkles,
    },
  ];

  return createPortal(
    <section className="smart-home">
      <div className="smart-home-welcome">
        <div>
          <span className="smart-home-kicker"><Sparkles size={16} /> La tua giornata amministrativa</span>
          <h1>Buongiorno{name ? ` ${name}` : ""}</h1>
          <p>Qui trovi subito cosa richiede attenzione. L’archivio completo rimane disponibile più sotto.</p>
        </div>
        <div className="smart-home-status"><Bot size={24} /><span><strong>DocuMio è pronto</strong> a controllare documenti, pagamenti e scadenze.</span></div>
      </div>

      <div className="smart-home-cards">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button type="button" key={card.key} className={`smart-home-card ${activeCard === card.key ? "active" : ""}`} onClick={() => setActiveCard(card.key)}>
              <span className="smart-home-card-icon"><Icon size={22} /></span>
              <span className="smart-home-card-label">{card.label}</span>
              <strong>{loading ? "—" : card.value}</strong>
              <small>{loading ? "Sto controllando l’archivio…" : card.caption}</small>
            </button>
          );
        })}
      </div>

      <div className="smart-home-insights">
        <div className="smart-home-insights-heading">
          <div><span>{cards.find((item) => item.key === activeCard)?.label}</span><strong>{details.length ? `${details.length} elementi da vedere` : "Tutto tranquillo"}</strong></div>
          {activeCard === "advice" && details.length > 0 && (
            <button type="button" onClick={() => void ask("Controlla il mio archivio e spiegami cosa devo sistemare questa settimana.")}>Chiedi spiegazione <ArrowRight size={16} /></button>
          )}
        </div>
        {details.length === 0 ? (
          <div className="smart-home-insights-empty">Non risultano elementi urgenti in questa sezione.</div>
        ) : (
          <div className="smart-home-insights-list">
            {details.slice(0, 5).map((item: any) => (
              <button type="button" key={item.id} onClick={() => void openDocument(item.documentId)}>
                <span><strong>{item.title}</strong><small>{item.text}</small></span><ArrowRight size={17} />
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="smart-home-chat">
        <div className="smart-home-chat-heading"><span className="smart-home-chat-icon"><Bot size={25} /></span><div><h2>Che devo fare questa settimana?</h2><p>Scrivi normalmente: DocuMio risponde usando il tuo archivio reale.</p></div></div>
        <div className="smart-home-suggestions">
          {["Che devo fare questa settimana?", "Quanto devo pagare adesso?", "Quali ricevute mancano?", "Cosa scade nei prossimi 30 giorni?"].map((suggestion) => (
            <button type="button" key={suggestion} disabled={asking} onClick={() => void ask(suggestion)}>{suggestion}</button>
          ))}
        </div>
        <div className="smart-home-conversation">
          {messages.length === 0 && <div className="smart-home-welcome-message"><Sparkles size={18} /> Posso cercare nei documenti e negli allegati e prepararti un riepilogo pratico.</div>}
          {messages.map((message) => (
            <div key={message.id} className={`smart-home-message ${message.role}`}>
              <div>{message.text}</div>
              {message.role === "assistant" && (message.documentIds ?? []).map((documentId: string) => {
                const document = documents.find((item) => item.id === documentId);
                return document ? <button type="button" key={documentId} onClick={() => void openDocument(documentId)}><FileText size={15} /> {document.title}</button> : null;
              })}
            </div>
          ))}
          {asking && <div className="smart-home-message assistant loading"><Loader2 size={17} /> Sto controllando il tuo archivio…</div>}
          {error && <div className="smart-home-chat-error">{error}</div>}
        </div>
        <form className="smart-home-chat-form" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Es. Che devo fare questa settimana?" disabled={asking} />
          <button type="submit" disabled={!input.trim() || asking} aria-label="Invia domanda">{asking ? <Loader2 size={20} /> : <Send size={20} />}</button>
        </form>
      </section>
    </section>,
    target,
  );
}
