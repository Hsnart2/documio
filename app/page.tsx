"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  CalendarDays,
  Car,
  FileText,
  GraduationCap,
  Heart,
  Landmark,
  LogOut,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Upload,
  X,
} from "lucide-react";
import type { DocumentCategory, StoredDocument } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";

type Language = "it" | "en";
type ActiveCategory = DocumentCategory | "Tutti" | "In scadenza";

type Translation = {
  loginTitle: string;
  email: string;
  password: string;
  signIn: string;
  signUp: string;
  checkEmail: string;
  notConfigured: string;
  invalidSession: string;
  logout: string;
  uploadDocument: string;
  smartArchive: string;
  heroTitle1: string;
  heroTitle2: string;
  heroDescription: string;
  askArchive: string;
  askExample: string;
  searchPlaceholder: string;
  expiring: string;
  allDocuments: string;
  documentFound: string;
  documentsFound: string;
  delete: string;
  deleteConfirm: string;
  deleteFailed: string;
  expiresOn: string;
  noDocuments: string;
  noDocumentsHelp: string;
  uploadTitle: string;
  uploadDescription: string;
  chooseFile: string;
  fileFormats: string;
  optionalNote: string;
  notePlaceholder: string;
  expiryDate: string;
  organizing: string;
  analyzeAndArchive: string;
  archiveError: string;
  close: string;
  categories: Record<DocumentCategory, string>;
};

const translations: Record<Language, Translation> = {
  it: {
    loginTitle: "Accedi a DocuMio",
    email: "Email",
    password: "Password",
    signIn: "Accedi",
    signUp: "Registrati",
    checkEmail: "Controlla la tua email per confermare la registrazione.",
    notConfigured: "Supabase non configurato",
    invalidSession: "Sessione non valida. Accedi nuovamente.",
    logout: "Esci",
    uploadDocument: "Carica documento",
    smartArchive: "Archivio intelligente",
    heroTitle1: "Trova ogni documento",
    heroTitle2: "in pochi secondi.",
    heroDescription:
      "Carica, organizza e cerca documenti personali, medici, familiari e di lavoro senza perderti tra mille cartelle.",
    askArchive: "Chiedi al tuo archivio",
    askExample: "“Dov’è il rogito della casa?”",
    searchPlaceholder: "Cerca per titolo, categoria o contenuto…",
    expiring: "In scadenza",
    allDocuments: "Tutti i documenti",
    documentFound: "documento trovato",
    documentsFound: "documenti trovati",
    delete: "Elimina",
    deleteConfirm: "Vuoi eliminare questo documento?",
    deleteFailed: "Nessun documento eliminato. Ricarica la pagina e riprova.",
    expiresOn: "Scade il",
    noDocuments: "Nessun documento trovato",
    noDocumentsHelp: "Prova un’altra ricerca oppure carica un nuovo file.",
    uploadTitle: "Carica un documento",
    uploadDescription:
      "Per questa prima versione salviamo la scheda del documento nel tuo archivio DocuMio.",
    chooseFile: "Scegli PDF o fotografia",
    fileFormats: "PDF, JPG o PNG",
    optionalNote: "Nota facoltativa",
    notePlaceholder: "Es. visita cardiologica del 12 maggio…",
    expiryDate: "Data di scadenza o appuntamento",
    organizing: "Sto organizzando…",
    analyzeAndArchive: "Analizza e archivia",
    archiveError:
      "Non sono riuscito ad archiviare il documento. Controlla il server e riprova.",
    close: "Chiudi",
    categories: {
      Casa: "Casa",
      Veicoli: "Veicoli",
      Assicurazioni: "Assicurazioni",
      Banca: "Banca",
      Lavoro: "Lavoro",
      Famiglia: "Famiglia",
      "Visite mediche": "Visite mediche",
      Appuntamenti: "Appuntamenti",
      Bollette: "Bollette",
      Istruzione: "Istruzione",
      Altro: "Altro",
    },
  },
  en: {
    loginTitle: "Sign in to DocuMio",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signUp: "Create account",
    checkEmail: "Check your email to confirm your account.",
    notConfigured: "Supabase is not configured",
    invalidSession: "Your session is no longer valid. Please sign in again.",
    logout: "Sign out",
    uploadDocument: "Upload document",
    smartArchive: "Smart archive",
    heroTitle1: "Find every document",
    heroTitle2: "in just a few seconds.",
    heroDescription:
      "Upload, organize and search personal, medical, family and work documents without getting lost in endless folders.",
    askArchive: "Ask your archive",
    askExample: "“Where is the house deed?”",
    searchPlaceholder: "Search by title, category or content…",
    expiring: "Expiring soon",
    allDocuments: "All documents",
    documentFound: "document found",
    documentsFound: "documents found",
    delete: "Delete",
    deleteConfirm: "Do you want to delete this document?",
    deleteFailed: "No document was deleted. Refresh the page and try again.",
    expiresOn: "Expires on",
    noDocuments: "No documents found",
    noDocumentsHelp: "Try another search or upload a new file.",
    uploadTitle: "Upload a document",
    uploadDescription:
      "In this first version, we save the document record in your DocuMio archive.",
    chooseFile: "Choose a PDF or photo",
    fileFormats: "PDF, JPG or PNG",
    optionalNote: "Optional note",
    notePlaceholder: "For example: cardiology visit on May 12…",
    expiryDate: "Expiry or appointment date",
    organizing: "Organizing…",
    analyzeAndArchive: "Analyze and archive",
    archiveError:
      "I couldn’t archive the document. Check the server and try again.",
    close: "Close",
    categories: {
      Casa: "Home",
      Veicoli: "Vehicles",
      Assicurazioni: "Insurance",
      Banca: "Banking",
      Lavoro: "Work",
      Famiglia: "Family",
      "Visite mediche": "Medical visits",
      Appuntamenti: "Appointments",
      Bollette: "Bills",
      Istruzione: "Education",
      Altro: "Other",
    },
  },
};

