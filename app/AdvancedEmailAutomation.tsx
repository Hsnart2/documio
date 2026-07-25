"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type UiMode = "advanced" | "standard";
type EmailCategory = "pagamenti" | "documenti" | "appuntamenti" | "pubblicita" | "altro";
type EmailImportance = "high" | "medium" | "low";

type InboxMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
  category: EmailCategory;
  importance: EmailImportance;
  suggestedAction: string;
  documentType?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  appointmentDate?: string | null;
};

type Analysis = {
  id: string;
  category: EmailCategory;
  importance: EmailImportance;
  suggestedAction: string;
  reason: string;
  documentType: string | null;
  amount: number | null;
  dueDate: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  senderName: string | null;
};

type AutomationReport = {
  analyzed: number;
  imported: number;
  linked: number;
  trashed: number;
  skipped: number;
  warnings: string[];
};

const MODE_KEY = "documio-ui-mode";
const LAST_RUN_KEY = "documio-advanced-email-last-run";
const COOLDOWN_MS = 10 * 60 * 1000;

function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === "standard" ? "standard" : "advanced";
  } catch {
    return "advanced";
  }
}

function senderKey(message: InboxMessage & Partial<Analysis>) {
  const match = message.from.match(/<([^>]+)>/) ?? message.from.match(/[\w.+-]+@[\w.-]+/);
  const email = (match?.[1] ?? match?.[0] ?? "").toLowerCase();
  return email.includes("@") ? email.split("@").pop() ?? email : email || message.from.toLowerCase();
}

function isSafeTrashCandidate(message: InboxMessage & Partial<Analysis>) {
  if (message.importance !== "low" || message.suggestedAction !== "review_trash") return false;
  if (message.category !== "pubblicita" && message.category !== "altro") return false;
  if (message.labelIds.includes("STARRED") || message.labelIds.includes("IMPORTANT")) return false;
  if (message.documentType || message.amount || message.dueDate || message.appointmentDate) return false;
  return true;
}

function updateEmailHero(mode: UiMode) {
  const hero = document.querySelector<HTMLElement>(".smart-mail-hero");
  if (!hero) return false;
  const badge = hero.querySelector<HTMLElement>(".smart-mail-badge");
  const paragraph = hero.querySelector<HTMLParagraphElement>("p");
  if (mode === "advanced") {
    if (badge) badge.innerHTML = "<span aria-hidden='true'>✦</span> IA avanzata · Automazione protetta";
    if (paragraph) {
      paragraph.textContent =
        "DocuMio analizza la posta, importa gli allegati utili e sposta nel cestino soltanto pubblicità a basso rischio. Il cestino Gmail resta recuperabile.";
    }
  } else {
    if (badge) badge.innerHTML = "<span aria-hidden='true'>✓</span> Azioni sempre sotto il tuo controllo";
    if (paragraph) {
      paragraph.textContent =
        "Nella versione Standard DocuMio propone ogni azione e chiede sempre la tua conferma prima di importare, archiviare o cestinare.";
    }
  }
  return true;
}

