"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

const LINK_ID = "documio-gmail-settings-link";

type GmailStatus = {
  checked: boolean;
  connected: boolean;
  emailAddress?: string;
};

function installGmailLink(status: GmailStatus) {
  if (!status.checked) return;

  const existing = document.getElementById(LINK_ID);
  if (existing?.isConnected) existing.remove();

  const deleteButton = Array.from(document.querySelectorAll("button")).find((button) => {
    const text = button.textContent?.trim().toLowerCase() ?? "";
    return text.includes("cancella account") || text.includes("delete account");
  });

  if (!deleteButton?.parentElement) return;

  const panel = deleteButton.parentElement;
  const languageIsItalian = deleteButton.textContent
    ?.trim()
    .toLowerCase()
    .includes("cancella account");

  const card = document.createElement("div");
  card.id = LINK_ID;
  card.style.border = status.connected ? "1px solid #bbf7d0" : "1px solid #c7d2fe";
  card.style.borderRadius = "16px";
  card.style.padding = "14px";
  card.style.marginBottom = "16px";
  card.style.background = status.connected ? "#f0fdf4" : "#f8faff";

  const heading = document.createElement("strong");
  heading.style.display = "flex";
  heading.style.alignItems = "center";
  heading.style.gap = "8px";
  heading.textContent = languageIsItalian ? "📧 Posta intelligente" : "📧 Smart mail";

  const description = document.createElement("p");
  description.style.margin = "8px 0 12px";
  description.style.color = status.connected ? "#166534" : "#64748b";
  description.style.fontSize = "14px";
  description.style.lineHeight = "1.45";
  description.textContent = status.connected
    ? languageIsItalian
      ? `Gmail collegata${status.emailAddress ? `: ${status.emailAddress}` : ""}. DocuMio può analizzare e organizzare le tue email.`
      : `Gmail connected${status.emailAddress ? `: ${status.emailAddress}` : ""}. DocuMio can analyze and organize your email.`
    : languageIsItalian
      ? "Collega Gmail per riconoscere fatture, pagamenti, documenti e appuntamenti dalle tue email."
      : "Connect Gmail to detect invoices, payments, documents and appointments from your emails.";

  const link = document.createElement("a");
  link.href = "/email";
  link.textContent = status.connected
    ? languageIsItalian ? "Apri posta intelligente" : "Open smart mail"
    : languageIsItalian ? "Collega Gmail" : "Connect Gmail";
  link.style.display = "flex";
  link.style.width = "100%";
  link.style.alignItems = "center";
  link.style.justifyContent = "center";
  link.style.padding = "11px 14px";
  link.style.borderRadius = "12px";
  link.style.background = status.connected ? "#16a34a" : "#4f46e5";
  link.style.color = "#ffffff";
  link.style.fontWeight = "700";
  link.style.textDecoration = "none";
  link.style.boxSizing = "border-box";

  card.append(heading, description, link);
  panel.insertBefore(card, deleteButton);
}

export default function GmailSettingsLink() {
  const [status, setStatus] = useState<GmailStatus>({ checked: false, connected: false });

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        const supabase = getSupabaseClient();
        const { data } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        const token = data.session?.access_token;
        if (!token) {
          if (!cancelled) setStatus({ checked: true, connected: false });
          return;
        }

        const response = await fetch("/api/email/gmail/inbox?range=14d&limit=1", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json() as { connected?: boolean; emailAddress?: string };
        if (!cancelled) {
          setStatus({
            checked: true,
            connected: response.ok && result.connected === true,
            emailAddress: result.emailAddress,
          });
        }
      } catch {
        if (!cancelled) setStatus({ checked: true, connected: false });
      }
    }

    void checkConnection();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    installGmailLink(status);

    const observer = new MutationObserver(() => installGmailLink(status));
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(() => installGmailLink(status), 500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.getElementById(LINK_ID)?.remove();
    };
  }, [status]);

  return null;
}
