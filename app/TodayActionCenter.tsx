"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  FileSearch,
  Loader2,
  ReceiptText,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  storage_path: string | null;
  expiry_date: string | null;
  appointment_time: string | null;
  appointment_completed_at: string | null;
  payment_status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  first_installment_date: string | null;
  is_financing: boolean | null;
  paid_installments: number | null;
};

type AttachmentRow = {
  document_id: string;
  attachment_type: string;
};

type TodayAction = {
  id: string;
  documentId: string;
  kind: "overdue" | "today" | "soon" | "receipt" | "payment";
  title: string;
  detail: string;
  priority: number;
  canMarkPaid: boolean;
};

const DAY_MS = 86_400_000;
const PAYMENT_PROOFS = new Set(["Ricevuta", "Quietanza", "Pagamento"]);

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addMonths(date: string, months: number) {
  const source = new Date(`${date}T12:00:00Z`);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

function daysBetween(today: string, date: string) {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
}

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function isAppointment(document: DocumentRow) {
  return ["Appuntamenti", "Visite mediche"].includes(document.category);
}

export default function TodayActionCenter() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setDocuments([]);
      setAttachments([]);
      setLoading(false);
      return;
    }
    const [documentResult, attachmentResult] = await Promise.all([
      supabase
        .from("documents")
        .select("id,title,category,storage_path,expiry_date,appointment_time,appointment_completed_at,payment_status,total_amount,paid_amount,remaining_amount,installment_count,installment_amount,first_installment_date,is_financing,paid_installments")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false })
        .limit(1000),
      supabase
        .from("document_attachments")
        .select("document_id,attachment_type")
        .eq("user_id", user.id)
        .limit(3000),
    ]);
    if (!documentResult.error) setDocuments((documentResult.data ?? []) as DocumentRow[]);
    if (!attachmentResult.error) setAttachments((attachmentResult.data ?? []) as AttachmentRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const inspect = () => {
      const home = document.querySelector<HTMLElement>(".smart-home");
      if (!home) {
        setTarget(null);
        return;
      }
      let mount = home.querySelector<HTMLDivElement>("#documio-today-action-root");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-today-action-root";
        const cards = home.querySelector(".smart-home-cards");
        cards?.insertAdjacentElement("beforebegin", mount);
      }
      setTarget(mount);
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [load]);

  const actions = useMemo(() => {
    const today = todayDate();
    const proofByDocument = new Set(
      attachments
        .filter((item) => PAYMENT_PROOFS.has(item.attachment_type))
        .map((item) => item.document_id),
    );
    const result: TodayAction[] = [];

    for (const document of documents) {
      const status = document.payment_status ?? "Da pagare";
      const paid = status === "Pagato";
      const appointment = isAppointment(document);
      let dueDate = document.expiry_date;
      let installmentNumber: number | null = null;

      if (
        document.is_financing &&
        document.first_installment_date &&
        document.installment_count
      ) {
        const paidInstallments = Math.max(0, Number(document.paid_installments) || 0);
        if (paidInstallments < document.installment_count) {
          dueDate = addMonths(document.first_installment_date, paidInstallments);
          installmentNumber = paidInstallments + 1;
        }
      }

      if (dueDate && !["Pagato", "Contestato"].includes(status) && !document.appointment_completed_at) {
        const days = daysBetween(today, dueDate);
        if (days <= 7) {
          const amount = document.installment_amount
            ? ` da ${money(Number(document.installment_amount))}`
            : document.remaining_amount
              ? ` da ${money(Number(document.remaining_amount))}`
              : "";
          const timing = days < 0
            ? `${Math.abs(days)} giorni in ritardo`
            : days === 0
              ? appointment ? "oggi" : "scade oggi"
              : days === 1
                ? appointment ? "domani" : "scade domani"
                : `tra ${days} giorni`;
          result.push({
            id: `due:${document.id}:${dueDate}`,
            documentId: document.id,
            kind: days < 0 ? "overdue" : days === 0 ? "today" : "soon",
            title: document.title,
            detail: installmentNumber
              ? `Rata ${installmentNumber}/${document.installment_count}${amount}: ${timing}.`
              : `${appointment ? "Appuntamento" : "Scadenza"}${document.appointment_time ? ` alle ${String(document.appointment_time).slice(0, 5)}` : ""}: ${timing}.`,
            priority: days < 0 ? 100 + Math.abs(days) : days === 0 ? 90 : 70 - days,
            canMarkPaid: !appointment && !document.is_financing,
          });
        }
      }

      if (paid && !proofByDocument.has(document.id)) {
        result.push({
          id: `receipt:${document.id}`,
          documentId: document.id,
          kind: "receipt",
          title: document.title,
          detail: "Risulta pagato, ma manca una ricevuta o quietanza collegata.",
          priority: 65,
          canMarkPaid: false,
        });
      }
    }

    return result.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }, [attachments, documents]);

  async function openDocument(documentId: string) {
    const documentRow = documents.find((item) => item.id === documentId);
    if (!documentRow?.storage_path) {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (item) => ["documenti", "documents"].includes(item.textContent?.trim().toLowerCase() ?? ""),
      );
      button?.click();
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(documentRow.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function markPaid(action: TodayAction) {
    if (workingId) return;
    const documentRow = documents.find((item) => item.id === action.documentId);
    const supabase = getSupabaseClient();
    if (!documentRow || !supabase) return;
    setWorkingId(action.id);
    setMessage("");
    const amount = Number(documentRow.total_amount) || Number(documentRow.remaining_amount) || null;
    const today = todayDate();
    const { error } = await supabase
      .from("documents")
      .update({
        payment_status: "Pagato",
        paid_at: today,
        last_payment_date: today,
        paid_amount: amount,
        remaining_amount: 0,
        payment_progress_confirmed: true,
      })
      .eq("id", documentRow.id);
    setWorkingId("");
    if (error) {
      setMessage(`Non sono riuscito ad aggiornare: ${error.message}`);
      return;
    }
    setMessage(`${documentRow.title} segnato come pagato. Ora collega la ricevuta.`);
    await load();
  }

  if (!target) return null;

  return createPortal(
    <section className="today-action-center">
      <header>
        <span className="today-action-icon"><Sparkles size={22} /></span>
        <div>
          <small>Assistente operativo</small>
          <h2>{loading ? "Sto preparando la tua giornata…" : actions.length ? `Oggi hai ${actions.length} cose da sistemare` : "Oggi non devi rincorrere nulla"}</h2>
          <p>{actions.length ? "DocuMio ha già ordinato le priorità. Parti dalla prima e chiudile una alla volta." : "Scadenze, pagamenti e ricevute risultano sotto controllo."}</p>
        </div>
        {!loading && !actions.length && <CheckCircle2 className="today-all-clear" size={28} />}
      </header>

      {loading ? (
        <div className="today-action-loading"><Loader2 size={20} /> Controllo documenti, rate e ricevute…</div>
      ) : actions.length ? (
        <div className="today-action-list">
          {actions.map((action, index) => {
            const Icon = action.kind === "receipt"
              ? ReceiptText
              : action.kind === "overdue"
                ? AlertTriangle
                : action.kind === "payment"
                  ? WalletCards
                  : CalendarClock;
            return (
              <article key={action.id} className={`today-action-item ${action.kind}`}>
                <span className="today-action-number">{index + 1}</span>
                <span className="today-action-kind"><Icon size={19} /></span>
                <div className="today-action-copy">
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </div>
                <div className="today-action-buttons">
                  {action.canMarkPaid && (
                    <button type="button" className="today-action-primary" onClick={() => void markPaid(action)} disabled={Boolean(workingId)}>
                      {workingId === action.id ? <Loader2 size={16} /> : <Check size={16} />} Segna pagato
                    </button>
                  )}
                  <button type="button" onClick={() => void openDocument(action.documentId)}>
                    {action.kind === "receipt" ? <FileSearch size={16} /> : <ArrowRight size={16} />}
                    {action.kind === "receipt" ? "Controlla ricevuta" : "Apri"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="today-action-empty"><CheckCircle2 size={23} /> Tutto sotto controllo. DocuMio continuerà a sorvegliare l’archivio per te.</div>
      )}

      {message && <div className="today-action-message">{message}</div>}
    </section>,
    target,
  );
}
