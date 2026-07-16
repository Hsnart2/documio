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

export type PaymentStatus = "Da pagare" | "Pagato" | "Scaduto" | "Contestato";

export type StoredDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  fileName: string;
  uploadedAt: string;
  summary: string;
  keywords: string[];
  expiryDate?: string | null;
  size?: number;
  storagePath?: string | null;
  paymentStatus?: PaymentStatus;
  paidAt?: string | null;
  paidAmount?: number | null;
  paymentMethod?: string | null;
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
