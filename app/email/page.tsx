"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import "./email.css";

type EmailCategory = "pagamenti" | "documenti" | "appuntamenti" | "pubblicita" | "altro";
type EmailImportance = "high" | "medium" | "low";
type HistoryRange = "14d" | "90d" | "1y" | "all";

type SmartEmail = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
  category: EmailCategory;
  importance: EmailImportance;
  suggestedAction: string;
  reason?: string;
  documentType?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  senderName?: string | null;
  analyzedByAi?: boolean;
};

type InboxResponse = {
  connected: boolean;
  emailAddress?: string;
  summary?: { total: number; important: number; documents: number; advertising: number };
  messages: SmartEmail[];
  nextPageToken?: string | null;
  resultSizeEstimate?: number;
  range?: HistoryRange;
  error?: string;
};

type AnalyzeResponse = {
  results?: Array<{
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
  }>;
  analyzed?: number;
  error?: string;
};

type CleanupGroup = {
  key: string;
  label: string;
  reason: string;
  messages: SmartEmail[];
};

const categoryLabels: Record<EmailCategory, string> = {
  pagamenti: "Pagamenti e scadenze",
  documenti: "Documenti",
  appuntamenti: "Appuntamenti",
  pubblicita: "Pubblicità e newsletter",
  altro: "Altre email",
};

const rangeLabels: Record<HistoryRange, string> = {
  "14d": "Ultimi 14 giorni",
  "90d": "Ultimi 3 mesi",
  "1y": "Ultimo anno",
  all: "Tutta la posta",
};

function buildSummary(messages: SmartEmail[]) {
  return {
    total: messages.length,
    important: messages.filter((item) => item.importance === "high").length,
    documents: messages.filter(
      (item) => item.category === "documenti" || item.category === "pagamenti",
    ).length,
    advertising: messages.filter((item) => item.category === "pubblicita").length,
  };
}

function getAnalysisDetails(message: SmartEmail) {
  const details: string[] = [];
  if (message.documentType) details.push(`Tipo: ${message.documentType}`);
  if (typeof message.amount === "number") {
    details.push(
      `Importo rilevato: ${new Intl.NumberFormat("it-IT", {
        maximumFractionDigits: 2,
      }).format(message.amount)}`,
    );
  }
  if (message.dueDate) details.push(`Scadenza: ${message.dueDate}`);
  if (message.appointmentDate) {
    details.push(
      `Appuntamento: ${message.appointmentDate}${message.appointmentTime ? ` alle ${message.appointmentTime}` : ""}`,
    );
  }
  return details;
}