const categories: { name: DocumentCategory; icon: React.ReactNode }[] = [
  { name: "Casa", icon: <Building2 size={20} /> },
  { name: "Veicoli", icon: <Car size={20} /> },
  { name: "Assicurazioni", icon: <ShieldCheck size={20} /> },
  { name: "Banca", icon: <Landmark size={20} /> },
  { name: "Lavoro", icon: <Archive size={20} /> },
  { name: "Famiglia", icon: <Heart size={20} /> },
  { name: "Visite mediche", icon: <Stethoscope size={20} /> },
  { name: "Appuntamenti", icon: <CalendarDays size={20} /> },
  { name: "Bollette", icon: <ReceiptText size={20} /> },
  { name: "Istruzione", icon: <GraduationCap size={20} /> },
];

function isExpiringWithin30Days(expiryDate?: string | null) {
  if (!expiryDate) return false;

  const expiry = new Date(`${expiryDate}T23:59:59`).getTime();
  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

  return expiry >= now && expiry <= thirtyDaysFromNow;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("it");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<ActiveCategory>("Tutti");
  const [showUpload, setShowUpload] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const t = translations[language];

  useEffect(() => {
    const rememberedEmail = localStorage.getItem("documio-remembered-email");
    const rememberedLanguage = localStorage.getItem("documio-language");

    if (rememberedEmail) setEmail(rememberedEmail);
    if (rememberedLanguage === "it" || rememberedLanguage === "en") {
      setLanguage(rememberedLanguage);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("documio-language", language);
  }, [language]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;

    async function restoreSession() {
      const {
        data: { session },
      } = await supabase!.auth.getSession();

      if (!mounted) return;

      setUserId(session?.user.id ?? null);
      setUserEmail(session?.user.email ?? null);
      setAuthReady(true);
    }

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      setUserId(session?.user.id ?? null);
      setUserEmail(session?.user.email ?? null);
      setAuthReady(true);

      if (session?.user.email) {
        localStorage.setItem("documio-remembered-email", session.user.email);
        setEmail(session.user.email);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadDocuments() {
      if (!authReady) return;

      if (!userId) {
        setDocuments([]);
        setIsLoaded(true);
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        setIsLoaded(true);
        return;
      }

      setIsLoaded(false);

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", userId)
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
  }, [authReady, userId]);

  async function signUp() {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const cleanEmail = email.trim();
    localStorage.setItem("documio-remembered-email", cleanEmail);

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: "https://documio.vercel.app",
      },
    });

    if (error) return alert(error.message);
    alert(t.checkEmail);
  }

  async function signIn() {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const cleanEmail = email.trim();
    localStorage.setItem("documio-remembered-email", cleanEmail);

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) return alert(error.message);
    setPassword("");
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const { error } = await supabase.auth.signOut();
    if (error) return alert(error.message);

    setDocuments([]);
    setPassword("");
  }

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

      const translatedCategory = t.categories[doc.category] ?? doc.category;
      const haystack =
        `${doc.title} ${doc.fileName} ${doc.summary} ${doc.keywords.join(" ")} ${doc.category} ${translatedCategory}`.toLowerCase();

      return matchesCategory && haystack.includes(normalizedQuery);
    });
  }, [documents, query, activeCategory, t]);

  async function deleteDocument(id: string) {
    const confirmed = window.confirm(t.deleteConfirm);
    if (!confirmed) return;

    const supabase = getSupabaseClient();

    if (!supabase) {
      alert(t.notConfigured);
      return;
    }

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !currentUser) {
      alert(t.invalidSession);
      return;
    }

    const { data: deletedRows, error } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .select("id");

    if (error) {
      alert(error.message);
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      alert(t.deleteFailed);
      return;
    }

    setDocuments((current) => current.filter((doc) => doc.id !== id));
  }

  async function saveDocument(doc: StoredDocument) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      alert(t.notConfigured);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert(t.invalidSession);
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
  }

  if (!authReady) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
        <h1>DocuMio</h1>
      </main>
    );
  }

  if (!userId) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h1>{t.loginTitle}</h1>
          <button
            type="button"
            onClick={() => setLanguage(language === "it" ? "en" : "it")}
            style={{ height: 42, padding: "0 12px" }}
          >
            {language === "it" ? "EN" : "IT"}
          </button>
        </div>

        <input
          type="email"
          placeholder={t.email}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{ width: "100%", padding: 12, marginBottom: 12 }}
        />

        <input
          type="password"
          placeholder={t.password}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") signIn();
          }}
          style={{ width: "100%", padding: 12, marginBottom: 12 }}
        />

        <button onClick={signIn} style={{ width: "100%", padding: 12 }}>
          {t.signIn}
        </button>

        <button
          onClick={signUp}
          style={{ width: "100%", padding: 12, marginTop: 10 }}
        >
          {t.signUp}
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
          <span>DocuMio</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => setLanguage(language === "it" ? "en" : "it")}
            aria-label="Change language"
          >
            {language === "it" ? "EN" : "IT"}
          </button>

          <button className="primary" onClick={() => setShowUpload(true)}>
            <Plus size={18} />
            {t.uploadDocument}
          </button>

          <button type="button" onClick={signOut} title={userEmail ?? undefined}>
            <LogOut size={18} />
            {t.logout}
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">
            <Sparkles size={16} />
            {t.smartArchive}
          </span>
          <h1>
            {t.heroTitle1}
            <br />
            {t.heroTitle2}
          </h1>
          <p>{t.heroDescription}</p>
        </div>

        <div className="hero-card">
          <div className="pulse">
            <Search size={28} />
          </div>
          <strong>{t.askArchive}</strong>
          <span>{t.askExample}</span>
        </div>
      </section>

      <section className="search-wrap">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
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
            {t.expiring}
            <span>{expiringCount}</span>
          </button>

          <button
            className={
              activeCategory === "Tutti" ? "category active" : "category"
            }
            onClick={() => setActiveCategory("Tutti")}
          >
            <FileText size={20} />
            {t.allDocuments}
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
              {t.categories[category.name]}
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
                  ? t.allDocuments
                  : activeCategory === "In scadenza"
                    ? t.expiring
                    : t.categories[activeCategory]}
              </h2>
              <p>
                {filtered.length} {" "}
                {filtered.length === 1
                  ? t.documentFound
                  : t.documentsFound}
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
                    aria-label={`${t.delete} ${doc.title}`}
                  >
                    {t.delete}
                  </button>
                </div>

                <div className="doc-icon">
                  <FileText size={24} />
                </div>
                <span className="badge">
                  {t.categories[doc.category] ?? doc.category}
                </span>
                <h3>{doc.title}</h3>
                <p>{doc.summary}</p>

                {doc.expiryDate && (
                  <span className="expiry-date">
                    {t.expiresOn} {" "}
                    {new Date(
                      `${doc.expiryDate}T12:00:00`,
                    ).toLocaleDateString(language === "it" ? "it-IT" : "en-GB")}
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
                    {new Date(doc.uploadedAt).toLocaleDateString(
                      language === "it" ? "it-IT" : "en-GB",
                    )}
                  </time>
                </footer>
              </article>
            ))}

            {isLoaded && !filtered.length && (
              <div className="empty">
                <FileText size={42} />
                <h3>{t.noDocuments}</h3>
                <p>{t.noDocumentsHelp}</p>
              </div>
            )}
          </div>
        </section>
      </section>

      {showUpload && (
        <UploadModal
          language={language}
          onClose={() => setShowUpload(false)}
          onSaved={saveDocument}
        />
      )}
    </main>
  );
}

