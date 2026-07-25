import type { Metadata } from "next";
import "./globals.css";
import "./loading-fix.css";
import "./attachment-scroll-fix.css";
import "./smart-home.css";
import "./smart-home-auth.css";
import "./ui-mode.css";
import PracticeVisibility from "./PracticeVisibility";
import PasskeyControls from "./PasskeyControls";
import GmailSettingsLink from "./GmailSettingsLink";
import SmartHomeV2 from "./SmartHomeV2";
import SmartHomeAuthGuard from "./SmartHomeAuthGuard";
import UiModeController from "./UiModeController";

export const metadata: Metadata = {
  title: "Documio",
  description: "Il tuo archivio intelligente di documenti",
};

const uiModeBootstrap = `
try {
  var documioMode = localStorage.getItem("documio-ui-mode") === "standard" ? "standard" : "advanced";
  document.documentElement.dataset.documioMode = documioMode;
} catch (error) {
  document.documentElement.dataset.documioMode = "advanced";
}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <script dangerouslySetInnerHTML={{ __html: uiModeBootstrap }} />
        {children}
        <UiModeController />
        <SmartHomeAuthGuard />
        <SmartHomeV2 />
        <PracticeVisibility />
        <PasskeyControls />
        <GmailSettingsLink />
      </body>
    </html>
  );
}
