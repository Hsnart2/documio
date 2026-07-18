"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bell,
  Bot,
  Settings,
  Trash2,
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
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Upload,
  CheckCheck,
  Mail,
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
  assistantTitle: string;
  assistantWelcome: string;
  assistantPlaceholder: string;
  assistantSend: string;
  assistantThinking: string;
  assistantOpenDocument: string;
  assistantError: string;
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
    assistantTitle: "DocuMio Assistant",
    assistantWelcome:
      "Ciao! Posso rispondere usando i dati già estratti dai tuoi documenti.",
    assistantPlaceholder: "Chiedi qualcosa al tuo archivio…",
    assistantSend: "Invia",
    assistantThinking: "Sto controllando i documenti…",
    assistantOpenDocument: "Apri documento",
    assistantError: "Non sono riuscito a rispondere. Riprova.",
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
    assistantTitle: "DocuMio Assistant",
    assistantWelcome:
      "Hi! I can answer using the information already extracted from your documents.",
    assistantPlaceholder: "Ask your archive something…",
    assistantSend: "Send",
    assistantThinking: "Checking your documents…",
    assistantOpenDocument: "Open document",
    assistantError: "I couldn’t answer. Please try again.",
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

type PaymentSnapshot = {
  status: PaymentStatus;
  totalAmount: number | null;
  paidAmount: number;
  remainingAmount: number | null;
  paidInstallments: number;
  lastPaymentDate: string | null;
};

function getPaidTotal(items: DocumentAttachment[]) {
  return items
    .filter((item) =>
      ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachmentType),
    )
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);
}

function getPaymentSnapshot(
  document: StoredDocument,
  documentAttachments: DocumentAttachment[] = [],
): PaymentSnapshot {
  const paymentAttachments = documentAttachments.filter((item) =>
    ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachmentType),
  );
  const attachmentPaidAmount = getPaidTotal(paymentAttachments);
  const storedPaidAmount = Math.max(0, Number(document.paidAmount) || 0);
  const paidAmount = document.paymentProgressConfirmed
    ? attachmentPaidAmount
    : Math.max(storedPaidAmount, attachmentPaidAmount);
  const parsedTotalAmount = Number(document.totalAmount);
  const totalAmount =
    Number.isFinite(parsedTotalAmount) && parsedTotalAmount > 0
      ? parsedTotalAmount
      : null;
  const remainingAmount =
    totalAmount != null ? Math.max(0, totalAmount - paidAmount) : null;
  const attachmentInstallments = paymentAttachments.filter(
    (item) => (Number(item.amount) || 0) > 0,
  ).length;
  const paidInstallments = document.paymentProgressConfirmed
    ? attachmentInstallments
    : Math.max(
        Number(document.paidInstallments) || 0,
        attachmentInstallments,
      );
  const latestPayment = [...paymentAttachments].sort((a, b) =>
    String(b.paymentDate ?? b.uploadedAt).localeCompare(
      String(a.paymentDate ?? a.uploadedAt),
    ),
  )[0];
  const lastPaymentDate = document.paymentProgressConfirmed
    ? latestPayment?.paymentDate ??
      latestPayment?.uploadedAt?.slice(0, 10) ??
      null
    : document.lastPaymentDate ??
      latestPayment?.paymentDate ??
      latestPayment?.uploadedAt?.slice(0, 10) ??
      document.paidAt ??
      null;
  const isOverdue =
    Boolean(document.expiryDate) &&
    new Date(`${document.expiryDate}T23:59:59`).getTime() < Date.now();

  let status: PaymentStatus;

  if (document.paymentStatus === "Contestato") {
    status = "Contestato";
  } else if (totalAmount != null && remainingAmount != null && remainingAmount <= 0.01) {
    status = "Pagato";
  } else if (isOverdue) {
    status = "Scaduto";
  } else if (paidAmount > 0) {
    status = "Parzialmente pagato";
  } else {
    status = "Da pagare";
  }

  return {
    status,
    totalAmount,
    paidAmount,
    remainingAmount,
    paidInstallments,
    lastPaymentDate,
  };
}

function isExpiringWithin30Days(
  document: StoredDocument,
  documentAttachments: DocumentAttachment[] = [],
) {
  if (!document.expiryDate) return false;

  const status = getPaymentSnapshot(document, documentAttachments).status;
  if (status === "Pagato" || status === "Contestato") return false;

  const expiry = new Date(`${document.expiryDate}T23:59:59`).getTime();
  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

  return expiry >= now && expiry <= thirtyDaysFromNow;
}

function hasPaymentTracking(
  document: StoredDocument,
  documentAttachments: DocumentAttachment[] = [],
) {
  const snapshot = getPaymentSnapshot(document, documentAttachments);
  const hasKnownAmount =
    snapshot.totalAmount != null ||
    snapshot.paidAmount > 0 ||
    document.remainingAmount != null;

  const hasPaymentDetails = Boolean(
    document.paidAt ||
      document.lastPaymentDate ||
      document.paymentMethod ||
      document.installmentCount,
  );
  const hasPaymentAttachment = documentAttachments.some((item) =>
    ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachmentType),
  );

  return hasKnownAmount || hasPaymentDetails || hasPaymentAttachment;
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

function getDisplayedPaymentStatus(
  document: StoredDocument,
  documentAttachments: DocumentAttachment[] = [],
): PaymentStatus {
  return getPaymentSnapshot(document, documentAttachments).status;
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


async function getApiAuthHeaders(contentType?: string) {
  const supabase = getSupabaseClient();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.78),
  );
  if (!blob || blob.size >= file.size) return file;
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