function senderIdentity(message: SmartEmail) {
  const emailMatch = message.from.match(/<([^>]+)>/) ?? message.from.match(/[\w.+-]+@[\w.-]+/);
  const email = (emailMatch?.[1] ?? emailMatch?.[0] ?? "").trim().toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop() ?? email : email;
  const displayName = message.senderName?.trim() || message.from.replace(/<[^>]+>/g, "").replace(/^\s*["']|["']\s*$/g, "").trim();
  return {
    key: domain || displayName.toLowerCase() || "mittente-sconosciuto",
    label: displayName || domain || "Mittente sconosciuto",
  };
}

function buildCleanupGroups(messages: SmartEmail[]): CleanupGroup[] {
  const safeCandidates = messages.filter((message) => {
    if (!message.analyzedByAi) return false;
    if (message.importance !== "low") return false;
    if (message.suggestedAction !== "review_trash") return false;
    if (message.category !== "pubblicita" && message.category !== "altro") return false;
    if (message.labelIds.includes("STARRED") || message.labelIds.includes("IMPORTANT")) return false;
    if (message.documentType || message.amount || message.dueDate || message.appointmentDate) return false;
    return true;
  });

  const grouped = new Map<string, CleanupGroup>();
  for (const message of safeCandidates) {
    const sender = senderIdentity(message);
    const current = grouped.get(sender.key);
    if (current) {
      current.messages.push(message);
    } else {
      grouped.set(sender.key, {
        key: sender.key,
        label: sender.label,
        reason: message.category === "pubblicita"
          ? "Pubblicità o newsletter senza informazioni importanti"
          : "Notifiche ripetitive o email considerate poco utili",
        messages: [message],
      });
    }
  }

  return [...grouped.values()]
    .filter((group) => group.messages.length >= 2)
    .sort((a, b) => b.messages.length - a.messages.length || a.label.localeCompare(b.label));
}

export default function SmartEmailPage() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ done: number; total: number } | null>(null);
  const [actingIds, setActingIds] = useState<string[]>([]);
  const [cleaningGroupKey, setCleaningGroupKey] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [cleanupSelections, setCleanupSelections] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<EmailCategory | "tutte">("tutte");
  const [range, setRange] = useState<HistoryRange>("14d");

  const getToken = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    return sessionData.session?.access_token ?? null;
  }, []);

  const loadInbox = useCallback(async (pageToken?: string) => {
    const append = Boolean(pageToken);
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Accedi a DocuMio prima di aprire la Posta intelligente.");
      const params = new URLSearchParams({ range });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch(`/api/email/gmail/inbox?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as InboxResponse;
      if (!response.ok) throw new Error(result.error ?? "Non riesco a leggere Gmail.");
      setData((current) => {
        if (!append || !current) return result;
        const knownIds = new Set(current.messages.map((message) => message.id));
        const newMessages = result.messages.filter((message) => !knownIds.has(message.id));
        const messages = [...current.messages, ...newMessages];
        return { ...result, messages, summary: buildSummary(messages) };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore durante la lettura della posta.");
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [getToken, range]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  async function connectGmail() {
    setConnecting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione DocuMio non disponibile.");
      const response = await fetch("/api/email/gmail/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error ?? "Collegamento Gmail non disponibile.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Errore Gmail.");
      setConnecting(false);
    }
  }

  async function analyzeEmails() {
    if (!data?.connected || data.messages.length === 0 || analyzing) return;
    const pendingMessages = data.messages.filter((message) => !message.analyzedByAi);
    const targets = pendingMessages.length > 0 ? pendingMessages : data.messages;
    const batchSize = 15;

    setAnalyzing(true);
    setAnalysisProgress({ done: 0, total: targets.length });
    setError("");
    setNotice("");

    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione DocuMio non disponibile.");
      let completed = 0;

      for (let index = 0; index < targets.length; index += batchSize) {
        const batch = targets.slice(index, index + batchSize);
        const response = await fetch("/api/email/gmail/analyze", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

        const responseText = await response.text();
        let result: AnalyzeResponse = {};
        try {
          result = responseText ? JSON.parse(responseText) as AnalyzeResponse : {};
        } catch {
          throw new Error("La risposta dell'analisi non era leggibile.");
        }
        if (!response.ok) throw new Error(result.error ?? "Analisi email non riuscita.");

        const analyses = result.results ?? [];
        if (analyses.length === 0) throw new Error("L'IA non ha restituito risultati per queste email.");
        const analysisById = new Map(analyses.map((analysis) => [analysis.id, analysis]));

        setData((current) => {
          if (!current) return current;
          const messages = current.messages.map((message) => {
            const analysis = analysisById.get(message.id);
            return analysis ? { ...message, ...analysis, analyzedByAi: true } : message;
          });
          return { ...current, messages, summary: buildSummary(messages) };
        });

        completed += analyses.length;
        setAnalysisProgress({ done: Math.min(completed, targets.length), total: targets.length });
      }

      setNotice(`${completed} email analizzate con l'IA. Le proposte di pulizia sono pronte qui sotto.`);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Errore durante l'analisi delle email.");
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  }

  async function sendGmailAction(messageIds: string[], action: "archive" | "trash") {
    const token = await getToken();
    if (!token) throw new Error("Sessione DocuMio non disponibile.");
    let changed = 0;

    for (let index = 0; index < messageIds.length; index += 50) {
      const batch = messageIds.slice(index, index + 50);
      const response = await fetch("/api/email/gmail/action", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: batch, action, confirmed: true }),
      });
      const result = (await response.json()) as { changed?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Azione non completata.");
      changed += result.changed ?? 0;
    }
    return changed;
  }

  async function applyAction(message: SmartEmail, action: "archive" | "trash") {
    const label = action === "trash" ? "spostare nel cestino" : "archiviare";
    if (!window.confirm(`Confermi di ${label} l’email “${message.subject || "Senza oggetto"}”?`)) return;

    setActingIds((current) => [...current, message.id]);
    setError("");
    setNotice("");
    try {
      const changed = await sendGmailAction([message.id], action);
      if (!changed) throw new Error("Azione non completata.");
      setData((current) => {
        if (!current) return current;
        const messages = current.messages.filter((item) => item.id !== message.id);
        return { ...current, messages, summary: buildSummary(messages) };
      });
      setNotice(action === "trash" ? "Email spostata nel cestino Gmail." : "Email archiviata.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Azione non riuscita.");
    } finally {
      setActingIds((current) => current.filter((id) => id !== message.id));
    }
  }

  const cleanupGroups = useMemo(() => buildCleanupGroups(data?.messages ?? []), [data?.messages]);

  useEffect(() => {
    setCleanupSelections((current) => {
      const next: Record<string, string[]> = {};
      for (const group of cleanupGroups) {
        const validIds = new Set(group.messages.map((message) => message.id));
        const previous = current[group.key]?.filter((id) => validIds.has(id));
        next[group.key] = previous?.length ? previous : [...validIds];
      }
      return next;
    });
  }, [cleanupGroups]);

  function toggleCleanupMessage(groupKey: string, messageId: string) {
    setCleanupSelections((current) => {
      const selected = current[groupKey] ?? [];
      return {
        ...current,
        [groupKey]: selected.includes(messageId)
          ? selected.filter((id) => id !== messageId)
          : [...selected, messageId],
      };
    });
  }

  async function trashCleanupGroup(group: CleanupGroup) {
    const selectedIds = cleanupSelections[group.key] ?? [];
    if (selectedIds.length === 0) {
      setError("Seleziona almeno una email da cestinare.");
      return;
    }
    const confirmed = window.confirm(
      `Spostare ${selectedIds.length} email di “${group.label}” nel cestino Gmail? Potrai recuperarle dal cestino.`,
    );
    if (!confirmed) return;

    setCleaningGroupKey(group.key);
    setError("");
    setNotice("");
    try {
      const changed = await sendGmailAction(selectedIds, "trash");
      if (!changed) throw new Error("Nessuna email è stata spostata.");
      const removedIds = new Set(selectedIds);
      setData((current) => {
        if (!current) return current;
        const messages = current.messages.filter((message) => !removedIds.has(message.id));
        return { ...current, messages, summary: buildSummary(messages) };
      });
      setNotice(`${changed} email spostate nel cestino Gmail. Non sono state eliminate definitivamente.`);
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Pulizia non riuscita.");
    } finally {
      setCleaningGroupKey(null);
    }
  }

  const visibleMessages = useMemo(
    () => (data?.messages ?? []).filter((message) => filter === "tutte" || message.category === filter),
    [data?.messages, filter],
  );
  const pendingAiCount = data?.messages.filter((message) => !message.analyzedByAi).length ?? 0;

  return (
    <main className="smart-mail-page">
      <div className="smart-mail-shell">
        <div className="smart-mail-top">
          <Link href="/" className="smart-mail-back"><ArrowLeft size={17} /> Torna a DocuMio</Link>
          {data?.connected && (
            <button onClick={() => void loadInbox()} disabled={loading || analyzing || Boolean(cleaningGroupKey)} className="smart-mail-refresh">
              <RefreshCw size={17} /> Aggiorna posta
            </button>
          )}
        </div>

        <section className="smart-mail-hero">
          <div className="smart-mail-badge"><ShieldCheck size={16} /> Azioni sempre sotto il tuo controllo</div>
          <h1>Posta intelligente</h1>
          <p>DocuMio analizza le email soltanto quando glielo chiedi e propone la pulizia senza cancellare nulla da solo.</p>
        </section>

        {error && <div className="smart-mail-error">{error}</div>}
        {notice && <div className="smart-mail-notice"><CheckCircle2 size={18} /> {notice}</div>}

        {loading ? (
          <div className="smart-mail-loading"><Loader2 size={34} /></div>
        ) : !data?.connected ? (
          <section className="smart-mail-connect-card">
            <Inbox size={54} />
            <h2>Collega Gmail a DocuMio</h2>
            <p>Autorizzi lettura e organizzazione della posta tramite Google. DocuMio non conosce né salva la tua password Gmail.</p>
            <button onClick={() => void connectGmail()} disabled={connecting} className="smart-mail-connect">
              {connecting ? <Loader2 size={19} /> : <Mail size={19} />} Collega Gmail
            </button>
          </section>
        ) : (
          <>
            <div className="smart-mail-filters" aria-label="Periodo da caricare">
              {(Object.keys(rangeLabels) as HistoryRange[]).map((item) => (
                <button key={item} onClick={() => setRange(item)} disabled={analyzing || Boolean(cleaningGroupKey)} className={`smart-mail-filter ${range === item ? "active" : ""}`}>
                  {rangeLabels[item]}
                </button>
              ))}
            </div>

            <section className="smart-mail-ai-panel">
              <button onClick={() => void analyzeEmails()} disabled={analyzing || data.messages.length === 0 || Boolean(cleaningGroupKey)} className="smart-mail-analyze">
                {analyzing ? <Loader2 size={19} /> : <Sparkles size={19} />}
                {analyzing && analysisProgress
                  ? `Analisi ${analysisProgress.done} di ${analysisProgress.total}`
                  : pendingAiCount > 0
                    ? `Analizza ${pendingAiCount} email con l’IA`
                    : "Rianalizza le email con l’IA"}
              </button>
              <p>Al termine DocuMio raggruppa le email poco utili e te le propone per la pulizia.</p>
            </section>

            <div className="smart-mail-summary">
              {[
                ["Email caricate", data.summary?.total ?? 0],
                ["Importanti", data.summary?.important ?? 0],
                ["Documenti trovati", data.summary?.documents ?? 0],
                ["Analizzate con IA", data.messages.filter((message) => message.analyzedByAi).length],
              ].map(([label, value]) => (
                <div key={String(label)} className="smart-mail-stat"><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>

            {cleanupGroups.length > 0 && (
              <section className="smart-mail-cleanup">
                <div className="smart-mail-cleanup-heading">
                  <div>
                    <span className="smart-mail-cleanup-kicker"><Sparkles size={15} /> Pulizia consigliata</span>
                    <h2>{cleanupGroups.reduce((sum, group) => sum + group.messages.length, 0)} email raggruppate da controllare</h2>
                    <p>Solo pubblicità o email poco utili classificate dall’IA come non importanti.</p>
                  </div>
                </div>

                <div className="smart-mail-cleanup-groups">
                  {cleanupGroups.map((group) => {
                    const expanded = expandedGroups.includes(group.key);
                    const selectedIds = cleanupSelections[group.key] ?? [];
                    const cleaning = cleaningGroupKey === group.key;
                    return (
                      <article key={group.key} className="smart-mail-cleanup-group">
                        <div className="smart-mail-cleanup-group-top">
                          <div>
                            <h3>{group.label}</h3>
                            <p>{group.reason}</p>
                            <strong>{selectedIds.length} di {group.messages.length} selezionate</strong>
                          </div>
                          <div className="smart-mail-cleanup-buttons">
                            <button
                              type="button"
                              className="smart-mail-cleanup-show"
                              onClick={() => setExpandedGroups((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}
                            >
                              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              {expanded ? "Nascondi" : "Controlla"}
                            </button>
                            <button
                              type="button"
                              className="smart-mail-cleanup-trash"
                              disabled={cleaning || selectedIds.length === 0 || analyzing}
                              onClick={() => void trashCleanupGroup(group)}
                            >
                              {cleaning ? <Loader2 size={16} /> : <Trash2 size={16} />}
                              Cestina {selectedIds.length}
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="smart-mail-cleanup-list">
                            <label className="smart-mail-cleanup-select-all">
                              <input
                                type="checkbox"
                                checked={selectedIds.length === group.messages.length}
                                onChange={(event) => setCleanupSelections((current) => ({
                                  ...current,
                                  [group.key]: event.target.checked ? group.messages.map((message) => message.id) : [],
                                }))}
                              />
                              Seleziona tutte
                            </label>
                            {group.messages.map((message) => (
                              <label key={message.id} className="smart-mail-cleanup-item">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(message.id)}
                                  onChange={() => toggleCleanupMessage(group.key, message.id)}
                                />
                                <span>
                                  <strong>{message.subject || "Senza oggetto"}</strong>
                                  <small>{message.reason || message.snippet}</small>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="smart-mail-filters" aria-label="Categoria email">
              {(["tutte", "pagamenti", "documenti", "appuntamenti", "pubblicita", "altro"] as const).map((item) => (
                <button key={item} onClick={() => setFilter(item)} className={`smart-mail-filter ${filter === item ? "active" : ""}`}>
                  {item === "tutte" ? "Tutte" : categoryLabels[item]}
                </button>
              ))}
            </div>

            <section className="smart-mail-list">
              {visibleMessages.length === 0 ? (
                <div className="smart-mail-empty">Nessuna email in questa categoria.</div>
              ) : visibleMessages.map((message) => {
                const acting = actingIds.includes(message.id);
                const analysisDetails = getAnalysisDetails(message);
                return (
                  <article key={message.id} className="smart-mail-message">
                    <div className="smart-mail-message-row">
                      <div className="smart-mail-message-main">
                        <div className="smart-mail-tags">
                          <span className="smart-mail-tag">{categoryLabels[message.category]}</span>
                          {message.importance === "high" && <span className="smart-mail-tag attention">Richiede attenzione</span>}
                          {message.analyzedByAi && <span className="smart-mail-tag ai"><Sparkles size={12} /> Analizzata con IA</span>}
                        </div>
                        <h3>{message.subject || "Senza oggetto"}</h3>
                        <div className="smart-mail-from">{message.from}</div>
                        <p className="smart-mail-snippet">{message.snippet}</p>
                        {message.analyzedByAi && message.reason && <div className="smart-mail-ai-reason"><Sparkles size={15} /> {message.reason}</div>}
                        {analysisDetails.length > 0 && <div className="smart-mail-ai-details">{analysisDetails.map((detail) => <span key={detail}>{detail}</span>)}</div>}
                      </div>
                      <div className="smart-mail-actions">
                        <button disabled={acting || analyzing || Boolean(cleaningGroupKey)} onClick={() => void applyAction(message, "archive")} className="smart-mail-action"><Archive size={16} /> Archivia</button>
                        <button disabled={acting || analyzing || Boolean(cleaningGroupKey)} onClick={() => void applyAction(message, "trash")} className="smart-mail-action trash"><Trash2 size={16} /> Cestina</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            {data.nextPageToken && (
              <button onClick={() => void loadInbox(data.nextPageToken ?? undefined)} disabled={loadingMore || analyzing || Boolean(cleaningGroupKey)} className="smart-mail-refresh" style={{ width: "100%", marginTop: 14 }}>
                {loadingMore ? <Loader2 size={17} /> : <RefreshCw size={17} />} Carica altre email più vecchie
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
