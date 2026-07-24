"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, CheckCircle2, Inbox, Loader2, Mail, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import "./email.css";

type EmailCategory = "pagamenti" | "documenti" | "appuntamenti" | "pubblicita" | "altro";
type EmailImportance = "high" | "medium" | "low";

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
};

type InboxResponse = {
  connected: boolean;
  emailAddress?: string;
  summary?: { total: number; important: number; documents: number; advertising: number };
  messages: SmartEmail[];
  error?: string;
};

const categoryLabels: Record<EmailCategory, string> = {
  pagamenti: "Pagamenti e scadenze",
  documenti: "Documenti",
  appuntamenti: "Appuntamenti",
  pubblicita: "Pubblicità e newsletter",
  altro: "Altre email",
};

export default function SmartEmailPage() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [actingIds, setActingIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<EmailCategory | "tutte">("tutte");

  const getToken = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    return sessionData.session?.access_token ?? null;
  }, []);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Accedi a DocuMio prima di aprire la Posta intelligente.");
      const response = await fetch("/api/email/gmail/inbox", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as InboxResponse;
      if (!response.ok) throw new Error(result.error ?? "Non riesco a leggere Gmail.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore durante la lettura della posta.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

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

  async function applyAction(message: SmartEmail, action: "archive" | "trash") {
    const label = action === "trash" ? "spostare nel cestino" : "archiviare";
    if (!window.confirm(`Confermi di ${label} l’email “${message.subject || "Senza oggetto"}”?`)) return;

    setActingIds((current) => [...current, message.id]);
    setError("");
    setNotice("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione DocuMio non disponibile.");
      const response = await fetch("/api/email/gmail/action", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageIds: [message.id], action, confirmed: true }),
      });
      const result = (await response.json()) as { changed?: number; error?: string };
      if (!response.ok || !result.changed) throw new Error(result.error ?? "Azione non completata.");
      setData((current) => current ? { ...current, messages: current.messages.filter((item) => item.id !== message.id) } : current);
      setNotice(action === "trash" ? "Email spostata nel cestino. Puoi ancora recuperarla da Gmail." : "Email archiviata.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Azione non riuscita.");
    } finally {
      setActingIds((current) => current.filter((id) => id !== message.id));
    }
  }

  const visibleMessages = useMemo(
    () => (data?.messages ?? []).filter((message) => filter === "tutte" || message.category === filter),
    [data?.messages, filter],
  );

  return (
    <main className="smart-mail-page">
      <div className="smart-mail-shell">
        <div className="smart-mail-top">
          <Link href="/" className="smart-mail-back">
            <ArrowLeft size={17} /> Torna a DocuMio
          </Link>
          {data?.connected && (
            <button onClick={() => void loadInbox()} disabled={loading} className="smart-mail-refresh">
              <RefreshCw size={17} /> Aggiorna posta
            </button>
          )}
        </div>

        <section className="smart-mail-hero">
          <div className="smart-mail-badge"><ShieldCheck size={16} /> Azioni sempre sotto il tuo controllo</div>
          <h1>Posta intelligente</h1>
          <p>DocuMio legge le email recenti, individua documenti, pagamenti, appuntamenti e pubblicità. Non elimina mai definitivamente nulla.</p>
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
            <div className="smart-mail-summary">
              {[
                ["Email analizzate", data.summary?.total ?? 0],
                ["Importanti", data.summary?.important ?? 0],
                ["Documenti trovati", data.summary?.documents ?? 0],
                ["Pubblicità", data.summary?.advertising ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="smart-mail-stat"><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>

            <div className="smart-mail-filters">
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
                return (
                  <article key={message.id} className="smart-mail-message">
                    <div className="smart-mail-message-row">
                      <div className="smart-mail-message-main">
                        <div className="smart-mail-tags">
                          <span className="smart-mail-tag">{categoryLabels[message.category]}</span>
                          {message.importance === "high" && <span className="smart-mail-tag attention">Richiede attenzione</span>}
                        </div>
                        <h3>{message.subject || "Senza oggetto"}</h3>
                        <div className="smart-mail-from">{message.from}</div>
                        <p className="smart-mail-snippet">{message.snippet}</p>
                      </div>
                      <div className="smart-mail-actions">
                        <button disabled={acting} onClick={() => void applyAction(message, "archive")} className="smart-mail-action"><Archive size={16} /> Archivia</button>
                        <button disabled={acting} onClick={() => void applyAction(message, "trash")} className="smart-mail-action trash"><Trash2 size={16} /> Cestina</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
