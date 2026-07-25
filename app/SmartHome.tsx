"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CircleAlert,
  FileText,
  Loader2,
  ReceiptText,
  Send,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import "./smart-home.css";

type DocumentRow = {
  id: string;
  title: string;
  file_name: string | null;
  storage_path: string | null;
  category: string | null;
  uploaded_at: string;
  expiry_date: string | null;
  payment_status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  financing_total_amount: number | null;
  first_installment_date: string | null;
  is_financing: boolean | null;
  paid_installments: number | null;
  appointment_completed_at: string | null;
};

type AttachmentRow = {
  id: string;
  document_id: string;
  attachment_type: string | null;
  amount: number | null;
  payment_date: string | null;
  uploaded_at: string;
};

type HomeMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  documentIds?: string[];
};

type HomeDetail = {
  id: string;
  documentId: string;
  title: string;
  text: string;
  date?: Date | null;
};

type HomeCardKey = "payments" | "deadlines" | "new" | "advice";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_ATTACHMENT_TYPES = new Set(["Ricevuta", "Quietanza", "Pagamento"]);

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonthsPreservingDay(value: string | null, months: number) {
  const first = parseDate(value);
  if (!first) return null;
  const originalDay = first.getDate();
  const target = new Date(first.getFullYear(), first.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return target;
}

function euro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function shortDate(value: Date | null | undefined) {
  if (!value) return "Data non disponibile";
  return value.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: value.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function displayNameFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const storedName = [metadata.full_name, metadata.name, metadata.given_name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (storedName) return storedName.trim().split(/\s+/)[0];

  const emailName = user.email?.split("@")[0]?.split(/[._-]/)[0]?.trim();
  if (!emailName) return "";
  return emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(202[0-9]|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function SmartHome() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [userName, setUserName] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<HomeCardKey>("deadlines");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [messages, setMessages] = useState<HomeMessage[]>([]);

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
      const legacySections = Array.from(main.querySelectorAll(":scope > section"));
      for (const section of legacySections) {
        const text = section.textContent ?? "";
        const isLegacyDashboard =
          (text.includes("Parzialmente pagati") && text.includes("Totale da pagare")) ||
          (text.includes("Partially paid") && text.includes("Total still to pay"));
        if (isLegacyDashboard) section.classList.add("legacy-dashboard-hidden");
      }

      setPortalTarget(mount);
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
      setDataLoading(false);
      return;
    }

    let active = true;

    async function loadData(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null) {
      if (!active) return;
      if (!user) {
        setDocuments([]);
        setAttachments([]);
        setUserName("");
        setDataLoading(false);
        return;
      }

      setUserName(displayNameFromUser(user));
      setDataLoading(true);

      const [documentResult, attachmentResult] = await Promise.all([
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
      if (documentResult.error) console.error("Smart Home documents:", documentResult.error.message);
      if (attachmentResult.error) console.error("Smart Home attachments:", attachmentResult.error.message);

      setDocuments((documentResult.data ?? []) as DocumentRow[]);
      setAttachments((attachmentResult.data ?? []) as AttachmentRow[]);
      setDataLoading(false);
    }

    void supabase.auth.getSession().then(({ data }) => void loadData(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadData(session?.user ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const homeData = useMemo(() => {
    const today = startOfToday();
    const thirtyDays = new Date(today.getTime() + 30 * DAY_MS);
    const sevenDaysAgo = new Date(today.getTime() - 7 * DAY_MS);
    const attachmentsByDocument = new Map<string, AttachmentRow[]>();

    for (const attachment of attachments) {
      const list = attachmentsByDocument.get(attachment.document_id) ?? [];
      list.push(attachment);
      attachmentsByDocument.set(attachment.document_id, list);
    }

    const paymentDetails: HomeDetail[] = [];
    const deadlineDetails: HomeDetail[] = [];
    const newDocumentDetails: HomeDetail[] = [];
    const adviceDetails: HomeDetail[] = [];
    let outstandingNow = 0;

    const titleGroups = new Map<string, DocumentRow[]>();
    for (const document of documents) {
      const normalized = normalizeTitle(document.title);
      if (normalized.length >= 5) {
        titleGroups.set(normalized, [...(titleGroups.get(normalized) ?? []), document]);
      }
    }

    for (const group of titleGroups.values()) {
      if (group.length < 2) continue;
      const ordered = [...group].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
      adviceDetails.push({
        id: `duplicate:${ordered.map((item) => item.id).join(":")}`,
        documentId: ordered[0].id,
        title: ordered[0].title,
        text: `${ordered.length} documenti hanno un titolo molto simile: conviene controllare se sono duplicati.`,
      });
    }

    for (const document of documents) {
      const documentAttachments = attachmentsByDocument.get(document.id) ?? [];
      const paymentAttachments = documentAttachments.filter((item) =>
        PAYMENT_ATTACHMENT_TYPES.has(item.attachment_type ?? ""),
      );
      const attachmentPaid = paymentAttachments.reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0,
      );
      const storedPaid = Math.max(0, Number(document.paid_amount) || 0);
      const paid = Math.max(storedPaid, attachmentPaid);
      const installmentCount = Math.max(0, Number(document.installment_count) || 0);
      const installmentAmount = Math.max(0, Number(document.installment_amount) || 0);
      const financingTotal = Math.max(0, Number(document.financing_total_amount) || 0);
      const declaredTotal = Math.max(0, Number(document.total_amount) || 0);
      const total = financingTotal || (installmentCount && installmentAmount ? installmentCount * installmentAmount : declaredTotal);
      const storedRemaining = Number(document.remaining_amount);
      const remaining = total > 0
        ? Math.max(0, total - paid)
        : Number.isFinite(storedRemaining) && storedRemaining > 0
          ? storedRemaining
          : 0;
      const hasPaymentTracking = Boolean(
        total > 0 ||
        remaining > 0 ||
        installmentAmount > 0 ||
        document.is_financing ||
        paymentAttachments.length,
      );
      const isPaid = document.payment_status === "Pagato" || (total > 0 && remaining <= 0.01);
      const isDisputed = document.payment_status === "Contestato";
      const paidInstallments = Math.max(
        Number(document.paid_installments) || 0,
        paymentAttachments.filter((item) => (Number(item.amount) || 0) > 0).length,
      );
      const nextInstallment =
        installmentCount > paidInstallments
          ? addMonthsPreservingDay(document.first_installment_date, paidInstallments)
          : null;
      const expiry = document.appointment_completed_at ? null : parseDate(document.expiry_date);
      const nextDue = [nextInstallment, expiry]
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

      if (hasPaymentTracking && !isPaid && !isDisputed && remaining > 0) {
        const dueNow = installmentAmount > 0 ? Math.min(installmentAmount, remaining) : remaining;
        outstandingNow += dueNow;
        paymentDetails.push({
          id: `payment:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `${euro(dueNow)} da pagare${nextDue ? ` · prossima data ${shortDate(nextDue)}` : ""}`,
          date: nextDue,
        });
      }

      if (nextDue && nextDue >= today && nextDue <= thirtyDays && !isPaid && !isDisputed) {
        deadlineDetails.push({
          id: `deadline:${document.id}:${nextDue.toISOString()}`,
          documentId: document.id,
          title: document.title,
          text: `${nextInstallment && nextDue.getTime() === nextInstallment.getTime() ? "Rata" : "Scadenza"} prevista il ${shortDate(nextDue)}.`,
          date: nextDue,
        });
      }

      const uploadedAt = new Date(document.uploaded_at);
      if (!Number.isNaN(uploadedAt.getTime()) && uploadedAt >= sevenDaysAgo) {
        newDocumentDetails.push({
          id: `new:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `Aggiunto ${shortDate(uploadedAt)}${document.category ? ` · ${document.category}` : ""}.`,
          date: uploadedAt,
        });
      }

      if (document.payment_status === "Pagato" && paymentAttachments.length === 0) {
        adviceDetails.push({
          id: `receipt:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: "Risulta pagato, ma non trovo una ricevuta o quietanza collegata.",
        });
      }

      if (nextDue && nextDue < today && !isPaid && !isDisputed) {
        const overdueDays = Math.max(1, Math.ceil((today.getTime() - nextDue.getTime()) / DAY_MS));
        adviceDetails.push({
          id: `overdue:${document.id}`,
          documentId: document.id,
          title: document.title,
          text: `La scadenza risulta superata da ${overdueDays} giorni: controlla pagamento e documento.`,
          date: nextDue,
        });
      }
    }

    paymentDetails.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
    deadlineDetails.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
    newDocumentDetails.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

    return {
      outstandingNow,
      paymentDetails,
      deadlineDetails,
      newDocumentDetails,
      adviceDetails,
    };
  }, [documents, attachments]);

  const selectedDetails = {
    payments: homeData.paymentDetails,
    deadlines: homeData.deadlineDetails,
    new: homeData.newDocumentDetails,
    advice: homeData.adviceDetails,
  }[selectedCard];

  async function openDocument(documentId: string) {
    const document = documents.find((item) => item.id === documentId);
    if (!document?.storage_path) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(document.storage_path, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function askAssistant(question?: string) {
    const cleanQuestion = (question ?? assistantInput).trim();
    if (!cleanQuestion || assistantLoading) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: cleanQuestion },
    ]);
    setAssistantInput("");
    setAssistantLoading(true);
    setAssistantError("");

    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessione non disponibile.");

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: cleanQuestion, language: "it" }),
      });
      const result = (await response.json()) as {
        answer?: string;
        documentIds?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Risposta non disponibile.");

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer || "Non ho trovato informazioni sufficienti nel tuo archivio.",
          documentIds: result.documentIds ?? [],
        },
      ]);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Non riesco a rispondere.");
    } finally {
      setAssistantLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askAssistant();
  }

  if (!portalTarget) return null;

  const cards: Array<{
    key: HomeCardKey;
    label: string;
    value: string | number;
    caption: string;
    icon: typeof WalletCards;
  }> = [
    {
      key: "payments",
      label: "Da pagare",
      value: homeData.paymentDetails.length,
      caption: homeData.paymentDetails.length ? `${euro(homeData.outstandingNow)} da gestire adesso` : "Nessun pagamento urgente",
      icon: WalletCards,
    },
    {
      key: "deadlines",
      label: "Prossime scadenze",
      value: homeData.deadlineDetails.length,
      caption: homeData.deadlineDetails[0]?.date
        ? `La prima è il ${shortDate(homeData.deadlineDetails[0].date)}`
        : "Nessuna nei prossimi 30 giorni",
      icon: CalendarDays,
    },
    {
      key: "new",
      label: "Nuovi documenti",
      value: homeData.newDocumentDetails.length,
      caption: "Caricati negli ultimi 7 giorni",
      icon: FileText,
    },
    {
      key: "advice",
      label: "Consigli AI",
      value: homeData.adviceDetails.length,
      caption: homeData.adviceDetails.length ? "Controlli consigliati sul tuo archivio" : "Nessuna anomalia evidente",
      icon: Sparkles,
    },
  ];

  return createPortal(
    <section className="smart-home" aria-label="Home intelligente DocuMio">
      <div className="smart-home-welcome">
        <div>
          <span className="smart-home-kicker"><Sparkles size={16} /> La tua giornata amministrativa</span>
          <h1>Buongiorno{userName ? ` ${userName}` : ""}</h1>
          <p>Qui trovi subito cosa richiede attenzione. Il resto dell’archivio rimane disponibile più sotto.</p>
        </div>
        <div className="smart-home-status">
          <Bot size={24} />
          <span><strong>DocuMio è pronto</strong> a controllare documenti, pagamenti e scadenze.</span>
        </div>
      </div>

      <div className="smart-home-cards">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              type="button"
              key={card.key}
              className={`smart-home-card ${selectedCard === card.key ? "active" : ""}`}
              onClick={() => setSelectedCard(card.key)}
            >
              <span className="smart-home-card-icon"><Icon size={22} /></span>
              <span className="smart-home-card-label">{card.label}</span>
              <strong>{dataLoading ? "—" : card.value}</strong>
              <small>{dataLoading ? "Sto controllando l’archivio…" : card.caption}</small>
            </button>
          );
        })}
      </div>

      <div className="smart-home-insights">
        <div className="smart-home-insights-heading">
          <div>
            <span>{cards.find((card) => card.key === selectedCard)?.label}</span>
            <strong>{selectedDetails.length ? `${selectedDetails.length} elementi da vedere` : "Tutto tranquillo"}</strong>
          </div>
          {selectedCard === "advice" && selectedDetails.length > 0 && (
            <button type="button" onClick={() => void askAssistant("Controlla il mio archivio e spiegami quali sono le cose più importanti da sistemare questa settimana.")}>
              Chiedi spiegazione <ArrowRight size={16} />
            </button>
          )}
        </div>

        {selectedDetails.length === 0 ? (
          <div className="smart-home-insights-empty">
            <ReceiptText size={24} /> Non risultano elementi urgenti in questa sezione.
          </div>
        ) : (
          <div className="smart-home-insights-list">
            {selectedDetails.slice(0, 5).map((item) => (
              <button type="button" key={item.id} onClick={() => void openDocument(item.documentId)}>
                <span><strong>{item.title}</strong><small>{item.text}</small></span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="smart-home-chat">
        <div className="smart-home-chat-heading">
          <span className="smart-home-chat-icon"><Bot size={25} /></span>
          <div>
            <h2>Che devo fare questa settimana?</h2>
            <p>Scrivi come parleresti a una persona. DocuMio risponde usando il tuo archivio reale.</p>
          </div>
        </div>

        <div className="smart-home-suggestions">
          {[
            "Che devo fare questa settimana?",
            "Quanto devo pagare adesso?",
            "Quali ricevute mancano?",
            "Cosa scade nei prossimi 30 giorni?",
          ].map((suggestion) => (
            <button type="button" key={suggestion} disabled={assistantLoading} onClick={() => void askAssistant(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>

        <div className="smart-home-conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="smart-home-welcome-message">
              <Sparkles size={18} /> Posso cercare nei documenti, leggere gli allegati e prepararti un riepilogo pratico.
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`smart-home-message ${message.role}`}>
                <div>{message.text}</div>
                {message.role === "assistant" && (message.documentIds ?? []).map((documentId) => {
                  const document = documents.find((item) => item.id === documentId);
                  if (!document) return null;
                  return (
                    <button type="button" key={documentId} onClick={() => void openDocument(documentId)}>
                      <FileText size={15} /> {document.title}
                    </button>
                  );
                })}
              </div>
            ))
          )}
          {assistantLoading && (
            <div className="smart-home-message assistant loading"><Loader2 size={17} /> Sto controllando il tuo archivio…</div>
          )}
          {assistantError && (
            <div className="smart-home-chat-error"><CircleAlert size={17} /> {assistantError}</div>
          )}
        </div>

        <form className="smart-home-chat-form" onSubmit={handleSubmit}>
          <input
            value={assistantInput}
            onChange={(event) => setAssistantInput(event.target.value)}
            placeholder="Es. Che devo fare questa settimana?"
            disabled={assistantLoading}
          />
          <button type="submit" disabled={!assistantInput.trim() || assistantLoading} aria-label="Invia domanda">
            {assistantLoading ? <Loader2 size={20} /> : <Send size={20} />}
          </button>
        </form>
      </section>
    </section>,
    portalTarget,
  );
}
