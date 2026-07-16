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
import type { DocumentAttachment, DocumentCategory, PaymentStatus, StoredDocument } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";

type Language = "it" | "en";
type ActiveCategory =
  | DocumentCategory
  | "Tutti"
  | "In scadenza"
  | "Da pagare"
  | "Parzialmente pagato"
  | "Pagato";

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
  openDocument: string;
  downloadDocument: string;
  fileUnavailable: string;
  attachments: string;
  addAttachment: string;
  noAttachments: string;
  attachmentTitle: string;
  attachmentType: string;
  paymentDate: string;
  amount: string;
  paymentMethod: string;
  notes: string;
  saveAttachment: string;
  savingAttachment: string;
  deleteAttachmentConfirm: string;
  paymentStatus: string;
  statusUpdated: string;
  statuses: Record<PaymentStatus, string>;
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
  analyzingAttachment: string;
  possibleMatch: string;
  matchReasons: string;
  linkSelected: string;
  saveAsNew: string;
  chooseDocument: string;
  noMatchFound: string;
  matchVeryHigh: string;
  matchHigh: string;
  matchMedium: string;
  paidProgress: string;
  dashboardToPay: string;
  dashboardPartial: string;
  dashboardExpiring: string;
  dashboardPaid: string;
  dashboardOutstanding: string;
  smartSearchHint: string;
  searchingWithAi: string;
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
    openDocument: "Apri documento",
    downloadDocument: "Scarica",
    fileUnavailable: "Il file non è ancora disponibile nello Storage.",
    attachments: "Allegati",
    addAttachment: "Aggiungi ricevuta/allegato",
    noAttachments: "Nessun allegato collegato.",
    attachmentTitle: "Titolo allegato",
    attachmentType: "Tipo allegato",
    paymentDate: "Data pagamento",
    amount: "Importo",
    paymentMethod: "Metodo di pagamento",
    notes: "Note",
    saveAttachment: "Salva allegato",
    savingAttachment: "Salvataggio…",
    deleteAttachmentConfirm: "Vuoi eliminare questo allegato?",
    paymentStatus: "Stato",
    statusUpdated: "Stato aggiornato",
    statuses: {
      "Da pagare": "Da pagare",
      "Parzialmente pagato": "Parzialmente pagato",
      Pagato: "Pagato",
      Scaduto: "Scaduto",
      Contestato: "Contestato",
    },
    expiresOn: "Scade il",
    noDocuments: "Nessun documento trovato",
    noDocumentsHelp: "Prova un’altra ricerca oppure carica un nuovo file.",
    uploadTitle: "Carica un documento",
    uploadDescription:
      "Il documento viene analizzato dall’IA e salvato in modo privato nel tuo archivio DocuMio.",
    chooseFile: "Scegli PDF o fotografia",
    fileFormats: "PDF, JPG o PNG",
    optionalNote: "Nota facoltativa",
    notePlaceholder: "Es. visita cardiologica del 12 maggio…",
    expiryDate: "Data di scadenza o appuntamento",
    organizing: "Sto organizzando…",
    analyzeAndArchive: "Analizza e archivia",
    archiveError:
      "Non sono riuscito ad archiviare il documento. Controlla il server e riprova.",
    analyzingAttachment: "Analisi IA dell’allegato…",
    possibleMatch: "Possibile collegamento trovato",
    matchReasons: "Motivi",
    linkSelected: "Collega al documento selezionato",
    saveAsNew: "Salva come nuovo documento",
    chooseDocument: "Scegli il documento",
    noMatchFound: "Nessun collegamento sicuro trovato.",
    matchVeryHigh: "Corrispondenza molto alta",
    matchHigh: "Corrispondenza alta",
    matchMedium: "Corrispondenza possibile",
    paidProgress: "Pagato",
    dashboardToPay: "Da pagare",
    dashboardPartial: "Parzialmente pagati",
    dashboardExpiring: "In scadenza",
    dashboardPaid: "Pagati",
    dashboardOutstanding: "Totale ancora da pagare",
    smartSearchHint: "Scrivi una frase e premi Invio per la ricerca IA",
    searchingWithAi: "Ricerca IA in corso…",
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
    openDocument: "Open document",
    downloadDocument: "Download",
    fileUnavailable: "The file is not available in Storage yet.",
    attachments: "Attachments",
    addAttachment: "Add receipt/attachment",
    noAttachments: "No linked attachments.",
    attachmentTitle: "Attachment title",
    attachmentType: "Attachment type",
    paymentDate: "Payment date",
    amount: "Amount",
    paymentMethod: "Payment method",
    notes: "Notes",
    saveAttachment: "Save attachment",
    savingAttachment: "Saving…",
    deleteAttachmentConfirm: "Do you want to delete this attachment?",
    paymentStatus: "Status",
    statusUpdated: "Status updated",
    statuses: {
      "Da pagare": "To pay",
      "Parzialmente pagato": "Partially paid",
      Pagato: "Paid",
      Scaduto: "Overdue",
      Contestato: "Disputed",
    },
    expiresOn: "Expires on",
    noDocuments: "No documents found",
    noDocumentsHelp: "Try another search or upload a new file.",
    uploadTitle: "Upload a document",
    uploadDescription:
      "The document is analyzed by AI and saved privately in your DocuMio archive.",
    chooseFile: "Choose a PDF or photo",
    fileFormats: "PDF, JPG or PNG",
    optionalNote: "Optional note",
    notePlaceholder: "For example: cardiology visit on May 12…",
    expiryDate: "Expiry or appointment date",
    organizing: "Organizing…",
    analyzeAndArchive: "Analyze and archive",
    archiveError:
      "I couldn’t archive the document. Check the server and try again.",
    analyzingAttachment: "AI attachment analysis…",
    possibleMatch: "Possible link found",
    matchReasons: "Reasons",
    linkSelected: "Link to selected document",
    saveAsNew: "Save as a new document",
    chooseDocument: "Choose document",
    noMatchFound: "No reliable match found.",
    matchVeryHigh: "Very high match",
    matchHigh: "High match",
    matchMedium: "Possible match",
    paidProgress: "Paid",
    dashboardToPay: "To pay",
    dashboardPartial: "Partially paid",
    dashboardExpiring: "Expiring",
    dashboardPaid: "Paid",
    dashboardOutstanding: "Total still to pay",
    smartSearchHint: "Type a sentence and press Enter for AI search",
    searchingWithAi: "AI search in progress…",
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

