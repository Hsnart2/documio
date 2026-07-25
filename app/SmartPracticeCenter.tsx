"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FilePlus2,
  FileText,
  FolderKanban,
  Loader2,
  PauseCircle,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type PracticeRow = {
  id: string;
  title: string;
  practice_type: string;
  description: string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
};

type DocumentRow = {
  id: string;
  practice_id: string | null;
  title: string;
  category: string;
  summary: string | null;
  keywords: string[] | null;
  uploaded_at: string;
  expiry_date: string | null;
  payment_status: string | null;
  paid_amount: number | null;
  total_amount: number | null;
  remaining_amount: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  financing_total_amount: number | null;
  first_installment_date: string | null;
  paid_installments: number | null;
  storage_path: string | null;
};

type AttachmentRow = {
  id: string;
  document_id: string;
  title: string;
  attachment_type: string;
  uploaded_at: string;
  payment_date: string | null;
  amount: number | null;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  documentIds?: string[];
};

type TimelineItem = {
  id: string;
  date: string;
  title: string;
  detail: string;
  kind: "document" | "attachment" | "deadline";
};

const STATUS_OPTIONS = ["In corso", "Completata", "Sospesa", "Chiusa"] as const;
const PAYMENT_TYPES = new Set(["Ricevuta", "Quietanza", "Pagamento"]);
const GENERIC_TERMS = new Set([
  "pratica",
  "documento",
  "documenti",
  "della",
  "dello",
  "delle",
  "degli",
  "casa",
  "auto",
  "lavoro",
  "altro",
  "nuova",
  "nuovo",
  "2024",
  "2025",
  "2026",
]);

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Data non indicata";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Data non indicata";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(date);
}

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function addMonths(date: string | null, months: number) {
  if (!date) return null;
  const source = new Date(`${date}T12:00:00`);
  if (Number.isNaN(source.getTime())) return null;
  const originalDay = source.getDate();
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return target.toISOString().slice(0, 10);
}

function paymentSnapshot(document: DocumentRow, attachments: AttachmentRow[]) {
  const paymentAttachments = attachments.filter((item) =>
    PAYMENT_TYPES.has(item.attachment_type),
  );
  const attachmentPaid = paymentAttachments.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );
  const paid = Math.max(Number(document.paid_amount) || 0, attachmentPaid);
  const installmentsTotal =
    document.installment_count && document.installment_amount
      ? Number(document.installment_count) * Number(document.installment_amount)
      : 0;
  const total =
    Number(document.financing_total_amount) > 0
      ? Number(document.financing_total_amount)
      : installmentsTotal > 0
        ? installmentsTotal
        : Number(document.total_amount) > 0
          ? Number(document.total_amount)
          : null;
  const remaining =
    total != null
      ? Math.max(0, total - paid)
      : document.remaining_amount != null
        ? Math.max(0, Number(document.remaining_amount))
        : null;
  const paidInstallments = Math.max(
    Number(document.paid_installments) || 0,
    paymentAttachments.filter((item) => Number(item.amount) > 0).length,
  );
  const nextInstallment =
    document.first_installment_date &&
    document.installment_count &&
    paidInstallments < document.installment_count
      ? addMonths(document.first_installment_date, paidInstallments)
      : null;
  return { paid, total, remaining, paymentAttachments, nextInstallment };
}

function candidateScore(practice: PracticeRow, document: DocumentRow) {
  const practiceTitle = normalize(practice.title);
  const source = normalize(
    `${document.title} ${document.category} ${document.summary ?? ""} ${(document.keywords ?? []).join(" ")}`,
  );
  const terms = practiceTitle
    .split(/\s+/)
    .filter((term) => term.length > 2 && !GENERIC_TERMS.has(term));
  let score = practiceTitle.length >= 5 && source.includes(practiceTitle) ? 12 : 0;
  for (const term of terms) {
    if (source.includes(term)) score += 3;
  }
  const type = normalize(practice.practice_type);
  if (type && source.includes(type)) score += 2;
  return score;
}

