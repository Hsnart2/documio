import type { Metadata } from "next";
import "./globals.css";
import "./loading-fix.css";
import "./attachment-scroll-fix.css";
import "./smart-home.css";
import "./smart-home-auth.css";
import "./ui-mode.css";
import "./automation-controls.css";
import "./activity-center.css";
import "./automation-run-now.css";
import "./smart-practice.css";
import "./practice-attention.css";
import PracticeVisibility from "./PracticeVisibility";
import PasskeyControls from "./PasskeyControls";
import GmailSettingsLink from "./GmailSettingsLink";
import SmartHomeV2 from "./SmartHomeV2";
import SmartHomeAuthGuard from "./SmartHomeAuthGuard";
import UiModeController from "./UiModeController";
import AdvancedEmailAutomation from "./AdvancedEmailAutomation";
import PostUploadPracticePrompt from "./PostUploadPracticePrompt";
import AutomationActivityCenter from "./AutomationActivityCenter";
import AutomationRunNowButton from "./AutomationRunNowButton";
import SmartPracticeCenter from "./SmartPracticeCenter";
import PracticeAttentionCard from "./PracticeAttentionCard";

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
        <PracticeAttentionCard />
        <AdvancedEmailAutomation />
        <PostUploadPracticePrompt />
        <AutomationActivityCenter />
        <AutomationRunNowButton />
        <SmartPracticeCenter />
        <PracticeVisibility />
        <PasskeyControls />
        <GmailSettingsLink />
      </body>
    </html>
  );
}