function isExpiringWithin30Days(document: StoredDocument) {
  if (!document.expiryDate) return false;
  if (document.paymentStatus === "Pagato") return false;

  const expiry = new Date(`${document.expiryDate}T23:59:59`).getTime();
  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

  return expiry >= now && expiry <= thirtyDaysFromNow;
}

function getPaidTotal(items: DocumentAttachment[]) {
  return items
    .filter((item) =>
      ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachmentType),
    )
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);
}

function getMatchLabel(confidence: number, language: Language) {
  if (confidence >= 85) {
    return language === "it"
      ? "Corrispondenza molto alta"
      : "Very high match";
  }

  if (confidence >= 65) {
    return language === "it" ? "Corrispondenza alta" : "High match";
  }

  return language === "it"
    ? "Corrispondenza possibile"
    : "Possible match";
}

function getDisplayedPaymentStatus(document: StoredDocument): PaymentStatus {
  if (
    document.paymentStatus === "Da pagare" &&
    document.expiryDate &&
    new Date(`${document.expiryDate}T23:59:59`).getTime() < Date.now()
  ) {
    return "Scaduto";
  }

  return document.paymentStatus ?? "Da pagare";
}


const searchStopWords = new Set([
  "a", "al", "alla", "alle", "allo", "anche", "che", "chi", "con", "da",
  "dal", "dalla", "delle", "dei", "del", "di", "dove", "e", "è", "gli",
  "il", "in", "io", "la", "le", "lo", "mi", "mio", "nel", "nella", "per",
  "qual", "quale", "sono", "trovami", "trova", "un", "una",
  "and", "find", "for", "in", "is", "me", "my", "of", "show", "the", "where",
]);

const searchSynonyms: Record<string, string[]> = {
  solare: ["fotovoltaico", "pannelli", "impianto", "batterie", "accumulo"],
  solari: ["fotovoltaico", "pannelli", "impianto", "batterie", "accumulo"],
  pannelli: ["fotovoltaico", "solare", "impianto"],
  fotovoltaico: ["pannelli", "solare", "impianto", "accumulo"],
  contatto: ["telefono", "email", "pec", "referente", "azienda"],
  numero: ["telefono", "cellulare", "contatto"],
  bolletta: ["fattura", "utenza", "pagamento"],
  bollette: ["fatture", "utenze", "pagamenti"],
  macchina: ["auto", "veicolo", "automobile"],
  auto: ["macchina", "veicolo", "automobile"],
  assicurazione: ["polizza", "rca", "copertura"],
  pagamento: ["ricevuta", "quietanza", "pagato", "versamento"],
  contratto: ["accordo", "ordine", "fornitura", "modulo"],
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9€@._-]+/g, " ")
    .trim();
}

function getSearchTokens(value: string) {
  const baseTokens = normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !searchStopWords.has(token));

  return Array.from(
    new Set(
      baseTokens.flatMap((token) => [
        token,
        ...(searchSynonyms[token] ?? []),
      ]),
    ),
  );
}