function rankDocumentsForQuestion(question: string, documents: StoredDocument[], attachments: Record<string, DocumentAttachment[]>) {
  const terms = normalizeSearchText(question).split(/\s+/).filter((term) => term.length > 1);
  return [...documents]
    .map((document) => {
      const attachmentText = (attachments[document.id] ?? []).map((item) => `${item.title} ${item.fileName} ${item.notes ?? ""}`).join(" ");
      const text = normalizeSearchText(`${document.title} ${document.category} ${document.summary} ${document.keywords.join(" ")} ${attachmentText}`);
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { document, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((item) => item.document);
}

type NotificationItem = {
  id: string;
  documentId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "urgent";
  dueDate?: string | null;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  documentIds?: string[];
};

export default function Home() {
  const [language, setLanguage] = useState<Language>("it");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
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
  const [showAssistant, setShowAssistant] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<
    AssistantMessage[]
  >([]);
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

    try {
      const savedRead = JSON.parse(localStorage.getItem("documio-read-notifications") ?? "[]");
      if (Array.isArray(savedRead)) setReadNotificationIds(savedRead);
    } catch {
      setReadNotificationIds([]);
    }

    if (typeof Notification !== "undefined") {
      setBrowserNotificationsEnabled(Notification.permission === "granted");
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
        paidInstallments: item.paid_installments ?? null,
        remainingAmount: item.remaining_amount ?? null,
        lastPaymentDate: item.last_payment_date ?? null,
        paymentProgressConfirmed:
          item.payment_progress_confirmed ?? false,
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

      const { data: preference } = await supabase
        .from("notification_preferences")
        .select("email_enabled, weekly_digest_enabled, browser_enabled")
        .eq("user_id", userId)
        .maybeSingle();

      if (preference) {
        setEmailNotificationsEnabled(preference.email_enabled ?? true);
        setWeeklyDigestEnabled(preference.weekly_digest_enabled ?? true);
        setBrowserNotificationsEnabled(
          Boolean(preference.browser_enabled) &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted",
        );
      }

      setIsLoaded(true);
    }

    loadDocuments();
  }, [authReady, userId]);

  async function signUp() {
    if (!privacyAccepted) {
      alert(language === "it" ? "Per registrarti devi accettare Privacy Policy e Termini beta." : "You must accept the Privacy Policy and beta Terms to register.");
      return;
    }

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

  async function deleteAccount() {
    if (!deletePassword.trim() || deletingAccount) return;

    const supabase = getSupabaseClient();
    if (!supabase || !userEmail) return alert(t.notConfigured);

    setDeletingAccount(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: deletePassword,
      });

      if (authError) {
        alert(language === "it" ? "Password non corretta." : "Incorrect password.");
        return;
      }

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: await getApiAuthHeaders("application/json"),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || (language === "it" ? "Cancellazione non riuscita." : "Account deletion failed."));
      }

      await supabase.auth.signOut();
      localStorage.removeItem("documio-read-notifications");
      setDocuments([]);
      setAttachments({});
      setDeletePassword("");
      setShowDeleteAccount(false);
      setShowNotifications(false);
      alert(language === "it" ? "Account cancellato definitivamente." : "Account permanently deleted.");
    } catch (error) {
      alert(error instanceof Error ? error.message : (language === "it" ? "Cancellazione non riuscita." : "Account deletion failed."));
    } finally {
      setDeletingAccount(false);
    }
  }

  const dashboard = useMemo(() => {
    const toPay = documents.filter((document) => {
      const documentAttachments = attachments[document.id] ?? [];
      return (
        hasPaymentTracking(document, documentAttachments) &&
        getPaymentSnapshot(document, documentAttachments).status === "Da pagare"
      );
    });
    const partial = documents.filter((document) => {
      const documentAttachments = attachments[document.id] ?? [];
      return (
        hasPaymentTracking(document, documentAttachments) &&
        getPaymentSnapshot(document, documentAttachments).status ===
          "Parzialmente pagato"
      );
    });
    const expiring = documents.filter((document) =>
      isExpiringWithin30Days(document, attachments[document.id] ?? []),
    );
    const paid = documents.filter((document) => {
      const documentAttachments = attachments[document.id] ?? [];
      return (
        hasPaymentTracking(document, documentAttachments) &&
        getPaymentSnapshot(document, documentAttachments).status === "Pagato"
      );
    });

    const outstandingTotal = documents.reduce((total, document) => {
      const documentAttachments = attachments[document.id] ?? [];
      if (!hasPaymentTracking(document, documentAttachments)) return total;

      const snapshot = getPaymentSnapshot(document, documentAttachments);
      if (
        snapshot.status === "Pagato" ||
        snapshot.status === "Contestato" ||
        snapshot.remainingAmount == null
      ) {
        return total;
      }

      return total + snapshot.remainingAmount;
    }, 0);

    return {
      toPayCount: toPay.length,
      partialCount: partial.length,
      expiringCount: expiring.length,
      paidCount: paid.length,
      outstandingTotal,
    };
  }, [documents, attachments]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    return documents
      .flatMap((document) => {
        if (!document.expiryDate) return [];

        const due = new Date(`${document.expiryDate}T12:00:00`).getTime();
        const days = Math.ceil((due - today) / dayMs);
        const payment = hasPaymentTracking(document, attachments[document.id] ?? []);
        const paid = getPaymentSnapshot(document, attachments[document.id] ?? []).status === "Pagato";

        if (payment && paid) return [];
        if (days > 30) return [];

        const severity: NotificationItem["severity"] =
          days < 0 || days <= 1 ? "urgent" : days <= 7 ? "warning" : "info";
        const kind = payment
          ? language === "it" ? "Pagamento" : "Payment"
          : language === "it" ? "Documento" : "Document";
        const timing = days < 0
          ? language === "it" ? `scaduto da ${Math.abs(days)} giorni` : `overdue by ${Math.abs(days)} days`
          : days === 0
            ? language === "it" ? "scade oggi" : "is due today"
            : days === 1
              ? language === "it" ? "scade domani" : "is due tomorrow"
              : language === "it" ? `scade tra ${days} giorni` : `is due in ${days} days`;

        return [{
          id: `${document.id}:${document.expiryDate}:${payment ? "payment" : "document"}`,
          documentId: document.id,
          title: `${kind}: ${document.title}`,
          message: `${document.title} ${timing}.`,
          severity,
          dueDate: document.expiryDate,
        }];
      })
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [documents, attachments, language]);

  const unreadNotificationCount = notificationItems.filter(
    (item) => !readNotificationIds.includes(item.id),
  ).length;

  function markAllNotificationsRead() {
    const ids = notificationItems.map((item) => item.id);
    setReadNotificationIds(ids);
    localStorage.setItem("documio-read-notifications", JSON.stringify(ids));
  }

  async function saveNotificationPreferences(values: {
    emailEnabled?: boolean;
    weeklyDigestEnabled?: boolean;
    browserEnabled?: boolean;
  }) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;

    const nextEmail = values.emailEnabled ?? emailNotificationsEnabled;
    const nextWeekly = values.weeklyDigestEnabled ?? weeklyDigestEnabled;
    const nextBrowser = values.browserEnabled ?? browserNotificationsEnabled;

    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: userId,
      email_enabled: nextEmail,
      weekly_digest_enabled: nextWeekly,
      browser_enabled: nextBrowser,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) console.error("Notification preferences:", error.message);
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === "undefined") {
      alert(language === "it" ? "Questo browser non supporta le notifiche." : "This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setBrowserNotificationsEnabled(enabled);
    await saveNotificationPreferences({ browserEnabled: enabled });

    if (enabled) {
      new Notification("DocuMio", {
        body: language === "it" ? "Notifiche del browser attivate." : "Browser notifications enabled.",
      });
    }
  }

  useEffect(() => {
    if (!browserNotificationsEnabled || !notificationItems.length) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `documio-browser-notified-${todayKey}`;
    if (localStorage.getItem(storageKey)) return;

    const urgent = notificationItems.filter((item) => item.severity !== "info").slice(0, 3);
    if (!urgent.length) return;

    new Notification(language === "it" ? "DocuMio: scadenze importanti" : "DocuMio: important deadlines", {
      body: urgent.map((item) => item.message).join(" "),
    });
    localStorage.setItem(storageKey, "1");
  }, [browserNotificationsEnabled, notificationItems, language]);

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
        headers: await getApiAuthHeaders("application/json"),
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
            paymentStatus: getPaymentSnapshot(document, attachments[document.id] ?? []).status,
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

  async function askAssistant(question?: string) {
    const cleanQuestion = (question ?? assistantInput).trim();

    if (!cleanQuestion || assistantLoading) return;

    const userMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: cleanQuestion,
    };

    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantInput("");
    setAssistantLoading(true);

    try {
      const relevantDocuments = rankDocumentsForQuestion(cleanQuestion, documents, attachments);
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: await getApiAuthHeaders("application/json"),
        body: JSON.stringify({
          question: cleanQuestion,
          language,
          documents: relevantDocuments.map((document) => ({
            id: document.id,
            title: document.title,
            fileName: document.fileName,
            category: document.category,
            summary: document.summary,
            keywords: document.keywords,
            expiryDate: document.expiryDate,
            paymentStatus: getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).status,
            totalAmount: getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).totalAmount,
            paidAmount: getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).paidAmount,
            paymentMethod: document.paymentMethod,
            remainingAmount: getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).remainingAmount,
            attachments: (attachments[document.id] ?? []).map((item) => ({
              title: item.title,
              type: item.attachmentType,
              fileName: item.fileName,
              paymentDate: item.paymentDate,
              amount: item.amount,
              paymentMethod: item.paymentMethod,
              notes: item.notes,
            })),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Assistant failed");
      }

      setAssistantMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.answer || t.assistantError,
          documentIds: Array.isArray(data.documentIds)
            ? data.documentIds
            : [],
        },
      ]);
    } catch (error) {
      console.error("Assistant error:", error);
      setAssistantMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: t.assistantError,
        },
      ]);
    } finally {
      setAssistantLoading(false);
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
            isExpiringWithin30Days(
              document,
              attachments[document.id] ?? [],
            )) ||
          (activeCategory === "Da pagare" &&
            hasPaymentTracking(document, attachments[document.id] ?? []) &&
            getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).status === "Da pagare") ||
          (activeCategory === "Parzialmente pagato" &&
            hasPaymentTracking(document, attachments[document.id] ?? []) &&
            getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).status === "Parzialmente pagato") ||
          (activeCategory === "Pagato" &&
            hasPaymentTracking(document, attachments[document.id] ?? []) &&
            getPaymentSnapshot(
              document,
              attachments[document.id] ?? [],
            ).status === "Pagato") ||
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

  async function updatePaymentStatusOverride(
    document: StoredDocument,
    disputed: boolean,
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) return alert(t.notConfigured);

    const automaticStatus = getPaymentSnapshot(
      { ...document, paymentStatus: "Da pagare" },
      attachments[document.id] ?? [],
    ).status;
    const paymentStatus: PaymentStatus = disputed
      ? "Contestato"
      : automaticStatus;

    const { error } = await supabase
      .from("documents")
      .update({ payment_status: paymentStatus })
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

    const document = documents.find(
      (item) => item.id === attachment.documentId,
    );
    const remainingAttachments = (
      attachments[attachment.documentId] ?? []
    ).filter((item) => item.id !== attachment.id);

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
      [attachment.documentId]: remainingAttachments,
    }));

    const isPaymentAttachment = [
      "Ricevuta",
      "Quietanza",
      "Pagamento",
    ].includes(attachment.attachmentType);

    if (document && isPaymentAttachment) {
      await recalculateDocumentPaymentStatus(
        document,
        remainingAttachments,
        document.totalAmount,
        document.installmentCount,
        document.isSinglePaymentOption,
        false,
      );
    }
  }

  async function recalculateDocumentPaymentStatus(
    document: StoredDocument,
    allAttachments: DocumentAttachment[],
    inferredTotalAmount?: number | null,
    inferredInstallmentCount?: number | null,
    inferredSinglePaymentOption?: boolean,
    requireConfirmation = true,
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const paymentAttachments = allAttachments.filter((item) =>
      ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachmentType),
    );
    const paidTotal = getPaidTotal(paymentAttachments);
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

    const latestPayment = [...paymentAttachments].sort((a, b) =>
      String(b.paymentDate ?? b.uploadedAt).localeCompare(
        String(a.paymentDate ?? a.uploadedAt),
      ),
    )[0];

    const remainingAmount =
      totalAmount != null ? Math.max(0, totalAmount - paidTotal) : null;
    const paidInstallments = paymentAttachments.filter(
      (item) => (Number(item.amount) || 0) > 0,
    ).length;
    const lastPaymentDate =
      latestPayment?.paymentDate ?? latestPayment?.uploadedAt?.slice(0, 10) ?? null;
    const installmentCount =
      document.installmentCount ?? inferredInstallmentCount ?? null;
    const isSinglePaymentOption =
      document.isSinglePaymentOption ??
      inferredSinglePaymentOption ??
      false;

    const currency = new Intl.NumberFormat(
      language === "it" ? "it-IT" : "en-US",
      { style: "currency", currency: "EUR" },
    );
    const proposalLines = [
      language === "it"
        ? `DocuMio propone di aggiornare il pagamento di “${document.title}”:`
        : `DocuMio proposes updating the payment for “${document.title}”:`,
      `${t.paymentStatus}: ${t.statuses[paymentStatus]}`,
      `${t.paidProgress}: ${currency.format(paidTotal)}`,
      totalAmount != null
        ? `${language === "it" ? "Totale" : "Total"}: ${currency.format(totalAmount)}`
        : null,
      remainingAmount != null
        ? `${language === "it" ? "Residuo" : "Remaining"}: ${currency.format(remainingAmount)}`
        : null,
      installmentCount != null
        ? `${language === "it" ? "Rate pagate" : "Paid installments"}: ${paidInstallments}/${installmentCount}`
        : `${language === "it" ? "Pagamenti registrati" : "Recorded payments"}: ${paidInstallments}`,
      "",
      language === "it"
        ? "Confermi questo aggiornamento?"
        : "Do you confirm this update?",
    ].filter((line): line is string => line !== null);

    if (
      requireConfirmation &&
      !window.confirm(proposalLines.join("\n"))
    ) {
      return;
    }

    const updateData = {
      payment_status: paymentStatus,
      paid_at: lastPaymentDate,
      paid_amount: paidTotal || null,
      payment_method: latestPayment?.paymentMethod ?? null,
      total_amount: totalAmount,
      installment_count: installmentCount,
      is_single_payment_option: isSinglePaymentOption,
      paid_installments: paidInstallments || null,
      remaining_amount: remainingAmount,
      last_payment_date: lastPaymentDate,
      payment_progress_confirmed: true,
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
              paidInstallments: updateData.paid_installments,
              remainingAmount: updateData.remaining_amount,
              lastPaymentDate: updateData.last_payment_date,
              paymentProgressConfirmed:
                updateData.payment_progress_confirmed,
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
        paid_installments: doc.paidInstallments ?? null,
        remaining_amount: doc.remainingAmount ?? null,
        last_payment_date: doc.lastPaymentDate ?? null,
        payment_progress_confirmed:
          doc.paymentProgressConfirmed ?? false,
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
      paidInstallments: data.paid_installments ?? null,
      remainingAmount: data.remaining_amount ?? null,
      lastPaymentDate: data.last_payment_date ?? null,
      paymentProgressConfirmed:
        data.payment_progress_confirmed ?? false,
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

        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, margin: "4px 0 14px", fontSize: 14, lineHeight: 1.45 }}>
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(event) => setPrivacyAccepted(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            {language === "it" ? "Ho letto e accetto " : "I have read and accept the "}
            <a href="/privacy" target="_blank">Privacy Policy</a>
            {language === "it" ? " e i " : " and "}
            <a href="/terms" target="_blank">{language === "it" ? "Termini beta" : "beta Terms"}</a>.
          </span>
        </label>

        <button onClick={signIn} style={{ width: "100%", padding: 12 }}>
          {t.signIn}
        </button>

        <button
          onClick={signUp}
          disabled={!privacyAccepted}
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

        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-icon-button"
            onClick={() => setShowNotifications(true)}
            aria-label={language === "it" ? "Impostazioni" : "Settings"}
            title={language === "it" ? "Impostazioni" : "Settings"}
            style={{ position: "relative" }}
          >
            <Settings size={19} />
            {unreadNotificationCount > 0 && (
              <span style={{
                position: "absolute", top: -7, right: -7, minWidth: 20, height: 20,
                borderRadius: 999, padding: "0 5px", display: "grid", placeItems: "center",
                background: "#dc2626", color: "white", fontSize: 11, fontWeight: 800,
              }}>
                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              </span>
            )}
          </button>

          <button className="primary topbar-upload" onClick={() => setShowUpload(true)}>
            <Plus size={18} />
            <span>{language === "it" ? "Carica" : "Upload"}</span>
          </button>

          <button className="topbar-logout" type="button" onClick={signOut} title={userEmail ?? undefined}>
            <LogOut size={18} />
            <span>{t.logout}</span>
          </button>
        </div>
      </header>

      <section className="hero" style={{ position: "relative" }}>
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

        <button
          type="button"
          onClick={() => setShowAssistant(true)}
          aria-label={t.assistantTitle}
          title={t.assistantTitle}
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 54,
            height: 54,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.65)",
            background: "rgba(255,255,255,0.96)",
            color: "#4338ca",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 12px 30px rgba(30, 41, 59, 0.22)",
            zIndex: 2,
          }}
        >
          <Bot size={28} />
        </button>
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
              <article className="doc-card" key={doc.id} data-document-id={doc.id}>
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

                {doc.expiryDate &&
                  (!hasPaymentTracking(doc, attachments[doc.id] ?? []) ||
                    getPaymentSnapshot(
                      doc,
                      attachments[doc.id] ?? [],
                    ).status !== "Pagato") && (
                  <span className="expiry-date">
                    {t.expiresOn} {" "}
                    {new Date(
                      `${doc.expiryDate}T12:00:00`,
                    ).toLocaleDateString(language === "it" ? "it-IT" : "en-GB")}
                  </span>
                )}

                {hasPaymentTracking(doc, attachments[doc.id] ?? []) && (
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
                    value={
                      getPaymentSnapshot(
                        doc,
                        attachments[doc.id] ?? [],
                      ).status === "Contestato"
                        ? "Contestato"
                        : "Automatico"
                    }
                    onChange={(event) =>
                      updatePaymentStatusOverride(
                        doc,
                        event.target.value === "Contestato",
                      )
                    }
                    aria-label={`${t.paymentStatus} ${doc.title}`}
                  >
                    <option value="Automatico">
                      {language === "it"
                        ? `Automatico · ${
                            t.statuses[
                              getPaymentSnapshot(
                                { ...doc, paymentStatus: "Da pagare" },
                                attachments[doc.id] ?? [],
                              ).status
                            ]
                          }`
                        : `Automatic · ${
                            t.statuses[
                              getPaymentSnapshot(
                                { ...doc, paymentStatus: "Da pagare" },
                                attachments[doc.id] ?? [],
                              ).status
                            ]
                          }`
                      }
                    </option>
                    <option value="Contestato">{t.statuses.Contestato}</option>
                  </select>

                  {["Pagato", "Parzialmente pagato"].includes(
                    getPaymentSnapshot(
                      doc,
                      attachments[doc.id] ?? [],
                    ).status,
                  ) && getPaymentSnapshot(
                    doc,
                    attachments[doc.id] ?? [],
                  ).lastPaymentDate && (
                    <span style={{ fontSize: 13 }}>
                      {new Date(`${getPaymentSnapshot(doc, attachments[doc.id] ?? []).lastPaymentDate}T12:00:00`).toLocaleDateString(
                        language === "it" ? "it-IT" : "en-GB",
                      )}
                      {getPaymentSnapshot(
                        doc,
                        attachments[doc.id] ?? [],
                      ).paidAmount > 0
                        ? ` · €${getPaymentSnapshot(
                            doc,
                            attachments[doc.id] ?? [],
                          ).paidAmount.toFixed(2)}`
                        : ""}
                      {doc.totalAmount != null
                        ? ` su €${Number(doc.totalAmount).toFixed(2)}`
                        : ""}
                      {doc.paymentMethod ? ` · ${doc.paymentMethod}` : ""}
                    </span>
                  )}
                  </div>
                )}

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

      <footer className="legal-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Termini beta</a>
        <span>© {new Date().getFullYear()} DocuMio</span>
      </footer>

      {showNotifications && (
        <div className="modal-backdrop" onMouseDown={() => setShowNotifications(false)}>
          <section
            onMouseDown={(event) => event.stopPropagation()}
            style={{ width: "min(620px, calc(100vw - 24px))", maxHeight: "88vh", overflow: "auto", background: "white", borderRadius: 22, padding: 20 }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>{language === "it" ? "Impostazioni" : "Settings"}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  {language === "it" ? `${unreadNotificationCount} avvisi non letti` : `${unreadNotificationCount} unread alerts`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={markAllNotificationsRead} title={language === "it" ? "Segna tutte come lette" : "Mark all as read"}>
                  <CheckCheck size={18} />
                </button>
                <button type="button" onClick={() => setShowNotifications(false)}><X size={18} /></button>
              </div>
            </header>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, marginBottom: 16 }}>
              <strong>{language === "it" ? "Lingua" : "Language"}</strong>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="button" className={language === "it" ? "primary" : ""} onClick={() => setLanguage("it")}>Italiano</button>
                <button type="button" className={language === "en" ? "primary" : ""} onClick={() => setLanguage("en")}>English</button>
              </div>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, marginBottom: 16 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}><Bell size={17} /> {language === "it" ? "Avvisi" : "Alerts"}</strong>
              <div style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>
                {language === "it" ? `${unreadNotificationCount} avvisi non letti` : `${unreadNotificationCount} unread alerts`}
              </div>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, marginBottom: 16 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}><Mail size={17} /> {language === "it" ? "Canali di avviso" : "Alert channels"}</strong>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
                <span>{language === "it" ? "Email per scadenze importanti" : "Email for important deadlines"}</span>
                <input type="checkbox" checked={emailNotificationsEnabled} onChange={(event) => { setEmailNotificationsEnabled(event.target.checked); void saveNotificationPreferences({ emailEnabled: event.target.checked }); }} />
              </label>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
                <span>{language === "it" ? "Riepilogo settimanale" : "Weekly digest"}</span>
                <input type="checkbox" checked={weeklyDigestEnabled} onChange={(event) => { setWeeklyDigestEnabled(event.target.checked); void saveNotificationPreferences({ weeklyDigestEnabled: event.target.checked }); }} />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 10 }}>
                <span>{language === "it" ? "Notifiche del browser" : "Browser notifications"}</span>
                <button type="button" onClick={() => void enableBrowserNotifications()}>
                  {browserNotificationsEnabled ? (language === "it" ? "Attive" : "Enabled") : (language === "it" ? "Attiva" : "Enable")}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDeleteAccount(true)}
              style={{ width: "100%", marginBottom: 16, borderColor: "#fecaca", color: "#b91c1c", background: "#fff7f7", justifyContent: "center" }}
            >
              <Trash2 size={18} />
              {language === "it" ? "Cancella account" : "Delete account"}
            </button>

            <div style={{ display: "grid", gap: 10 }}>
              {notificationItems.length === 0 ? (
                <div className="empty" style={{ padding: 26 }}>
                  <Bell size={34} />
                  <h3>{language === "it" ? "Nessuna scadenza urgente" : "No urgent deadlines"}</h3>
                </div>
              ) : notificationItems.map((item) => {
                const isRead = readNotificationIds.includes(item.id);
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      const next = Array.from(new Set([...readNotificationIds, item.id]));
                      setReadNotificationIds(next);
                      localStorage.setItem("documio-read-notifications", JSON.stringify(next));
                      setShowNotifications(false);
                      const target = document.querySelector(`[data-document-id="${item.documentId}"]`);
                      target?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    style={{ textAlign: "left", padding: 14, borderRadius: 14, border: `1px solid ${item.severity === "urgent" ? "#fecaca" : item.severity === "warning" ? "#fde68a" : "#c7d2fe"}`, background: isRead ? "#ffffff" : item.severity === "urgent" ? "#fef2f2" : item.severity === "warning" ? "#fffbeb" : "#eef2ff" }}
                  >
                    <strong>{item.title}</strong>
                    <span style={{ display: "block", marginTop: 5, color: "#475569" }}>{item.message}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {showAssistant && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowAssistant(false)}
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "stretch",
          }}
        >
          <section
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(440px, 100vw)",
              height: "100%",
              background: "#ffffff",
              display: "flex",
              flexDirection: "column",
              boxShadow: "-20px 0 50px rgba(15, 23, 42, 0.18)",
            }}
          >
            <header
              style={{
                padding: 18,
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: "#eef2ff",
                    color: "#4338ca",
                  }}
                >
                  <Bot size={24} />
                </div>
                <div>
                  <strong>{t.assistantTitle}</strong>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {language === "it"
                      ? "Risposte basate sul tuo archivio"
                      : "Answers based on your archive"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAssistant(false)}
                aria-label={t.close}
                style={{ border: 0, background: "transparent" }}
              >
                <X />
              </button>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                background: "#f8fafc",
              }}
            >
              {assistantMessages.length === 0 && (
                <>
                  <div
                    style={{
                      alignSelf: "flex-start",
                      maxWidth: "88%",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    {t.assistantWelcome}
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    {[
                      language === "it"
                        ? "Quanto devo ancora pagare?"
                        : "How much do I still have to pay?",
                      language === "it"
                        ? "Cosa scade nei prossimi 30 giorni?"
                        : "What expires in the next 30 days?",
                      language === "it"
                        ? "Dov’è il contratto del fotovoltaico?"
                        : "Where is the solar contract?",
                      language === "it"
                        ? "Quali documenti risultano pagati?"
                        : "Which documents are paid?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void askAssistant(suggestion)}
                        style={{
                          textAlign: "left",
                          border: "1px solid #c7d2fe",
                          borderRadius: 14,
                          padding: 12,
                          background: "#ffffff",
                          color: "#3730a3",
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {assistantMessages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    alignSelf:
                      message.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "90%",
                    background:
                      message.role === "user" ? "#4338ca" : "#ffffff",
                    color: message.role === "user" ? "#ffffff" : "#0f172a",
                    border:
                      message.role === "user"
                        ? "1px solid #4338ca"
                        : "1px solid #e2e8f0",
                    borderRadius: 16,
                    padding: 13,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div>{message.text}</div>

                  {message.role === "assistant" &&
                    (message.documentIds ?? []).map((documentId) => {
                      const linkedDocument = documents.find(
                        (document) => document.id === documentId,
                      );

                      if (!linkedDocument) return null;

                      return (
                        <button
                          key={documentId}
                          type="button"
                          onClick={() => void openDocument(linkedDocument)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            marginTop: 10,
                            border: "1px solid #c7d2fe",
                            borderRadius: 12,
                            padding: 10,
                            background: "#eef2ff",
                            color: "#312e81",
                          }}
                        >
                          📄 {linkedDocument.title}
                          <div style={{ fontSize: 12, marginTop: 3 }}>
                            {t.assistantOpenDocument}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}

              {assistantLoading && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 16,
                    padding: 13,
                    color: "#64748b",
                  }}
                >
                  {t.assistantThinking}
                </div>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void askAssistant();
              }}
              style={{
                padding: 14,
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                gap: 8,
                background: "#ffffff",
              }}
            >
              <input
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                placeholder={t.assistantPlaceholder}
                disabled={assistantLoading}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid #cbd5e1",
                  borderRadius: 14,
                  padding: "12px 14px",
                }}
              />
              <button
                type="submit"
                className="primary"
                disabled={!assistantInput.trim() || assistantLoading}
                aria-label={t.assistantSend}
                title={t.assistantSend}
                style={{ minWidth: 48, justifyContent: "center" }}
              >
                <Send size={19} />
              </button>
            </form>
          </section>
        </div>
      )}

      {showDeleteAccount && (
        <div className="modal-backdrop" onMouseDown={() => !deletingAccount && setShowDeleteAccount(false)}>
          <section
            onMouseDown={(event) => event.stopPropagation()}
            style={{ width: "min(520px, calc(100vw - 24px))", background: "white", borderRadius: 22, padding: 22 }}
          >
            <h2 style={{ marginTop: 0 }}>{language === "it" ? "Cancella definitivamente l’account" : "Permanently delete account"}</h2>
            <p style={{ color: "#475569", lineHeight: 1.6 }}>
              {language === "it"
                ? `Questa operazione eliminerà l’account e tutti i ${documents.length} documenti presenti nell’archivio. Non può essere annullata.`
                : `This will delete your account and all ${documents.length} documents in your archive. It cannot be undone.`}
            </p>
            <label className="field">
              {language === "it" ? "Reinserisci la password" : "Enter your password again"}
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
              <button type="button" disabled={deletingAccount} onClick={() => { setDeletePassword(""); setShowDeleteAccount(false); }}>
                {language === "it" ? "Annulla" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!deletePassword.trim() || deletingAccount}
                onClick={() => void deleteAccount()}
                style={{ background: "#b91c1c", color: "white", borderColor: "#b91c1c" }}
              >
                <Trash2 size={18} />
                {deletingAccount ? (language === "it" ? "Cancellazione…" : "Deleting…") : (language === "it" ? "Conferma cancellazione" : "Confirm deletion")}
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .topbar {
          min-width: 0;
          gap: 12px;
        }
        .topbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        .topbar-icon-button, .topbar-upload, .topbar-logout {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .topbar {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .topbar .brand .logo {
            display: none;
          }
          .topbar .brand span {
            font-size: 24px;
          }
          .topbar-actions {
            gap: 6px;
          }
          .topbar-actions button {
            min-width: 42px;
            min-height: 42px;
            padding: 9px 10px !important;
            justify-content: center;
          }
          .topbar-upload span, .topbar-logout span {
            display: none;
          }
        }
      `}</style>

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
    analysisMeta?: {
      documentTotalAmount?: number | null;
      installmentCount?: number | null;
      isSinglePaymentOption?: boolean;
    },
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
  const [analysisMeta, setAnalysisMeta] = useState<{
    documentTotalAmount?: number | null;
    installmentCount?: number | null;
    isSinglePaymentOption?: boolean;
  }>({});
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
            totalAmount: document.totalAmount,
            installmentCount: document.installmentCount,
            isSinglePaymentOption: document.isSinglePaymentOption,
            paidInstallments: document.paidInstallments,
            remainingAmount: document.remainingAmount,
            lastPaymentDate: document.lastPaymentDate,
          },
        ]),
      );

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: await getApiAuthHeaders(),
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
      setAnalysisMeta({
        documentTotalAmount: data.documentTotalAmount ?? null,
        installmentCount: data.installmentCount ?? null,
        isSinglePaymentOption: data.isSinglePaymentOption ?? false,
      });
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
        analysisMeta,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal upload-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" onClick={onClose}>
          <X />
        </button>

        <h2>{t.addAttachment}</h2>
        <p>{document.title}</p>

        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={async (event) => {
              const selectedFile = event.target.files?.[0] || null;
              if (!selectedFile) {
                setFile(null);
                return;
              }
              let preparedFile = selectedFile;
              try {
                preparedFile = await compressImageForUpload(selectedFile);
              } catch {
                preparedFile = selectedFile;
              }
              setFile(preparedFile);
              void analyzeSelectedFile(preparedFile);
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
  const [matchedDocuments, setMatchedDocuments] = useState<StoredDocument[]>([]);
  const t = translations[language];

  function serializeCandidateDocuments(items: StoredDocument[]) {
    return items.map((document) => ({
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
      paidInstallments: document.paidInstallments,
      remainingAmount: document.remainingAmount,
      lastPaymentDate: document.lastPaymentDate,
      paymentProgressConfirmed: document.paymentProgressConfirmed,
    }));
  }

  async function requestAnalysis(
    candidateDocuments: ReturnType<typeof serializeCandidateDocuments> = [],
    mode: "document" | "attachment" = "document",
  ) {
    if (!file) {
      throw new Error(
        language === "it" ? "File mancante." : "Missing file.",
      );
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userNote", note);
    formData.append("language", language);
    formData.append("mode", mode);
    formData.append(
      "candidateDocuments",
      JSON.stringify(candidateDocuments),
    );

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: await getApiAuthHeaders(),
      body: formData,
    });

    const data = (await response.json()) as SmartAnalysis & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || "Analysis failed");
    }

    return data;
  }

  async function analyze() {
    if (!file || loading) return;

    setLoading(true);
    setAnalysis(null);
    setMatchedDocuments([]);
    setSelectedDocumentId("");

    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(
          language === "it"
            ? "Il file supera 4 MB. Scegli un file più piccolo."
            : "The file is larger than 4 MB. Choose a smaller file.",
        );
      }

      // Prima passata: l'IA estrae solo i dati del file, senza ricevere
      // l'intero archivio dell'utente.
      const extracted = await requestAnalysis([], "document");

      if (!extracted.isAttachment || documents.length === 0) {
        await saveAsNewDocument(extracted);
        return;
      }

      // Il server filtra l'archivio e restituisce al massimo 15 candidati.
      const matchResponse = await fetch("/api/match-attachment", {
        method: "POST",
        headers: await getApiAuthHeaders("application/json"),
        body: JSON.stringify({
          title: extracted.title,
          summary: extracted.summary,
          notes: extracted.notes || note,
          category: extracted.category,
          keywords: extracted.keywords,
          amount: extracted.amount,
          paymentDate: extracted.paymentDate,
          documentTotalAmount: extracted.documentTotalAmount,
          limit: 15,
        }),
      });

      const matchData = (await matchResponse.json()) as {
        candidates?: Array<{ id: string }>;
        error?: string;
      };

      if (!matchResponse.ok) {
        throw new Error(matchData.error || "Document matching failed");
      }

      const candidateIds = new Set(
        (matchData.candidates ?? []).map((candidate) => candidate.id),
      );
      const candidates = documents.filter((document) =>
        candidateIds.has(document.id),
      );

      setMatchedDocuments(candidates);

      if (candidates.length === 0) {
        setAnalysis({
          ...extracted,
          suggestedDocumentId: null,
          matchConfidence: 0,
          matchReasons: [],
        });
        return;
      }

      // Seconda passata: l'IA confronta solamente i candidati già filtrati.
      const ranked = await requestAnalysis(
        serializeCandidateDocuments(candidates),
        "attachment",
      );

      const suggestedExists = candidates.some(
        (document) => document.id === ranked.suggestedDocumentId,
      );

      setAnalysis(ranked);
      setSelectedDocumentId(
        suggestedExists
          ? ranked.suggestedDocumentId || ""
          : candidates[0]?.id || "",
      );
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
        paidInstallments: null,
        remainingAmount: data.documentTotalAmount ?? null,
        lastPaymentDate: null,
        paymentProgressConfirmed: false,
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
    const selectableDocuments =
      matchedDocuments.length > 0 ? matchedDocuments : [];
    const suggestedDocument = selectableDocuments.find(
      (document) => document.id === analysis.suggestedDocumentId,
    );

    return (
      <div
        className="modal-backdrop match-modal-backdrop"
        onMouseDown={onClose}
      >
        <div
          className="modal match-modal"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label={t.close}
          >
            <X />
          </button>

          <h2 className="match-modal-title">{t.possibleMatch}</h2>
          <p className="match-modal-document-title">
            <strong>{analysis.title}</strong>
          </p>

          {suggestedDocument ? (
            <div className="match-modal-suggestion">
              <strong>{suggestedDocument.title}</strong>
              <div className="match-modal-reasons">
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

          <label className="field match-modal-field">
            {t.chooseDocument}
            <select
              className="match-modal-select"
              value={selectedDocumentId}
              disabled={selectableDocuments.length === 0}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
            >
              {selectableDocuments.length === 0 ? (
                <option value="">{t.noMatchFound}</option>
              ) : (
                selectableDocuments.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title}
                  </option>
                ))
              )}
            </select>
          </label>

          <button
            className="primary full match-modal-primary"
            disabled={!selectedDocumentId || loading}
            onClick={linkToSelectedDocument}
          >
            {t.linkSelected}
          </button>

          <button
            type="button"
            className="match-modal-secondary"
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
      <div className="modal upload-modal" onMouseDown={(event) => event.stopPropagation()}>
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
            onChange={async (event) => {
              const selected = event.target.files?.[0] || null;
              setAnalysis(null);
              setMatchedDocuments([]);
              setSelectedDocumentId("");
              if (!selected) {
                setFile(null);
                return;
              }
              try {
                setFile(await compressImageForUpload(selected));
              } catch {
                setFile(selected);
              }
            }}
          />
          <Upload size={28} />
          <strong>{file ? file.name : t.chooseFile}</strong>
          <span>{t.fileFormats}</span>
        </label>

        {file && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              fontWeight: 800,
            }}
          >
            <span aria-hidden="true">✓</span>
            <span>
              {language === "it"
                ? "Foto o file acquisito correttamente. Ora premi Analizza e archivia."
                : "Photo or file captured successfully. Now press Analyze and archive."}
            </span>
          </div>
        )}

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

        <div className="upload-actions">
          <button
            className="primary full upload-submit"
            disabled={!file || loading}
            onClick={analyze}
            aria-label={loading ? t.organizing : t.analyzeAndArchive}
          >
            <span>{loading ? t.organizing : t.analyzeAndArchive}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
