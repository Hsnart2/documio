import type { Metadata } from "next";
import "./globals.css";
import "./loading-fix.css";
import PracticeVisibility from "./PracticeVisibility";

export const metadata: Metadata = {
  title: "Documio",
  description: "Il tuo archivio intelligente di documenti",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        {children}
        <PracticeVisibility />
      </body>
    </html>
  );
}