function getDocumentSearchScore(
  document: StoredDocument,
  queryValue: string,
  translatedCategory: string,
  documentAttachments: DocumentAttachment[],
) {
  const tokens = getSearchTokens(queryValue);
  if (!tokens.length) return 1;

  const title = normalizeSearchText(document.title);
  const keywords = normalizeSearchText(document.keywords.join(" "));
  const summary = normalizeSearchText(document.summary);
  const attachmentText = normalizeSearchText(
    documentAttachments
      .map((item) =>
        `${item.title} ${item.attachmentType} ${item.fileName} ${item.paymentMethod ?? ""} ${item.notes ?? ""}`,
      )
      .join(" "),
  );
  const completeText = normalizeSearchText(
    `${document.title} ${document.fileName} ${document.summary} ${document.keywords.join(" ")} ${document.category} ${translatedCategory} ${attachmentText}`,
  );

  let score = 0;

  for (const token of tokens) {
    if (title.includes(token)) score += 8;
    if (keywords.includes(token)) score += 6;
    if (summary.includes(token)) score += 3;
    if (attachmentText.includes(token)) score += 3;
    if (completeText.includes(token)) score += 1;
  }

  const normalizedQuery = normalizeSearchText(queryValue);
  if (title.includes(normalizedQuery)) score += 15;
  if (completeText.includes(normalizedQuery)) score += 5;

  return score;
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
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<ActiveCategory>("Tutti");
  const [showUpload, setShowUpload] = useState(false);
  const [attachmentDocument, setAttachmentDocument] =
    useState<StoredDocument | null>(null);
  const [attachments, setAttachments] = useState<
    Record<string, DocumentAttachment[]>
  >({});
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
        storagePath: item.storage_path ?? null,
        paymentStatus: (item.payment_status ?? "Da pagare") as PaymentStatus,
        paidAt: item.paid_at ?? null,
        paidAmount: item.paid_amount ?? null,
        paymentMethod: item.payment_method ?? null,
        totalAmount: item.total_amount ?? null,
        installmentCount: item.installment_count ?? null,
        isSinglePaymentOption: item.is_single_payment_option ?? false,
      }));

      setDocuments(loadedDocuments);

      const { data: attachmentRows, error: attachmentError } = await supabase
        .from("document_attachments")
        .select("*")
        .eq("user_id", userId)
        .order("uploaded_at", { ascending: false });

      if (attachmentError) {
        alert(attachmentError.message);
      } else {
        const grouped = (attachmentRows ?? []).reduce<
          Record<string, DocumentAttachment[]>
        >((result, item) => {
          const attachment: DocumentAttachment = {
            id: item.id,
            documentId: item.document_id,
            title: item.title,
            attachmentType: item.attachment_type,
            fileName: item.file_name,
            storagePath: item.storage_path,
            uploadedAt: item.uploaded_at,
            paymentDate: item.payment_date,
            amount: item.amount,
            paymentMethod: item.payment_method,
            notes: item.notes,
          };

          result[attachment.documentId] = [
            ...(result[attachment.documentId] ?? []),
            attachment,
          ];

          return result;
        }, {});

        setAttachments(grouped);
      }

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

  const dashboard = useMemo(() => {
    const toPay = documents.filter(
      (document) => getDisplayedPaymentStatus(document) === "Da pagare",
    );
    const partial = documents.filter(
      (document) => document.paymentStatus === "Parzialmente pagato",
    );
    const expiring = documents.filter((document) =>
      isExpiringWithin30Days(document),
    );
    const paid = documents.filter(
      (document) => document.paymentStatus === "Pagato",
    );

    const outstandingTotal = documents.reduce((total, document) => {
      if (document.paymentStatus === "Pagato") return total;

      const documentTotal = Number(document.totalAmount);
      const alreadyPaid = Number(document.paidAmount) || 0;

      if (!Number.isFinite(documentTotal) || documentTotal <= 0) {
        return total;
      }

      return total + Math.max(0, documentTotal - alreadyPaid);
    }, 0);

    return {
      toPayCount: toPay.length,
      partialCount: partial.length,
      expiringCount: expiring.length,
      paidCount: paid.length,
      outstandingTotal,
    };
  }, [documents]);

  const expiringCount = dashboard.expiringCount;

  async function runAiSearch() {
    const cleanQuery = query.trim();

    if (!cleanQuery || aiSearching) {
      setAiResultIds(null);
      return;
    }

    setAiSearching(true);
    setActiveCategory("Tutti");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: cleanQuery,
          language,
          documents: documents.map((document) => ({
            id: document.id,
            title: document.title,
            fileName: document.fileName,
            category: document.category,
            summary: document.summary,
            keywords: document.keywords,
            expiryDate: document.expiryDate,
            paymentStatus: document.paymentStatus,
            totalAmount: document.totalAmount,
            paidAmount: document.paidAmount,
            attachments: (attachments[document.id] ?? []).map((item) => ({
              title: item.title,
              type: item.attachmentType,
              fileName: item.fileName,
              paymentMethod: item.paymentMethod,
              notes: item.notes,
            })),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      setAiResultIds(
        Array.isArray(data.documentIds) ? data.documentIds : [],
      );
    } catch (error) {
      console.error("AI search failed:", error);
      setAiResultIds(null);
    } finally {
      setAiSearching(false);
    }
  }

  const filtered = useMemo(() => {
    const hasQuery = query.trim().length > 0;

    const rankedDocuments = documents
      .map((document) => {
        const translatedCategory =
          t.categories[document.category] ?? document.category;

        return {
          document,
          score: hasQuery
            ? getDocumentSearchScore(
                document,
                query,
                translatedCategory,
                attachments[document.id] ?? [],
              )
            : 1,
        };
      })
      .filter(({ document, score }) => {
        if (hasQuery) {
          if (aiResultIds) {
            return aiResultIds.includes(document.id);
          }

          return score > 0;
        }

        return (
          activeCategory === "Tutti" ||
          (activeCategory === "In scadenza" &&
            isExpiringWithin30Days(document)) ||
          (activeCategory === "Da pagare" &&
            getDisplayedPaymentStatus(document) === "Da pagare") ||
          (activeCategory === "Parzialmente pagato" &&
            document.paymentStatus === "Parzialmente pagato") ||
          (activeCategory === "Pagato" &&
            document.paymentStatus === "Pagato") ||
          document.category === activeCategory
        );
      });

    if (hasQuery) {
      if (aiResultIds) {
        return rankedDocuments
          .sort(
            (a, b) =>
              aiResultIds.indexOf(a.document.id) -
              aiResultIds.indexOf(b.document.id),
          )
          .map(({ document }) => document);
      }

      return rankedDocuments
        .sort((a, b) => b.score - a.score)
        .map(({ document }) => document);
    }

    return rankedDocuments.map(({ document }) => document);
  }, [
    documents,
    query,
    activeCategory,
    t,
    attachments,
    aiResultIds,
  ]);

  async function deleteDocument(id: string) {
    const confirmed = window.confirm(t.deleteConfirm);
    if (!confirmed) return;

    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !currentUser) {
      alert(t.invalidSession);
      return;
    }

    const documentToDelete = documents.find((document) => document.id === id);

    if (documentToDelete?.storagePath) {
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([documentToDelete.storagePath]);

      if (storageError) {
        alert(storageError.message);
        return;
      }
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

  async function updatePaymentStatus(
    document: StoredDocument,
    paymentStatus: PaymentStatus,
    paymentDetails?: {
      paidAt?: string | null;
      paidAmount?: number | null;
      paymentMethod?: string | null;
    },
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const updateData: {
      payment_status: PaymentStatus;
      paid_at?: string | null;
      paid_amount?: number | null;
      payment_method?: string | null;
    } = {
      payment_status: paymentStatus,
    };

    if (
      paymentStatus === "Pagato" ||
      paymentStatus === "Parzialmente pagato"
    ) {
      updateData.paid_at =
        paymentDetails?.paidAt ?? document.paidAt ?? new Date().toISOString().slice(0, 10);
      updateData.paid_amount =
        paymentDetails?.paidAmount ?? document.paidAmount ?? null;
      updateData.payment_method =
        paymentDetails?.paymentMethod ?? document.paymentMethod ?? null;
    } else {
      updateData.paid_at = null;
      updateData.paid_amount = null;
      updateData.payment_method = null;
    }

    const { error } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", document.id);

    if (error) {
      alert(error.message);
      return;
    }

    setDocuments((current) =>
      current.map((item) =>
        item.id === document.id
          ? {
              ...item,
              paymentStatus,
              paidAt: updateData.paid_at ?? null,
              paidAmount: updateData.paid_amount ?? null,
              paymentMethod: updateData.payment_method ?? null,
            }
          : item,
      ),
    );
  }

  async function openDocument(document: StoredDocument, download = false) {
    if (!document.storagePath) {
      alert(t.fileUnavailable);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(document.storagePath, 60, {
        download: download ? document.fileName : false,
      });

    if (error || !data?.signedUrl) {
      alert(error?.message || t.fileUnavailable);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function openAttachment(
    attachment: DocumentAttachment,
    download = false,
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(attachment.storagePath, 60, {
        download: download ? attachment.fileName : false,
      });

    if (error || !data?.signedUrl) {
      alert(error?.message || t.fileUnavailable);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteAttachment(attachment: DocumentAttachment) {
    if (!window.confirm(t.deleteAttachmentConfirm)) return;

    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const { error: storageError } = await supabase.storage
      .from("documents")
      .remove([attachment.storagePath]);

    if (storageError) {
      alert(storageError.message);
      return;
    }

    const { error } = await supabase
      .from("document_attachments")
      .delete()
      .eq("id", attachment.id);

    if (error) {
      alert(error.message);
      return;
    }

    setAttachments((current) => ({
      ...current,
      [attachment.documentId]: (current[attachment.documentId] ?? []).filter(
        (item) => item.id !== attachment.id,
      ),
    }));
  }

  async function recalculateDocumentPaymentStatus(
    document: StoredDocument,
    allAttachments: DocumentAttachment[],
    inferredTotalAmount?: number | null,
    inferredInstallmentCount?: number | null,
    inferredSinglePaymentOption?: boolean,
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const paidTotal = getPaidTotal(allAttachments);
    const totalAmount =
      Number(document.totalAmount) > 0
        ? Number(document.totalAmount)
        : Number(inferredTotalAmount) > 0
          ? Number(inferredTotalAmount)
          : null;

    let paymentStatus: PaymentStatus = document.paymentStatus ?? "Da pagare";

    if (totalAmount != null) {
      const tolerance = 0.01;
      if (paidTotal + tolerance >= totalAmount) {
        paymentStatus = "Pagato";
      } else if (paidTotal > 0) {
        paymentStatus = "Parzialmente pagato";
      } else {
        paymentStatus = "Da pagare";
      }
    } else if (paidTotal > 0) {
      // Senza un totale certo non dichiariamo saldato l'intero documento.
      paymentStatus = "Parzialmente pagato";
    }

    const latestPayment = [...allAttachments]
      .filter((item) =>
        ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachmentType),
      )
      .sort((a, b) =>
        String(b.paymentDate ?? b.uploadedAt).localeCompare(
          String(a.paymentDate ?? a.uploadedAt),
        ),
      )[0];

    const updateData = {
      payment_status: paymentStatus,
      paid_at: latestPayment?.paymentDate ?? null,
      paid_amount: paidTotal || null,
      payment_method: latestPayment?.paymentMethod ?? null,
      total_amount: totalAmount,
      installment_count:
        document.installmentCount ??
        inferredInstallmentCount ??
        null,
      is_single_payment_option:
        document.isSinglePaymentOption ??
        inferredSinglePaymentOption ??
        false,
    };

    const { error } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", document.id);

    if (error) {
      alert(error.message);
      return;
    }

    setDocuments((current) =>
      current.map((item) =>
        item.id === document.id
          ? {
              ...item,
              paymentStatus,
              paidAt: updateData.paid_at,
              paidAmount: updateData.paid_amount,
              paymentMethod: updateData.payment_method,
              totalAmount,
              installmentCount: updateData.installment_count,
              isSinglePaymentOption: updateData.is_single_payment_option,
            }
          : item,
      ),
    );
  }

  async function saveAttachment(
    document: StoredDocument,
    attachment: Omit<DocumentAttachment, "id" | "uploadedAt" | "storagePath">,
    file: File,
    analysisMeta?: {
      documentTotalAmount?: number | null;
      installmentCount?: number | null;
      isSinglePaymentOption?: boolean;
    },
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert(t.invalidSession);
      return;
    }

    const safeName = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-");

    const storagePath = `${user.id}/allegati/${document.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      alert(uploadError.message);
      return;
    }

    const { data, error } = await supabase
      .from("document_attachments")
      .insert({
        document_id: document.id,
        user_id: user.id,
        title: attachment.title,
        attachment_type: attachment.attachmentType,
        file_name: file.name,
        storage_path: storagePath,
        payment_date: attachment.paymentDate || null,
        amount: attachment.amount ?? null,
        payment_method: attachment.paymentMethod || null,
        notes: attachment.notes || null,
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from("documents").remove([storagePath]);
      alert(error.message);
      return;
    }

    const savedAttachment: DocumentAttachment = {
      id: data.id,
      documentId: data.document_id,
      title: data.title,
      attachmentType: data.attachment_type,
      fileName: data.file_name,
      storagePath: data.storage_path,
      uploadedAt: data.uploaded_at,
      paymentDate: data.payment_date,
      amount: data.amount,
      paymentMethod: data.payment_method,
      notes: data.notes,
    };

    setAttachments((current) => ({
      ...current,
      [document.id]: [savedAttachment, ...(current[document.id] ?? [])],
    }));

    if (
      ["Ricevuta", "Quietanza", "Pagamento"].includes(
        savedAttachment.attachmentType,
      )
    ) {
      await recalculateDocumentPaymentStatus(
        document,
        [savedAttachment, ...(attachments[document.id] ?? [])],
        analysisMeta?.documentTotalAmount,
        analysisMeta?.installmentCount,
        analysisMeta?.isSinglePaymentOption,
      );
    }

    setAttachmentDocument(null);
  }

  async function saveDocument(doc: StoredDocument, file: File) {
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

    const safeName = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-");

    const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      alert(uploadError.message);
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
        storage_path: storagePath,
        payment_status: doc.paymentStatus ?? "Da pagare",
        paid_at: doc.paidAt ?? null,
        paid_amount: doc.paidAmount ?? null,
        payment_method: doc.paymentMethod ?? null,
        total_amount: doc.totalAmount ?? null,
        installment_count: doc.installmentCount ?? null,
        is_single_payment_option: doc.isSinglePaymentOption ?? false,
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from("documents").remove([storagePath]);
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
      storagePath: data.storage_path ?? storagePath,
      paymentStatus: (data.payment_status ?? "Da pagare") as PaymentStatus,
      paidAt: data.paid_at ?? null,
      paidAmount: data.paid_amount ?? null,
      paymentMethod: data.payment_method ?? null,
      totalAmount: data.total_amount ?? null,
      installmentCount: data.installment_count ?? null,
      isSinglePaymentOption: data.is_single_payment_option ?? false,
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
          onChange={(event) => {
            setQuery(event.target.value);
            setAiResultIds(null);
            if (event.target.value.trim()) {
              setActiveCategory("Tutti");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runAiSearch();
            }
          }}
          placeholder={t.searchPlaceholder}
        />
        <button
          type="button"
          onClick={() => void runAiSearch()}
          disabled={!query.trim() || aiSearching}
          title={t.smartSearchHint}
          style={{
            border: 0,
            background: "transparent",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {aiSearching ? "…" : "IA"}
        </button>
      </section>

      {query.trim() && (
        <div
          style={{
            maxWidth: 1400,
            margin: "-10px auto 18px",
            padding: "0 24px",
            color: "#64748b",
            fontSize: 13,
          }}
        >
          {aiSearching ? t.searchingWithAi : t.smartSearchHint}
        </div>
      )}

      <section
        style={{
          maxWidth: 1400,
          margin: "0 auto 26px",
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {[
          {
            label: t.dashboardToPay,
            value: dashboard.toPayCount,
            filter: "Da pagare" as ActiveCategory,
            icon: "🟠",
          },
          {
            label: t.dashboardPartial,
            value: dashboard.partialCount,
            filter: "Parzialmente pagato" as ActiveCategory,
            icon: "🟡",
          },
          {
            label: t.dashboardExpiring,
            value: dashboard.expiringCount,
            filter: "In scadenza" as ActiveCategory,
            icon: "🔴",
          },
          {
            label: t.dashboardPaid,
            value: dashboard.paidCount,
            filter: "Pagato" as ActiveCategory,
            icon: "🟢",
          },
        ].map((item) => (
          <button
            type="button"
            key={item.label}
            onClick={() => {
              setQuery("");
              setAiResultIds(null);
              setActiveCategory(item.filter);
            }}
            style={{
              textAlign: "left",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              background: "#ffffff",
              padding: 18,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ fontSize: 22 }}>{item.icon}</div>
            <strong style={{ display: "block", marginTop: 8 }}>
              {item.label}
            </strong>
            <span style={{ fontSize: 28, fontWeight: 800 }}>{item.value}</span>
          </button>
        ))}

        <div
          style={{
            border: "1px solid #c7d2fe",
            borderRadius: 18,
            background: "linear-gradient(135deg, #eef2ff, #ffffff)",
            padding: 18,
            boxShadow: "0 10px 30px rgba(79, 70, 229, 0.08)",
          }}
        >
          <div style={{ fontSize: 22 }}>💶</div>
          <strong style={{ display: "block", marginTop: 8 }}>
            {t.dashboardOutstanding}
          </strong>
          <span style={{ fontSize: 28, fontWeight: 800 }}>
            {new Intl.NumberFormat(
              language === "it" ? "it-IT" : "en-GB",
              { style: "currency", currency: "EUR" },
            ).format(dashboard.outstandingTotal)}
          </span>
        </div>
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
                    : activeCategory === "Da pagare"
                      ? t.dashboardToPay
                      : activeCategory === "Parzialmente pagato"
                        ? t.dashboardPartial
                        : activeCategory === "Pagato"
                          ? t.dashboardPaid
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

                {doc.expiryDate && doc.paymentStatus !== "Pagato" && (
                  <span className="expiry-date">
                    {t.expiresOn} {" "}
                    {new Date(
                      `${doc.expiryDate}T12:00:00`,
                    ).toLocaleDateString(language === "it" ? "it-IT" : "en-GB")}
                  </span>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 12,
                  }}
                >
                  <strong>{t.paymentStatus}:</strong>
                  <select
                    value={getDisplayedPaymentStatus(doc)}
                    onChange={(event) =>
                      updatePaymentStatus(
                        doc,
                        event.target.value as PaymentStatus,
                      )
                    }
                    aria-label={`${t.paymentStatus} ${doc.title}`}
                  >
                    <option value="Da pagare">
                      {t.statuses["Da pagare"]}
                    </option>
                    <option value="Parzialmente pagato">
                      {t.statuses["Parzialmente pagato"]}
                    </option>
                    <option value="Pagato">{t.statuses.Pagato}</option>
                    <option value="Scaduto">{t.statuses.Scaduto}</option>
                    <option value="Contestato">{t.statuses.Contestato}</option>
                  </select>

                  {["Pagato", "Parzialmente pagato"].includes(
                    doc.paymentStatus ?? "",
                  ) && doc.paidAt && (
                    <span style={{ fontSize: 13 }}>
                      {new Date(`${doc.paidAt}T12:00:00`).toLocaleDateString(
                        language === "it" ? "it-IT" : "en-GB",
                      )}
                      {doc.paidAmount != null
                        ? ` · €${Number(doc.paidAmount).toFixed(2)}`
                        : ""}
                      {doc.totalAmount != null
                        ? ` su €${Number(doc.totalAmount).toFixed(2)}`
                        : ""}
                      {doc.paymentMethod ? ` · ${doc.paymentMethod}` : ""}
                    </span>
                  )}
                </div>

                {doc.storagePath && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 12,
                    }}
                  >
                    <button type="button" onClick={() => openDocument(doc)}>
                      {t.openDocument}
                    </button>
                    <button type="button" onClick={() => openDocument(doc, true)}>
                      {t.downloadDocument}
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <strong>
                      📎 {t.attachments} ({(attachments[doc.id] ?? []).length})
                    </strong>
                    <button
                      type="button"
                      onClick={() => setAttachmentDocument(doc)}
                    >
                      {t.addAttachment}
                    </button>
                  </div>

                  {(attachments[doc.id] ?? []).length === 0 ? (
                    <p style={{ marginTop: 8 }}>{t.noAttachments}</p>
                  ) : (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {(attachments[doc.id] ?? []).map((attachment) => (
                        <div
                          key={attachment.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 12,
                            padding: 10,
                          }}
                        >
                          <strong>{attachment.title}</strong>
                          <div style={{ fontSize: 13, marginTop: 4 }}>
                            {attachment.attachmentType}
                            {attachment.paymentDate
                              ? ` · ${new Date(
                                  `${attachment.paymentDate}T12:00:00`,
                                ).toLocaleDateString(
                                  language === "it" ? "it-IT" : "en-GB",
                                )}`
                              : ""}
                            {attachment.amount != null
                              ? ` · €${Number(attachment.amount).toFixed(2)}`
                              : ""}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 8,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => openAttachment(attachment)}
                            >
                              {t.openDocument}
                            </button>
                            <button
                              type="button"
                              onClick={() => openAttachment(attachment, true)}
                            >
                              {t.downloadDocument}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAttachment(attachment)}
                            >
                              {t.delete}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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

      {attachmentDocument && (
        <AttachmentModal
          language={language}
          document={attachmentDocument}
          onClose={() => setAttachmentDocument(null)}
          onSaved={saveAttachment}
        />
      )}

      {showUpload && (
        <UploadModal
          language={language}
          documents={documents}
          onClose={() => setShowUpload(false)}
          onSaved={saveDocument}
          onLinkedAttachment={saveAttachment}
        />
      )}
    </main>
  );
}

function AttachmentModal({
  language,
  document,
  onClose,
  onSaved,
}: {
  language: Language;
  document: StoredDocument;
  onClose: () => void;
  onSaved: (
    document: StoredDocument,
    attachment: Omit<
      DocumentAttachment,
      "id" | "uploadedAt" | "storagePath"
    >,
    file: File,
  ) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [attachmentType, setAttachmentType] =
    useState<DocumentAttachment["attachmentType"]>("Ricevuta");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const t = translations[language];

  async function analyzeSelectedFile(selectedFile: File) {
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("language", language);
      formData.append("mode", "attachment");
      formData.append(
        "candidateDocuments",
        JSON.stringify([
          {
            id: document.id,
            title: document.title,
            category: document.category,
            summary: document.summary,
            keywords: document.keywords,
            expiryDate: document.expiryDate,
            paymentStatus: document.paymentStatus,
            paidAmount: document.paidAmount,
          },
        ]),
      );

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      setTitle(data.title || selectedFile.name);
      setAttachmentType(data.attachmentType || "Altro");
      setPaymentDate(data.paymentDate || "");
      setAmount(data.amount != null ? String(data.amount) : "");
      setPaymentMethod(data.paymentMethod || "");
      setNotes(data.notes || data.summary || "");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t.archiveError);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit() {
    if (!file || !title.trim() || loading || analyzing) return;

    setLoading(true);

    try {
      await onSaved(
        document,
        {
          documentId: document.id,
          title: title.trim(),
          attachmentType,
          fileName: file.name,
          paymentDate: paymentDate || null,
          amount: amount ? Number(amount.replace(",", ".")) : null,
          paymentMethod: paymentMethod.trim() || null,
          notes: notes.trim() || null,
        },
        file,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" onClick={onClose}>
          <X />
        </button>

        <h2>{t.addAttachment}</h2>
        <p>{document.title}</p>

        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0] || null;
              setFile(selectedFile);
              if (selectedFile) void analyzeSelectedFile(selectedFile);
            }}
          />
          <Upload size={28} />
          <strong>{file ? file.name : t.chooseFile}</strong>
          <span>{analyzing ? t.analyzingAttachment : t.fileFormats}</span>
        </label>

        <label className="field">
          {t.attachmentTitle}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field">
          {t.attachmentType}
          <select
            value={attachmentType}
            onChange={(event) =>
              setAttachmentType(
                event.target.value as DocumentAttachment["attachmentType"],
              )
            }
          >
            <option>Ricevuta</option>
            <option>Quietanza</option>
            <option>Pagamento</option>
            <option>Sollecito</option>
            <option>Comunicazione</option>
            <option>Altro</option>
          </select>
        </label>

        <label className="field">
          {t.paymentDate}
          <input
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
        </label>

        <label className="field">
          {t.amount}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
          />
        </label>

        <label className="field">
          {t.paymentMethod}
          <input
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
          />
        </label>

        <label className="field">
          {t.notes}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        <button
          className="primary full"
          disabled={!file || !title.trim() || loading || analyzing}
          onClick={submit}
        >
          {loading
            ? t.savingAttachment
            : analyzing
              ? t.analyzingAttachment
              : t.saveAttachment}
        </button>
      </div>
    </div>
  );
}

function UploadModal({
  language,
  documents,
  onClose,
  onSaved,
  onLinkedAttachment,
}: {
  language: Language;
  documents: StoredDocument[];
  onClose: () => void;
  onSaved: (doc: StoredDocument, file: File) => void | Promise<void>;
  onLinkedAttachment: (
    document: StoredDocument,
    attachment: Omit<
      DocumentAttachment,
      "id" | "uploadedAt" | "storagePath"
    >,
    file: File,
    analysisMeta?: {
      documentTotalAmount?: number | null;
      installmentCount?: number | null;
      isSinglePaymentOption?: boolean;
    },
  ) => void | Promise<void>;
}) {
  type SmartAnalysis = {
    title: string;
    category: DocumentCategory;
    summary: string;
    keywords: string[];
    expiryDate: string | null;
    isAttachment: boolean;
    attachmentType: DocumentAttachment["attachmentType"];
    paymentDate: string | null;
    amount: number | null;
    paymentMethod: string | null;
    notes: string;
    documentTotalAmount: number | null;
    installmentCount: number | null;
    isSinglePaymentOption: boolean;
    suggestedDocumentId: string | null;
    matchConfidence: number;
    matchReasons: string[];
  };

  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<SmartAnalysis | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const t = translations[language];

  const candidateDocuments = documents.map((document) => ({
    id: document.id,
    title: document.title,
    category: document.category,
    summary: document.summary,
    keywords: document.keywords,
    expiryDate: document.expiryDate,
    paymentStatus: document.paymentStatus,
    paidAt: document.paidAt,
    paidAmount: document.paidAmount,
    paymentMethod: document.paymentMethod,
    totalAmount: document.totalAmount,
    installmentCount: document.installmentCount,
    isSinglePaymentOption: document.isSinglePaymentOption,
  }));

  async function analyze() {
    if (!file || loading) return;

    setLoading(true);

    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(
          language === "it"
            ? "Il file supera 4 MB. Scegli un file più piccolo."
            : "The file is larger than 4 MB. Choose a smaller file.",
        );
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("userNote", note);
      formData.append("language", language);
      formData.append("mode", "document");
      formData.append(
        "candidateDocuments",
        JSON.stringify(candidateDocuments),
      );

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as SmartAnalysis & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      if (data.isAttachment && documents.length > 0) {
        const suggestedExists = documents.some(
          (document) => document.id === data.suggestedDocumentId,
        );

        setAnalysis(data);
        setSelectedDocumentId(
          suggestedExists
            ? data.suggestedDocumentId || ""
            : documents[0]?.id || "",
        );
        return;
      }

      await saveAsNewDocument(data);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t.archiveError);
    } finally {
      setLoading(false);
    }
  }

  async function saveAsNewDocument(data = analysis) {
    if (!file || !data) return;

    await onSaved(
      {
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
        storagePath: null,
        paymentStatus: "Da pagare",
        paidAt: null,
        paidAmount: null,
        paymentMethod: null,
        totalAmount: data.documentTotalAmount ?? null,
        installmentCount: data.installmentCount ?? null,
        isSinglePaymentOption: data.isSinglePaymentOption ?? false,
      },
      file,
    );
  }

  async function linkToSelectedDocument() {
    if (!file || !analysis || !selectedDocumentId) return;

    const selectedDocument = documents.find(
      (document) => document.id === selectedDocumentId,
    );

    if (!selectedDocument) return;

    setLoading(true);

    try {
      await onLinkedAttachment(
        selectedDocument,
        {
          documentId: selectedDocument.id,
          title: analysis.title || file.name,
          attachmentType: analysis.attachmentType || "Altro",
          fileName: file.name,
          paymentDate: analysis.paymentDate || null,
          amount: analysis.amount ?? null,
          paymentMethod: analysis.paymentMethod || null,
          notes: analysis.notes || analysis.summary || null,
        },
        file,
        {
          documentTotalAmount: analysis.documentTotalAmount,
          installmentCount: analysis.installmentCount,
          isSinglePaymentOption: analysis.isSinglePaymentOption,
        },
      );
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (analysis?.isAttachment) {
    const suggestedDocument = documents.find(
      (document) => document.id === analysis.suggestedDocumentId,
    );

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

          <h2>{t.possibleMatch}</h2>
          <p>
            <strong>{analysis.title}</strong>
          </p>

          {suggestedDocument ? (
            <div
              style={{
                border: "1px solid #dbeafe",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <strong>{suggestedDocument.title}</strong>
              <div style={{ marginTop: 6 }}>
                {getMatchLabel(analysis.matchConfidence, language)}
                {" · "}
                {Math.round(
                  analysis.matchConfidence <= 1
                    ? analysis.matchConfidence * 100
                    : analysis.matchConfidence,
                )}
                %
                {analysis.matchReasons.length > 0
                  ? ` · ${analysis.matchReasons.slice(0, 3).join(" · ")}`
                  : ""}
              </div>
            </div>
          ) : (
            <p>{t.noMatchFound}</p>
          )}

          <label className="field">
            {t.chooseDocument}
            <select
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
            >
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary full"
            disabled={!selectedDocumentId || loading}
            onClick={linkToSelectedDocument}
          >
            {t.linkSelected}
          </button>

          <button
            type="button"
            style={{ width: "100%", marginTop: 10 }}
            disabled={loading}
            onClick={() => saveAsNewDocument()}
          >
            {t.saveAsNew}
          </button>
        </div>
      </div>
    );
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
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setAnalysis(null);
            }}
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
