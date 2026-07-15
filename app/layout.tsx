import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Documio",
  description: "Il tuo archivio intelligente di documenti",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
