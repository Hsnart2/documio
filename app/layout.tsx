import type { Metadata, Viewport } from "next";
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
import "./push-notifications.css";
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
import PushNotificationControls from "./PushNotificationControls";
import PushDeepLinkHandler from "./PushDeepLinkHandler";
import PushForegroundDeduper from "./PushForegroundDeduper";

export const metadata: Metadata = {
  title: "DocuMio",
  description: "Il tuo archivio intelligente di documenti",
  applicationName: "DocuMio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DocuMio",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
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
        <PushNotificationControls />
        <PushForegroundDeduper />
        <AutomationActivityCenter />
        <AutomationRunNowButton />
        <SmartPracticeCenter />
        <PushDeepLinkHandler />
        <PracticeVisibility />
        <PasskeyControls />
        <GmailSettingsLink />
      </body>
    </html>
  );
}
