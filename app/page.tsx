"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  Car,
  FileText,
  Heart,
  Landmark,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { DocumentCategory, StoredDocument } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";

const categories: { name: DocumentCategory; icon: React.ReactNode }[] = [
  { name: "Casa", icon: <Building2 size={20} /> },
  { name: "Veicoli", icon: <Car size={20} /> },
  { name: "Assicurazioni", icon: <ShieldCheck size={20} /> },
  { name: "Banca", icon: <Landmark size={20} /> },
  { name: "Lavoro", icon: <Archive size={20} /> },
  { name: "Famiglia", icon: <Heart size={20} /> },
];

const starterDocuments: StoredDocument[] = [
  {
    id: "demo-1",
    title: "Rogito casa principale",
    category: "Casa",
    fileName: "rogito-casa.pdf",
    uploadedAt: new Date().toISOString(),
    summary:
      "Atto di compravendita dell’immobile principale. Documento dimostrativo.",
    keywords: ["rogito", "casa", "immobile", "notaio"],
  },
  {
    id: "demo-2",
    title: "Atto costitutivo azienda",
    category: "Lavoro",
    fileName: "atto-costitutivo.pdf",
    uploadedAt: new Date(Date.now() - 86_400_000).toISOString(),
    summary:
      "Documento societario con dati di costituzione e amministrazione. Documento dimostrativo.",
    keywords: ["azienda", "costituzione", "società"],
  },
];

type ActiveCategory = DocumentCategory | "Tutti" | "In scadenza";

function isExpiringWithin30Days(expiryDate?: string | null) {
  if (!expiryDate) return false;

  const expiry = new Date(`${expiryDate}T23:59:59`).getTime();
  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

  return expiry >= now && expiry <= thirtyDaysFromNow;
}

export default function Home() {
  const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [user, setUser] = useState<string | null>(null);
async function signUp() {
  const supabase = getSupabaseClient();
  if (!supabase) return alert("Supabase non configurato");

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) return alert(error.message);
  alert("Controlla la tua email per confermare la registrazione.");
}

async function signIn() {
  const supabase = getSupabaseClient();
  if (!supabase) return alert("Supabase non configurato");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return alert(error.message);
  setUser(data.user.email ?? "utente");
}
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<ActiveCategory>("Tutti");
  const [showUpload, setShowUpload] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

useEffect(() => {
  async function loadDocuments() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setIsLoaded(true);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setDocuments([]);
      setIsLoaded(true);
      return;
    }

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      alert(error.message);
      setIsLoaded(true);
      return;
    }

    const loadedDocuments: StoredDocument[] = (data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category as DocumentCategory,
      fileName: item.file_name,
      uploadedAt: item.uploaded_at,
      summary: item.summary,
      keywords: item.keywords ?? [],
      expiryDate: item.expiry_date,
      size: item.size ?? undefined,
    }));

    setDocuments(loadedDocuments);
    setIsLoaded(true);
  }

  loadDocuments();
}, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("documio-documents", JSON.stringify(documents));
  }, [documents, isLoaded]);

  const expiringCount = useMemo(
    () =>
      documents.filter((doc) => isExpiringWithin30Days(doc.expiryDate)).length,
    [documents],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((doc) => {
      const matchesCategory =
        activeCategory === "Tutti" ||
        (activeCategory === "In scadenza" &&
          isExpiringWithin30Days(doc.expiryDate)) ||
        doc.category === activeCategory;

      const haystack =
        `${doc.title} ${doc.fileName} ${doc.summary} ${doc.keywords.join(" ")}`.toLowerCase();

      return matchesCategory && haystack.includes(normalizedQuery);
    });
  }, [documents, query, activeCategory]);

  function deleteDocument(id: string) {
    const confirmed = window.confirm("Vuoi eliminare questo documento?");
    if (!confirmed) return;

    setDocuments((current) => current.filter((doc) => doc.id !== id));
  }
