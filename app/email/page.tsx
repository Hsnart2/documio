"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, CheckCircle2, Inbox, Loader2, Mail, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
            <ArrowLeft size={17} /> Torna a DocuMio
          </Link>
          {data?.connected && (
            <button onClick={() => void loadInbox()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Aggiorna posta
            </button>
          )}
        </div>

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm"><ShieldCheck size={16} /> Azioni sempre sotto il tuo controllo</div>
              <h1 className="text-3xl font-bold sm:text-4xl">Posta intelligente</h1>
              <p className="mt-3 max-w-2xl text-slate-300">DocuMio legge le email recenti, individua documenti, pagamenti, appuntamenti e pubblicità. Non elimina mai definitivamente nulla.</p>
            </div>
            <Mail size={72} className="hidden opacity-30 sm:block" />
          </div>
        </section>

        {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
        {notice && <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 size={18} /> {notice}</div>}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin" size={34} /></div>
        ) : !data?.connected ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Inbox className="mx-auto mb-4 text-indigo-600" size={54} />
            <h2 className="text-2xl font-bold">Collega Gmail a DocuMio</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">Autorizzi lettura e organizzazione della posta tramite Google. DocuMio non conosce né salva la tua password Gmail.</p>
            <button onClick={() => void connectGmail()} disabled={connecting} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 font-bold text-white disabled:opacity-60">
              {connecting ? <Loader2 size={19} className="animate-spin" /> : <Mail size={19} />} Collega Gmail
            </button>
          </section>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Email analizzate", data.summary?.total ?? 0],
                ["Importanti", data.summary?.important ?? 0],
                ["Documenti trovati", data.summary?.documents ?? 0],
                ["Pubblicità", data.summary?.advertising ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-3xl font-bold">{value}</div></div>
              ))}
            </div>

            <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
              {(["tutte", "pagamenti", "documenti", "appuntamenti", "pubblicita", "altro"] as const).map((item) => (
                <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${filter === item ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white"}`}>
                  {item === "tutte" ? "Tutte" : categoryLabels[item]}
                </button>
              ))}
            </div>

            <section className="mt-4 space-y-3">
              {visibleMessages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Nessuna email in questa categoria.</div>
              ) : visibleMessages.map((message) => {
                const acting = actingIds.includes(message.id);
                return (
                  <article key={message.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{categoryLabels[message.category]}</span>
                          {message.importance === "high" && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Richiede attenzione</span>}
                        </div>
                        <h3 className="mt-3 truncate text-lg font-bold">{message.subject || "Senza oggetto"}</h3>
                        <p className="mt-1 truncate text-sm font-medium text-slate-600">{message.from}</p>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{message.snippet}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button disabled={acting} onClick={() => void applyAction(message, "archive")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"><Archive size={16} /> Archivia</button>
                        <button disabled={acting} onClick={() => void applyAction(message, "trash")} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{acting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Cestina</button>
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
