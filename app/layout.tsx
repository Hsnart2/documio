import type { Metadata } from "next";
import "./globals.css";
import "./loading-fix.css";
import "./attachment-scroll-fix.css";
import "./smart-home.css";
import PracticeVisibility from "./PracticeVisibility";
import PasskeyControls from "./PasskeyControls";
import GmailSettingsLink from "./GmailSettingsLink";
import SmartHomeV2 from "./SmartHomeV2";

export const metadata: Metadata = {
  title: "Documio",
  description: "Il tuo archivio intelligente di documenti",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        {children}
        <SmartHomeV2 />
        <PracticeVisibility />
        <PasskeyControls />
        <GmailSettingsLink />
      </body>
    </html>
  );
}