export default function SmartPracticeCenter() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [practice, setPractice] = useState<PracticeRow | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [allUnassigned, setAllUnassigned] = useState<DocumentRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  const resolvePractice = useCallback(async (modal: HTMLElement) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const title = modal.querySelector("header h2")?.textContent?.trim() ?? "";
    const type = modal.querySelector("header .badge")?.textContent?.trim() ?? "";
    if (!title) return null;
    const { data, error: lookupError } = await supabase
      .from("practices")
      .select("id,title,practice_type,description,status,opened_at,closed_at")
      .eq("title", title)
      .limit(10);
    if (lookupError) return null;
    const rows = (data ?? []) as PracticeRow[];
    return rows.find((item) => item.practice_type === type) ?? rows[0] ?? null;
  }, []);

  const load = useCallback(async (practiceId?: string) => {
    const supabase = getSupabaseClient();
    const id = practiceId ?? practice?.id;
    if (!supabase || !id) return;
    setLoading(true);
    setError("");
    const [practiceResult, documentResult, unassignedResult] = await Promise.all([
      supabase
        .from("practices")
        .select("id,title,practice_type,description,status,opened_at,closed_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select(
          "id,practice_id,title,category,summary,keywords,uploaded_at,expiry_date,payment_status,paid_amount,total_amount,remaining_amount,installment_count,installment_amount,financing_total_amount,first_installment_date,paid_installments,storage_path",
        )
        .eq("practice_id", id)
        .order("uploaded_at", { ascending: false })
        .limit(300),
      supabase
        .from("documents")
        .select(
          "id,practice_id,title,category,summary,keywords,uploaded_at,expiry_date,payment_status,paid_amount,total_amount,remaining_amount,installment_count,installment_amount,financing_total_amount,first_installment_date,paid_installments,storage_path",
        )
        .is("practice_id", null)
        .order("uploaded_at", { ascending: false })
        .limit(300),
    ]);
    const firstError =
      practiceResult.error ?? documentResult.error ?? unassignedResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    const linked = (documentResult.data ?? []) as DocumentRow[];
    const { data: attachmentRows, error: attachmentError } = linked.length
      ? await supabase
          .from("document_attachments")
          .select("id,document_id,title,attachment_type,uploaded_at,payment_date,amount")
          .in(
            "document_id",
            linked.map((item) => item.id),
          )
          .order("uploaded_at", { ascending: false })
          .limit(1200)
      : { data: [], error: null };
    if (attachmentError) setError(attachmentError.message);
    setPractice(practiceResult.data as PracticeRow);
    setDocuments(linked);
    setAllUnassigned((unassignedResult.data ?? []) as DocumentRow[]);
    setAttachments((attachmentRows ?? []) as AttachmentRow[]);
    setLoading(false);
  }, [practice?.id]);

  useEffect(() => {
    let currentModal: HTMLElement | null = null;
    let currentMount: HTMLDivElement | null = null;
    let cancelled = false;

    const inspect = async () => {
      const modal = document.querySelector<HTMLElement>(".practice-details-modal");
      if (!modal) {
        if (currentModal) {
          currentModal = null;
          currentMount = null;
          setTarget(null);
          setPractice(null);
          setDocuments([]);
          setAttachments([]);
          setMessages([]);
        }
        return;
      }
      if (modal === currentModal && currentMount?.isConnected) return;
      currentModal = modal;
      let mount = modal.querySelector<HTMLDivElement>("#documio-smart-practice-center-root");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-smart-practice-center-root";
        const header = modal.querySelector("header");
        header?.insertAdjacentElement("afterend", mount);
      }
      currentMount = mount;
      setTarget(mount);
      const resolved = await resolvePractice(modal);
      if (cancelled || !resolved) {
        if (!resolved) setError("Non riesco a identificare questa pratica.");
        return;
      }
      setPractice(resolved);
      setMessages([]);
      void load(resolved.id);
    };

    void inspect();
    const observer = new MutationObserver(() => void inspect());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [load, resolvePractice]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ practiceId?: string }>).detail;
      if (!practice?.id || detail?.practiceId !== practice.id) return;
      void load(practice.id);
    };
    window.addEventListener("documio-document-practice-updated", onUpdate);
    return () => window.removeEventListener("documio-document-practice-updated", onUpdate);
  }, [load, practice?.id]);

  const byDocument = useMemo(() => {
    const map = new Map<string, AttachmentRow[]>();
    for (const attachment of attachments) {
      map.set(attachment.document_id, [
        ...(map.get(attachment.document_id) ?? []),
        attachment,
      ]);
    }
    return map;
  }, [attachments]);

  const intelligence = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    let paid = 0;
    let remaining = 0;
    let overdue = 0;
    let upcoming = 0;
    const missingReceipts: DocumentRow[] = [];

    for (const document of documents) {
      const snapshot = paymentSnapshot(document, byDocument.get(document.id) ?? []);
      paid += snapshot.paid;
      remaining += snapshot.remaining ?? 0;
      if (
        snapshot.paymentAttachments.length === 0 &&
        (document.payment_status === "Pagato" || snapshot.paid > 0)
      ) {
        missingReceipts.push(document);
      }
      const dates = [document.expiry_date, snapshot.nextInstallment].filter(
        (value): value is string => Boolean(value),
      );
      for (const date of dates) {
        if (date < today) overdue += 1;
        else if (date <= in30Days) upcoming += 1;
      }
    }

    const candidates = practice
      ? allUnassigned
          .map((document) => ({ document, score: candidateScore(practice, document) }))
          .filter((item) => item.score >= 6)
          .sort((a, b) => b.score - a.score)
          .slice(0, 12)
      : [];
    const attention =
      documents.length === 0 || overdue > 0 || missingReceipts.length > 0 || candidates.length > 0;
    return { paid, remaining, overdue, upcoming, missingReceipts, candidates, attention };
  }, [allUnassigned, byDocument, documents, practice]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const document of documents) {
      items.push({
        id: `document:${document.id}`,
        date: document.uploaded_at,
        title: document.title,
        detail: `Documento aggiunto · ${document.category}`,
        kind: "document",
      });
      if (document.expiry_date) {
        items.push({
          id: `deadline:${document.id}:${document.expiry_date}`,
          date: `${document.expiry_date}T12:00:00`,
          title: document.title,
          detail: `Scadenza indicata: ${dateLabel(document.expiry_date)}`,
          kind: "deadline",
        });
      }
      for (const attachment of byDocument.get(document.id) ?? []) {
        items.push({
          id: `attachment:${attachment.id}`,
          date: attachment.payment_date
            ? `${attachment.payment_date}T12:00:00`
            : attachment.uploaded_at,
          title: attachment.title,
          detail: `${attachment.attachment_type}${attachment.amount != null ? ` · ${money(Number(attachment.amount))}` : ""}`,
          kind: "attachment",
        });
      }
    }
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  }, [byDocument, documents]);

  async function updateStatus(status: string) {
    if (!practice || saving) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError("");
    const closedAt = status === "Chiusa" ? new Date().toISOString().slice(0, 10) : null;
    const { error: updateError } = await supabase
      .from("practices")
      .update({ status, closed_at: closedAt })
      .eq("id", practice.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPractice((current) =>
      current ? { ...current, status, closed_at: closedAt } : current,
    );
  }

  async function assignDocument() {
    if (!practice || !selectedDocumentId || saving) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase
      .from("documents")
      .update({ practice_id: practice.id })
      .eq("id", selectedDocumentId)
      .is("practice_id", null);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("documio-document-practice-updated", {
        detail: { documentId: selectedDocumentId, practiceId: practice.id },
      }),
    );
    setSelectedDocumentId("");
    await load(practice.id);
  }

  async function openDocument(documentId: string) {
    const documentRow = documents.find((item) => item.id === documentId);
    if (!documentRow?.storage_path) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(documentRow.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function askPractice(value?: string) {
    const clean = String(value ?? question).trim();
    if (!clean || !practice || asking) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: clean },
    ]);
    setQuestion("");
    setAsking(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessione non disponibile.");
      const response = await fetch("/api/practices/assistant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practiceId: practice.id, question: clean, language: "it" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Risposta non disponibile.");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer || "Non risultano informazioni sufficienti.",
          documentIds: Array.isArray(result.documentIds) ? result.documentIds : [],
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Non riesco a rispondere.",
      );
    } finally {
      setAsking(false);
    }
  }

  if (!target || !practice) return null;

  return createPortal(
    <section className="smart-practice-center">
      <div className="smart-practice-heading">
        <span className="smart-practice-heading-icon"><Sparkles size={21} /></span>
        <div>
          <small>Pratica intelligente</small>
          <strong>Controllo isolato: {practice.title}</strong>
          <p>Riepilogo, pagamenti, scadenze e risposte usano soltanto questa pratica.</p>
        </div>
        {loading && <Loader2 className="smart-practice-spin" size={20} />}
      </div>

      <div className="smart-practice-status-row">
        <label>
          <span>Stato pratica</span>
          <select
            value={practice.status === "Aperta" ? "In corso" : practice.status}
            onChange={(event) => void updateStatus(event.target.value)}
            disabled={saving}
          >
            {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <div className={`smart-practice-health ${intelligence.attention ? "attention" : "ok"}`}>
          {intelligence.attention ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>
            <strong>{intelligence.attention ? "Controlli da fare" : "Nessuna anomalia evidente"}</strong>
            <small>Aperta il {dateLabel(practice.opened_at)}</small>
          </span>
        </div>
      </div>

      <div className="smart-practice-metrics">
        <article><FileText size={18} /><span><strong>{documents.length}</strong><small>Documenti</small></span></article>
        <article><CircleDollarSign size={18} /><span><strong>{money(intelligence.remaining)}</strong><small>Residuo calcolabile</small></span></article>
        <article><CalendarClock size={18} /><span><strong>{intelligence.upcoming}</strong><small>Scadenze entro 30 giorni</small></span></article>
        <article className={intelligence.overdue ? "danger" : ""}><Clock3 size={18} /><span><strong>{intelligence.overdue}</strong><small>Scadenze superate</small></span></article>
      </div>

      {(intelligence.missingReceipts.length > 0 || intelligence.candidates.length > 0) && (
        <div className="smart-practice-checks">
          {intelligence.missingReceipts.length > 0 && (
            <div>
              <strong><ReceiptText size={17} /> Ricevute da controllare</strong>
              <p>{intelligence.missingReceipts.map((item) => item.title).join(" · ")}</p>
            </div>
          )}
          {intelligence.candidates.length > 0 && (
            <div>
              <strong><FilePlus2 size={17} /> Documenti che potrebbero appartenere alla pratica</strong>
              <p>{intelligence.candidates.slice(0, 3).map((item) => item.document.title).join(" · ")}</p>
            </div>
          )}
        </div>
      )}

      <div className="smart-practice-add-document">
        <div>
          <strong>Aggiungi un documento già presente</strong>
          <small>Vengono mostrati prima i suggerimenti più compatibili.</small>
        </div>
        <div>
          <select
            value={selectedDocumentId}
            onChange={(event) => setSelectedDocumentId(event.target.value)}
            disabled={saving}
          >
            <option value="">Seleziona un documento dall’archivio</option>
            {intelligence.candidates.map(({ document }) => (
              <option key={`candidate:${document.id}`} value={document.id}>★ {document.title}</option>
            ))}
            {allUnassigned
              .filter((document) => !intelligence.candidates.some((item) => item.document.id === document.id))
              .map((document) => (
                <option key={document.id} value={document.id}>{document.title}</option>
              ))}
          </select>
          <button type="button" onClick={() => void assignDocument()} disabled={!selectedDocumentId || saving}>
            {saving ? <Loader2 size={17} /> : <FilePlus2 size={17} />} Collega
          </button>
        </div>
      </div>

      <div className="smart-practice-assistant">
        <div className="smart-practice-assistant-title">
          <span><Bot size={21} /></span>
          <div><strong>Assistente della pratica</strong><small>Non può leggere altre pratiche.</small></div>
        </div>
        <div className="smart-practice-suggestions">
          {["Fammi il riepilogo della pratica", "Cosa manca?", "Quanto ho pagato?", "Cosa scade?"].map((item) => (
            <button key={item} type="button" disabled={asking} onClick={() => void askPractice(item)}>{item}</button>
          ))}
        </div>
        {messages.length > 0 && (
          <div className="smart-practice-conversation">
            {messages.map((message) => (
              <div key={message.id} className={message.role}>
                <p>{message.text}</p>
                {message.role === "assistant" && (message.documentIds ?? []).map((documentId) => {
                  const documentRow = documents.find((item) => item.id === documentId);
                  return documentRow ? (
                    <button key={documentId} type="button" onClick={() => void openDocument(documentId)}>
                      <FileText size={15} /> {documentRow.title} <ChevronRight size={15} />
                    </button>
                  ) : null;
                })}
              </div>
            ))}
            {asking && <div className="assistant loading"><Loader2 size={17} /> Sto controllando soltanto questa pratica…</div>}
          </div>
        )}
        <form onSubmit={(event) => { event.preventDefault(); void askPractice(); }}>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Es. Questa pratica ha documenti mancanti?" disabled={asking} />
          <button type="submit" disabled={!question.trim() || asking}>{asking ? <Loader2 size={19} /> : <ChevronRight size={19} />}</button>
        </form>
      </div>

      <div className="smart-practice-timeline">
        <strong><Clock3 size={17} /> Cronologia della pratica</strong>
        {timeline.length ? timeline.slice(0, 8).map((item) => (
          <article key={item.id}>
            <span className={item.kind}>{item.kind === "document" ? <FileText size={15} /> : item.kind === "deadline" ? <CalendarClock size={15} /> : <ReceiptText size={15} />}</span>
            <div><strong>{item.title}</strong><small>{item.detail} · {dateLabel(item.date)}</small></div>
          </article>
        )) : <p>Nessun evento disponibile.</p>}
      </div>

      {error && <div className="smart-practice-error">{error}</div>}
    </section>,
    target,
  );
}