if (!user) {
  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1>Accedi a Documio</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 12, marginBottom: 12 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 12, marginBottom: 12 }}
      />

      <button onClick={signIn} style={{ width: "100%", padding: 12 }}>
        Accedi
      </button>

      <button
        onClick={signUp}
        style={{ width: "100%", padding: 12, marginTop: 10 }}
      >
        Registrati
      </button>
    </main>
  );
}
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <FileText size={22} />
          </div>
          <span>Documio</span>
        </div>

        <button className="primary" onClick={() => setShowUpload(true)}>
          <Plus size={18} />
          Carica documento
        </button>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">
            <Sparkles size={16} />
            Archivio intelligente
          </span>
          <h1>
            Trova ogni documento
            <br />
            in pochi secondi.
          </h1>
          <p>
            Carica, organizza e cerca rogiti, polizze, documenti aziendali e
            familiari senza perderti tra mille cartelle.
          </p>
        </div>

        <div className="hero-card">
          <div className="pulse">
            <Search size={28} />
          </div>
          <strong>Chiedi al tuo archivio</strong>
          <span>“Dov’è il rogito della casa?”</span>
        </div>
      </section>

      <section className="search-wrap">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca per titolo, categoria o contenuto…"
        />
      </section>

      <section className="layout">
        <aside>
          <button
            className={
              activeCategory === "In scadenza"
                ? "category active"
                : "category"
            }
            onClick={() => setActiveCategory("In scadenza")}
          >
            <span>⏰</span>
            In scadenza
            <span>{expiringCount}</span>
          </button>

          <button
            className={
              activeCategory === "Tutti" ? "category active" : "category"
            }
            onClick={() => setActiveCategory("Tutti")}
          >
            <FileText size={20} />
            Tutti i documenti
            <span>{documents.length}</span>
          </button>

          {categories.map((category) => (
            <button
              key={category.name}
              className={
                activeCategory === category.name
                  ? "category active"
                  : "category"
              }
              onClick={() => setActiveCategory(category.name)}
            >
              {category.icon}
              {category.name}
              <span>
                {
                  documents.filter(
                    (document) => document.category === category.name,
                  ).length
                }
              </span>
            </button>
          ))}
        </aside>

        <section>
          <div className="section-title">
            <div>
              <h2>
                {activeCategory === "Tutti"
                  ? "Tutti i documenti"
                  : activeCategory}
              </h2>
              <p>
                {filtered.length}{" "}
                {filtered.length === 1 ? "documento trovato" : "documenti trovati"}
              </p>
            </div>
          </div>

          <div className="grid">
            {filtered.map((doc) => (
              <article className="doc-card" key={doc.id}>
                <div className="doc-card-actions">
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => deleteDocument(doc.id)}
                    aria-label={`Elimina ${doc.title}`}
                  >
                    Elimina
                  </button>
                </div>

                <div className="doc-icon">
                  <FileText size={24} />
                </div>
                <span className="badge">{doc.category}</span>
                <h3>{doc.title}</h3>
                <p>{doc.summary}</p>

                {doc.expiryDate && (
                  <span className="expiry-date">
                    Scade il{" "}
                    {new Date(
                      `${doc.expiryDate}T12:00:00`,
                    ).toLocaleDateString("it-IT")}
                  </span>
                )}

                <div className="keywords">
                  {doc.keywords.slice(0, 3).map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>

                <footer>
                  <span>{doc.fileName}</span>
                  <time>
                    {new Date(doc.uploadedAt).toLocaleDateString("it-IT")}
                  </time>
                </footer>
              </article>
            ))}

            {!filtered.length && (
              <div className="empty">
                <FileText size={42} />
                <h3>Nessun documento trovato</h3>
                <p>Prova un’altra ricerca oppure carica un nuovo file.</p>
              </div>
            )}
          </div>
        </section>
      </section>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
onSaved={async (doc) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    alert("Supabase non configurato");
    return;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    alert("Sessione non valida. Accedi nuovamente.");
    return;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      title: doc.title,
      category: doc.category,
      file_name: doc.fileName,
      uploaded_at: doc.uploadedAt,
      expiry_date: doc.expiryDate,
      summary: doc.summary,
      keywords: doc.keywords,
      size: doc.size ?? null,
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  const savedDocument: StoredDocument = {
    id: data.id,
    title: data.title,
    category: data.category as DocumentCategory,
    fileName: data.file_name,
    uploadedAt: data.uploaded_at,
    summary: data.summary,
    keywords: data.keywords ?? [],
    expiryDate: data.expiry_date,
    size: data.size ?? undefined,
  };

  setDocuments((previous) => [savedDocument, ...previous]);
  setShowUpload(false);
}}
        />
      )}
    </main>
  );
}

function UploadModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (doc: StoredDocument) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyze() {
    if (!file || loading) return;

    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          userNote: note,
        }),
      });

      if (!response.ok) {
        throw new Error("Analisi non riuscita");
      }

      const data = await response.json();

      onSaved({
        id: crypto.randomUUID(),
        title: data.title || file.name,
        category: data.category || "Altro",
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        expiryDate: expiryDate || null,
        summary: data.summary || "Documento caricato.",
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        size: file.size,
      });
    } catch {
      window.alert(
        "Non sono riuscito ad archiviare il documento. Controlla il server e riprova.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="close"
          onClick={onClose}
          aria-label="Chiudi"
        >
          <X />
        </button>

        <div className="modal-icon">
          <Upload />
        </div>
        <h2>Carica un documento</h2>
        <p>
          Per questa prima versione il file resta sul tuo dispositivo; salviamo
          la sua scheda nell’archivio locale.
        </p>

        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <Upload size={28} />
          <strong>{file ? file.name : "Scegli PDF o fotografia"}</strong>
          <span>PDF, JPG o PNG</span>
        </label>

        <label className="field">
          Nota facoltativa
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Es. rogito della casa di Roma…"
          />
        </label>

        <label className="field">
          Data di scadenza
          <input
            className="date-input"
            type="date"
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
          />
        </label>

        <button
          className="primary full"
          disabled={!file || loading}
          onClick={analyze}
        >
          {loading ? "Sto organizzando…" : "Analizza e archivia"}
        </button>
      </div>
    </div>
  );
}
