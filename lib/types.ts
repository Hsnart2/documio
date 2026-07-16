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
};
