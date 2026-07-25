"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, FolderKanban, Loader2, Plus, Sparkles, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type UiMode = "advanced" | "standard";

type PendingDocument = {
  id: string;
  title: string;
  category: string;
  summary?: string | null;
  storage_path?: string | null;
  practice_id?: string | null;
  uploaded_at?: string | null;
};

type PracticeOption = {
  id: string;
  title: string;
  practice_type: string;
};

const MODE_KEY = "documio-ui-mode";

function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === "standard" ? "standard" : "advanced";
  } catch {
    return "advanced";
  }
}

function suggestedPracticeType(category: string) {
  const mapping: Record<string, string> = {
    Casa: "Casa",
    Veicoli: "Auto",
    Assicurazioni: "Assicurazione",
    Banca: "Mutuo",
    Lavoro: "Lavoro",
    Famiglia: "Famiglia",
    "Visite mediche": "Salute",
    Appuntamenti: "Altro",
    Bollette: "Casa",
    Istruzione: "Altro",
  };
  return mapping[category] ?? "Altro";
}

function shouldPrompt(row: PendingDocument) {
  if (!row.id || row.practice_id) return false;
  if (row.storage_path?.includes("/email/")) return false;
  return true;
}

export default function PostUploadPracticePrompt() {
  const [mode, setMode] = useState<UiMode>("advanced");
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<PendingDocument[]>([]);
  const [practices, setPractices] = useState<PracticeOption[]>([]);
  const [selectedPracticeId, setSelectedPracticeId] = useState("");
  const [newPracticeName, setNewPracticeName] = useState("");
  const [newPracticeType, setNewPracticeType] = useState("Altro");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const handledIds = useRef(new Set<string>());
  const current = queue[0] ?? null;

  useEffect(() => {
    setMode(readMode());
    const onModeChange = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: UiMode }>).detail?.mode;
      setMode(next === "standard" ? "standard" : "advanced");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_KEY) {
        setMode(event.newValue === "standard" ? "standard" : "advanced");
      }
    };
    window.addEventListener("documio-ui-mode-changed", onModeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("documio-ui-mode-changed", onModeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUserId(session?.user.id ?? null);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || window.location.pathname !== "/") return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    let uploadWasOpen = Boolean(document.querySelector(".upload-modal"));
    let uploadOpenedAt = Date.now();

    const enqueue = (row: PendingDocument) => {
      if (!active || !shouldPrompt(row) || handledIds.current.has(row.id)) return;
      handledIds.current.add(row.id);
      setQueue((items) => (items.some((item) => item.id === row.id) ? items : [...items, row]));
    };

    const checkRecentUploads = async (openedAt: number) => {
      const since = new Date(openedAt - 15_000).toISOString();
      const { data } = await supabase
        .from("documents")
        .select("id,title,category,summary,storage_path,practice_id,uploaded_at")
        .eq("user_id", userId)
        .is("practice_id", null)
        .gte("uploaded_at", since)
        .order("uploaded_at", { ascending: true })
        .limit(10);
      for (const row of (data ?? []) as PendingDocument[]) enqueue(row);
    };

    const observer = new MutationObserver(() => {
      const uploadIsOpen = Boolean(document.querySelector(".upload-modal"));
      if (uploadIsOpen && !uploadWasOpen) uploadOpenedAt = Date.now();
      if (!uploadIsOpen && uploadWasOpen) void checkRecentUploads(uploadOpenedAt);
      uploadWasOpen = uploadIsOpen;
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const channel = supabase
      .channel(`documio-post-upload-practice-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "documents",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => enqueue(payload.new as PendingDocument),
      )
      .subscribe();

    return () => {
      active = false;
      observer.disconnect();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!current || !userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSelectedPracticeId("");
    setNewPracticeName(current.title || "Nuova pratica");
    setNewPracticeType(suggestedPracticeType(current.category));
    setError("");
    void supabase
      .from("practices")
      .select("id,title,practice_type")
      .eq("user_id", userId)
      .neq("status", "Chiusa")
      .order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        setPractices((data ?? []) as PracticeOption[]);
      });
  }, [current, userId]);

  const finishCurrent = () => {
    setQueue((items) => items.slice(1));
    setSaving(false);
    setError("");
  };

  const leaveInArchive = () => {
    finishCurrent();
  };

  const assignExisting = async () => {
    if (!current || !selectedPracticeId || saving) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase
      .from("documents")
      .update({ practice_id: selectedPracticeId })
      .eq("id", current.id)
      .eq("user_id", userId);
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("documio-document-practice-updated", {
        detail: { documentId: current.id, practiceId: selectedPracticeId },
      }),
    );
    finishCurrent();
  };

  const createAndAssign = async () => {
    if (!current || !userId || !newPracticeName.trim() || saving) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError("");

    const { data: practice, error: createError } = await supabase
      .from("practices")
      .insert({
        user_id: userId,
        title: newPracticeName.trim(),
        practice_type: newPracticeType || "Altro",
        description: `Pratica creata dal documento “${current.title}”.`,
        status: "In corso",
        opened_at: new Date().toISOString().slice(0, 10),
      })
      .select("id,title,practice_type")
      .single();
    if (createError || !practice) {
      setSaving(false);
      setError(createError?.message ?? "Non riesco a creare la pratica.");
      return;
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ practice_id: practice.id })
      .eq("id", current.id)
      .eq("user_id", userId);
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("documio-document-practice-updated", {
        detail: { documentId: current.id, practiceId: practice.id, practice },
      }),
    );
    finishCurrent();
  };

  const target = typeof document !== "undefined" ? document.body : null;
  const subtitle = useMemo(
    () =>
      mode === "advanced"
        ? "L’IA ha già classificato e strutturato il documento. Ora scegli se collegarlo a una pratica oppure conservarlo soltanto nell’archivio."
        : "Nessuna pratica viene creata senza il tuo consenso. Scegli una pratica esistente, creane una nuova oppure lascia il documento nell’archivio.",
    [mode],
  );

  if (!target || !current) return null;

  return createPortal(
    <div className="practice-prompt-backdrop" role="presentation">
      <section className="practice-prompt" role="dialog" aria-modal="true" aria-labelledby="practice-prompt-title">
        <button type="button" className="practice-prompt-close" onClick={leaveInArchive} aria-label="Lascia nell'archivio e chiudi">
          <X size={20} />
        </button>

        <div className="practice-prompt-heading">
          <span><Sparkles size={23} /></span>
          <div>
            <small>{mode === "advanced" ? "Struttura IA avanzata" : "Conferma struttura Standard"}</small>
            <h2 id="practice-prompt-title">Dove vuoi organizzare questo documento?</h2>
          </div>
        </div>

        <article className="practice-prompt-document">
          <Archive size={22} />
          <span>
            <strong>{current.title}</strong>
            <small>{current.category}{current.summary ? ` · ${current.summary}` : ""}</small>
          </span>
        </article>
        <p className="practice-prompt-copy">{subtitle}</p>

        {error && <div className="practice-prompt-error">{error}</div>}

        <div className="practice-prompt-section">
          <strong><FolderKanban size={18} /> Collega a una pratica esistente</strong>
          <div className="practice-prompt-row">
            <select value={selectedPracticeId} onChange={(event) => setSelectedPracticeId(event.target.value)} disabled={saving}>
              <option value="">Seleziona una pratica</option>
              {practices.map((practice) => (
                <option key={practice.id} value={practice.id}>{practice.title} · {practice.practice_type}</option>
              ))}
            </select>
            <button type="button" onClick={() => void assignExisting()} disabled={!selectedPracticeId || saving}>
              {saving ? <Loader2 size={17} /> : <FolderKanban size={17} />} Collega
            </button>
          </div>
        </div>

        <div className="practice-prompt-divider"><span>oppure</span></div>

        <div className="practice-prompt-section">
          <strong><Plus size={18} /> Apri una nuova pratica</strong>
          <input value={newPracticeName} onChange={(event) => setNewPracticeName(event.target.value)} placeholder="Nome della pratica" disabled={saving} />
          <select value={newPracticeType} onChange={(event) => setNewPracticeType(event.target.value)} disabled={saving}>
            {["Mutuo", "Finanziamento", "Assicurazione", "Ristrutturazione", "Auto", "Casa", "Salute", "Famiglia", "Lavoro", "Altro"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button type="button" className="practice-prompt-primary" onClick={() => void createAndAssign()} disabled={!newPracticeName.trim() || saving}>
            {saving ? <Loader2 size={18} /> : <Plus size={18} />} Crea pratica e collega
          </button>
        </div>

        <button type="button" className="practice-prompt-archive" onClick={leaveInArchive} disabled={saving}>
          <Archive size={18} /> Lascia soltanto nell’archivio
        </button>
        <small className="practice-prompt-note">
          Categoria, riassunto, parole chiave, importi e scadenze restano sempre salvati anche senza pratica.
        </small>
      </section>
    </div>,
    target,
  );
}