export default function AdvancedEmailAutomation() {
  const [mode, setMode] = useState<UiMode>("advanced");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [report, setReport] = useState<AutomationReport | null>(null);
  const [fatalError, setFatalError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    const initialMode = readMode();
    setMode(initialMode);

    const onModeChange = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: UiMode }>).detail?.mode;
      const resolved = next === "standard" ? "standard" : "advanced";
      setMode(resolved);
      startedRef.current = false;
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MODE_KEY) return;
      setMode(event.newValue === "standard" ? "standard" : "advanced");
      startedRef.current = false;
    };
    window.addEventListener("documio-ui-mode-changed", onModeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("documio-ui-mode-changed", onModeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (window.location.pathname !== "/email") return;
    const refreshHero = () => updateEmailHero(mode);
    refreshHero();
    const observer = new MutationObserver(refreshHero);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (window.location.pathname !== "/email" || mode !== "advanced" || startedRef.current) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      let lastRun = 0;
      try {
        lastRun = Number(localStorage.getItem(LAST_RUN_KEY) ?? 0);
      } catch {
        lastRun = 0;
      }
      if (Date.now() - lastRun < COOLDOWN_MS) return;

      startedRef.current = true;
      setRunning(true);
      setFatalError("");
      setReport(null);
      const nextReport: AutomationReport = {
        analyzed: 0,
        imported: 0,
        linked: 0,
        trashed: 0,
        skipped: 0,
        warnings: [],
      };

      try {
        const supabase = getSupabaseClient();
        const { data: sessionData } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Accedi a DocuMio per avviare l'automazione email.");

        setStage("Leggo la posta recente…");
        const inboxResponse = await fetch("/api/email/gmail/inbox?range=14d", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const inbox = (await inboxResponse.json()) as {
          connected?: boolean;
          messages?: InboxMessage[];
          error?: string;
        };
        if (!inboxResponse.ok) throw new Error(inbox.error ?? "Lettura Gmail non riuscita.");
        if (!inbox.connected || !inbox.messages?.length) {
          setStage(inbox.connected ? "Nessuna nuova email da gestire." : "Gmail non è ancora collegata.");
          return;
        }

        const sourceMessages = inbox.messages;
        const analyses: Analysis[] = [];
        setStage(`Analizzo ${sourceMessages.length} email…`);
        for (let index = 0; index < sourceMessages.length; index += 15) {
          if (cancelled) return;
          const batch = sourceMessages.slice(index, index + 15);
          const response = await fetch("/api/email/gmail/analyze", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: batch.map((message) => ({
                id: message.id,
                subject: message.subject,
                from: message.from,
                date: message.date,
                snippet: message.snippet,
                labelIds: message.labelIds,
              })),
            }),
          });
          const result = (await response.json().catch(() => null)) as {
            results?: Analysis[];
            error?: string;
          } | null;
          if (!response.ok) {
            nextReport.warnings.push(result?.error ?? "Un gruppo di email non è stato analizzato.");
            continue;
          }
          analyses.push(...(result?.results ?? []));
          nextReport.analyzed += result?.results?.length ?? 0;
          setStage(`Analizzate ${Math.min(index + batch.length, sourceMessages.length)} di ${sourceMessages.length} email…`);
        }

        const analysisById = new Map(analyses.map((analysis) => [analysis.id, analysis]));
        const enriched = sourceMessages.map((message) => ({
          ...message,
          ...(analysisById.get(message.id) ?? {}),
        }));

        const usefulMessageIds = enriched
          .filter(
            (message) =>
              (message.category === "documenti" || message.category === "pagamenti") &&
              message.importance !== "low" &&
              message.suggestedAction === "review_document",
          )
          .map((message) => message.id)
          .slice(0, 20);

        if (usefulMessageIds.length) {
          setStage(`Importo gli allegati utili da ${usefulMessageIds.length} email…`);
          const importResponse = await fetch("/api/email/gmail/import", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messageIds: usefulMessageIds,
              mode: "advanced",
              confirmed: true,
            }),
          });
          const imported = (await importResponse.json().catch(() => null)) as {
            importedDocuments?: number;
            linkedAttachments?: number;
            skipped?: number;
            errors?: string[];
            error?: string;
          } | null;
          if (!importResponse.ok) {
            nextReport.warnings.push(imported?.error ?? "Importazione degli allegati non riuscita.");
          } else {
            nextReport.imported += imported?.importedDocuments ?? 0;
            nextReport.linked += imported?.linkedAttachments ?? 0;
            nextReport.skipped += imported?.skipped ?? 0;
            nextReport.warnings.push(...(imported?.errors ?? []));
          }
        }

        const safeCandidates = enriched.filter(isSafeTrashCandidate);
        const grouped = new Map<string, Array<InboxMessage & Partial<Analysis>>>();
        for (const message of safeCandidates) {
          const key = senderKey(message);
          grouped.set(key, [...(grouped.get(key) ?? []), message]);
        }
        const trashIds = safeCandidates
          .filter((message) => message.category === "pubblicita" || (grouped.get(senderKey(message))?.length ?? 0) >= 2)
          .map((message) => message.id);

        if (trashIds.length) {
          setStage(`Sposto ${trashIds.length} email pubblicitarie nel cestino recuperabile…`);
          for (let index = 0; index < trashIds.length; index += 50) {
            const response = await fetch("/api/email/gmail/action", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messageIds: trashIds.slice(index, index + 50),
                action: "trash",
                confirmed: true,
              }),
            });
            const result = (await response.json().catch(() => null)) as {
              changed?: number;
              failed?: string[];
              error?: string;
            } | null;
            if (!response.ok) {
              nextReport.warnings.push(result?.error ?? "Pulizia Gmail non riuscita.");
              continue;
            }
            nextReport.trashed += result?.changed ?? 0;
            if (result?.failed?.length) {
              nextReport.warnings.push(`${result.failed.length} email non sono state spostate.`);
            }
          }
        }

        try {
          localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
        } catch {
          // Il controllo resta valido per la sessione corrente.
        }
        if (!cancelled) {
          setReport(nextReport);
          setStage("Automazione completata.");
          window.dispatchEvent(
            new CustomEvent("documio-email-automation-complete", { detail: nextReport }),
          );
          window.setTimeout(() => {
            const refreshButton = Array.from(
              document.querySelectorAll<HTMLButtonElement>(".smart-mail-refresh"),
            ).find((button) => button.textContent?.includes("Aggiorna posta"));
            refreshButton?.click();
          }, 600);
        }
      } catch (error) {
        if (!cancelled) {
          setFatalError(error instanceof Error ? error.message : "Automazione email non riuscita.");
        }
      } finally {
        if (!cancelled) setRunning(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const target = typeof document !== "undefined" ? document.body : null;
  const summary = useMemo(() => {
    if (!report) return "";
    const parts = [
      report.imported ? `${report.imported} documenti importati` : "",
      report.linked ? `${report.linked} allegati collegati` : "",
      report.trashed ? `${report.trashed} email nel cestino` : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Nessuna azione necessaria";
  }, [report]);

  if (!target || window.location.pathname !== "/email" || mode !== "advanced") return null;

  return createPortal(
    <aside className={`advanced-email-automation ${fatalError ? "error" : report ? "complete" : ""}`}>
      <span className="advanced-email-automation-icon">
        {running ? (
          <Loader2 size={20} />
        ) : fatalError ? (
          <TriangleAlert size={20} />
        ) : report ? (
          <CheckCircle2 size={20} />
        ) : (
          <ShieldCheck size={20} />
        )}
      </span>
      <span>
        <strong><Sparkles size={14} /> Automazione IA avanzata</strong>
        <small>{fatalError || summary || stage || "Controllo automatico pronto."}</small>
        {report?.warnings.length ? (
          <small className="advanced-email-warning">{report.warnings[0]}</small>
        ) : null}
      </span>
    </aside>,
    target,
  );
}