function UploadModal({
  language,
  onClose,
  onSaved,
}: {
  language: Language;
  onClose: () => void;
  onSaved: (doc: StoredDocument) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const t = translations[language];

  async function analyze() {
    if (!file || loading) return;

    setLoading(true);

    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(
          language === "it"
            ? "Il file supera 4 MB. Per il primo test scegli un file più piccolo."
            : "The file is larger than 4 MB. For the first test, choose a smaller file.",
        );
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("userNote", note);
      formData.append("language", language);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      await onSaved({
        id: crypto.randomUUID(),
        title: data.title || file.name,
        category: data.category || "Altro",
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        expiryDate: expiryDate || data.expiryDate || null,
        summary:
          data.summary ||
          (language === "it" ? "Documento caricato." : "Document uploaded."),
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        size: file.size,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t.archiveError);
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
          aria-label={t.close}
        >
          <X />
        </button>

        <div className="modal-icon">
          <Upload />
        </div>
        <h2>{t.uploadTitle}</h2>
        <p>{t.uploadDescription}</p>

        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <Upload size={28} />
          <strong>{file ? file.name : t.chooseFile}</strong>
          <span>{t.fileFormats}</span>
        </label>

        <label className="field">
          {t.optionalNote}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.notePlaceholder}
          />
        </label>

        <label className="field">
          {t.expiryDate}
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
          {loading ? t.organizing : t.analyzeAndArchive}
        </button>
      </div>
    </div>
  );
}
