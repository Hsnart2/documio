export type DocumentCategory =
  | "Casa"
  | "Veicoli"
  | "Assicurazioni"
  | "Banca"
  | "Lavoro"
  | "Famiglia"
  | "Visite mediche"
  | "Appuntamenti"
  | "Bollette"
  | "Istruzione"
  | "Altro";

export type PaymentStatus =
  "Da pagare" | "Parzialmente pagato" | "Pagato" | "Scaduto" | "Contestato";

export type PracticeStatus = "In corso" | "Aperta" | "Chiusa";

export type Practice = {
  id: string;
  userId: string;
  title: string;
  practiceType: string;
  description?: string | null;
  status: PracticeStatus;
  openedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  fileName: string;
  uploadedAt: string;
  summary: string;
  keywords: string[];
  practiceId?: string | null;
  expiryDate?: string | null;
  appointmentTime?: string | null;
  appointmentCompletedAt?: string | null;
  reminderSnoozedUntil?: string | null;
  size?: number;
  storagePath?: string | null;
  paymentStatus?: PaymentStatus;
  paidAt?: string | null;
  paidAmount?: number | null;
  paymentMethod?: string | null;
  totalAmount?: number | null;
  installmentCount?: number | null;
  installmentAmount?: number | null;
  financingTotalAmount?: number | null;
  firstInstallmentDate?: string | null;
  isFinancing?: boolean;
  isSinglePaymentOption?: boolean;
  paidInstallments?: number | null;
  remainingAmount?: number | null;
  lastPaymentDate?: string | null;
  paymentProgressConfirmed?: boolean;
};

export type DocumentAttachmentType =
  | "Ricevuta"
  | "Quietanza"
  | "Pagamento"
  | "Sollecito"
  | "Comunicazione"
  | "Altro";

export type DocumentAttachment = {
  id: string;
  documentId: string;
  title: string;
  attachmentType: DocumentAttachmentType;
  fileName: string;
  storagePath: string;
  uploadedAt: string;
  paymentDate?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  notes?: string | null;
};
