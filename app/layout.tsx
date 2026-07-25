import type { Metadata } from "next";
import "./globals.css";
import "./loading-fix.css";
import "./attachment-scroll-fix.css";
import PracticeVisibility from "./PracticeVisibility";
import PasskeyControls from "./PasskeyControls";
import GmailSettingsLink from "./GmailSettingsLink";
import SmartHome from "./SmartHome";

export const metadata: Metadata = {
  title: "Documio",
  description: "Il tuo archivio intelligente di documenti",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        {children}
        <SmartHome />
        <PracticeVisibility />
        <PasskeyControls />
        <GmailSettingsLink />
      </body>
    </html>
  );
}
