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
