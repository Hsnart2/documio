"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  Globe2,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type Language = "it" | "en";

type SettingsPanelProps = {
  open: boolean;
  language: Language;
  userEmail: string | null;
  onLanguageChange: (language: Language) => void;
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
};

type NotificationPreferences = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  expiryReminders: boolean;
  paymentReminders: boolean;
  weeklySummary: boolean;
};

const defaultPreferences: NotificationPreferences = {
  emailEnabled: true,
  pushEnabled: false,
  expiryReminders: true,
  paymentReminders: true,
  weeklySummary: false,
};

export default function SettingsPanel({
  open,
  language,
  userEmail,
  onLanguageChange,
  onClose,
  onSignOut,
}: SettingsPanelProps) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(defaultPreferences);

  useEffect(() => {
    const saved = localStorage.getItem("documio-notification-preferences");
    if (!saved) return;

    try {
      setPreferences({ ...defaultPreferences, ...JSON.parse(saved) });
    } catch {
      localStorage.removeItem("documio-notification-preferences");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "documio-notification-preferences",
      JSON.stringify(preferences),
    );
  }, [preferences]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy =
    language === "it"
      ? {
          title: "Impostazioni",
          account: "Account",
          accountHelp: "Gestisci accesso e dati del tuo profilo.",
          notifications: "Notifiche",
          notificationsHelp:
            "Scegli come ricevere promemoria e aggiornamenti DocuMio.",
          email: "Notifiche email",
          emailHelp: "Promemoria e aggiornamenti nella tua casella email.",
          push: "Notifiche push",
          pushHelp: "Disponibili quando collegheremo il servizio push.",
          expiry: "Documenti in scadenza",
          expiryHelp: "Avvisi prima della data di scadenza.",
          payments: "Pagamenti e rate",
          paymentsHelp: "Promemoria per importi e pagamenti in scadenza.",
          weekly: "Riepilogo settimanale",
          weeklyHelp: "Un riepilogo delle attività più importanti.",
          language: "Lingua",
          languageHelp: "Scegli la lingua dell'interfaccia.",
          italian: "Italiano",
          english: "English",
          privacy: "Privacy e sicurezza",
          privacyHelp: "Esportazione dati e gestione privacy saranno qui.",
          deleteAccount: "Elimina account",
          deleteHelp: "Funzione protetta: verrà aggiunta con conferma completa.",
          comingSoon: "Prossimamente",
          signOut: "Esci",
          close: "Chiudi impostazioni",
        }
      : {
          title: "Settings",
          account: "Account",
          accountHelp: "Manage access and profile information.",
          notifications: "Notifications",
          notificationsHelp:
            "Choose how to receive DocuMio reminders and updates.",
          email: "Email notifications",
          emailHelp: "Reminders and updates delivered to your inbox.",
          push: "Push notifications",
          pushHelp: "Available once the push service is connected.",
          expiry: "Expiring documents",
          expiryHelp: "Alerts before a document expires.",
          payments: "Payments and instalments",
          paymentsHelp: "Reminders for upcoming amounts and payments.",
          weekly: "Weekly summary",
          weeklyHelp: "A summary of the most important activity.",
          language: "Language",
          languageHelp: "Choose the interface language.",
          italian: "Italiano",
          english: "English",
          privacy: "Privacy and security",
          privacyHelp: "Data export and privacy controls will live here.",
          deleteAccount: "Delete account",
          deleteHelp: "Protected action: it will require full confirmation.",
          comingSoon: "Coming soon",
          signOut: "Sign out",
          close: "Close settings",
        };

  function togglePreference(key: keyof NotificationPreferences) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "stretch",
        padding: 0,
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(520px, 100vw)",
          height: "100%",
          overflowY: "auto",
          background: "#f8fafc",
          boxShadow: "-20px 0 50px rgba(15, 23, 42, 0.18)",
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 20px",
            borderBottom: "1px solid #e2e8f0",
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: "#eef2ff",
                color: "#4338ca",
              }}
            >
              <Settings size={23} />
            </div>
            <div>
              <strong id="settings-title" style={{ fontSize: 18 }}>
                {copy.title}
              </strong>
              <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                {userEmail ?? "DocuMio"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            title={copy.close}
            style={{ width: 42, height: 42, padding: 0 }}
          >
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          <SettingsSection
            icon={<UserRound size={20} />}
            title={copy.account}
            description={copy.accountHelp}
          >
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                overflowWrap: "anywhere",
              }}
            >
              <strong style={{ display: "block", fontSize: 13 }}>Email</strong>
              <span style={{ color: "#475569" }}>{userEmail ?? "—"}</span>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Bell size={20} />}
            title={copy.notifications}
            description={copy.notificationsHelp}
          >
            <PreferenceRow
              icon={<Mail size={18} />}
              title={copy.email}
              description={copy.emailHelp}
              checked={preferences.emailEnabled}
              onChange={() => togglePreference("emailEnabled")}
            />
            <PreferenceRow
              icon={<Smartphone size={18} />}
              title={copy.push}
              description={copy.pushHelp}
              checked={preferences.pushEnabled}
              onChange={() => togglePreference("pushEnabled")}
            />
            <PreferenceRow
              title={copy.expiry}
              description={copy.expiryHelp}
              checked={preferences.expiryReminders}
              onChange={() => togglePreference("expiryReminders")}
            />
            <PreferenceRow
              title={copy.payments}
              description={copy.paymentsHelp}
              checked={preferences.paymentReminders}
              onChange={() => togglePreference("paymentReminders")}
            />
            <PreferenceRow
              title={copy.weekly}
              description={copy.weeklyHelp}
              checked={preferences.weeklySummary}
              onChange={() => togglePreference("weeklySummary")}
            />
          </SettingsSection>

          <SettingsSection
            icon={<Globe2 size={20} />}
            title={copy.language}
            description={copy.languageHelp}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <LanguageButton
                active={language === "it"}
                label={copy.italian}
                onClick={() => onLanguageChange("it")}
              />
              <LanguageButton
                active={language === "en"}
                label={copy.english}
                onClick={() => onLanguageChange("en")}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<ShieldCheck size={20} />}
            title={copy.privacy}
            description={copy.privacyHelp}
          >
            <button
              type="button"
              disabled
              style={{
                width: "100%",
                justifyContent: "space-between",
                opacity: 0.65,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Trash2 size={18} />
                {copy.deleteAccount}
              </span>
              <small>{copy.comingSoon}</small>
            </button>
            <p style={{ margin: "8px 2px 0", fontSize: 12, color: "#64748b" }}>
              {copy.deleteHelp}
            </p>
          </SettingsSection>

          <button
            type="button"
            onClick={() => void onSignOut()}
            style={{
              width: "100%",
              minHeight: 50,
              justifyContent: "center",
              color: "#b91c1c",
              borderColor: "#fecaca",
              background: "#fff7f7",
              fontWeight: 800,
            }}
          >
            <LogOut size={19} />
            {copy.signOut}
          </button>
        </div>
      </aside>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: 16,
        borderRadius: 18,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
      }}
    >
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ color: "#4338ca", marginTop: 1 }}>{icon}</div>
        <div>
          <strong>{title}</strong>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {description}
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </section>
  );
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "11px 12px",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {icon && <span style={{ color: "#475569", marginTop: 2 }}>{icon}</span>}
        <span>
          <strong style={{ display: "block", fontSize: 14 }}>{title}</strong>
          <span style={{ display: "block", marginTop: 3, color: "#64748b", fontSize: 12 }}>
            {description}
          </span>
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 20, height: 20, flex: "0 0 auto", accentColor: "#4f46e5" }}
      />
    </label>
  );
}

function LanguageButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: 46,
        justifyContent: "center",
        borderColor: active ? "#6366f1" : "#e2e8f0",
        background: active ? "#eef2ff" : "#ffffff",
        color: active ? "#3730a3" : "#334155",
        fontWeight: 800,
      }}
    >
      {label}
    </button>
  );
}
