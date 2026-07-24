"use client";

import { useEffect } from "react";

const LINK_ID = "documio-gmail-settings-link";

function installGmailLink() {
  const existing = document.getElementById(LINK_ID);
  if (existing?.isConnected) return;

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
  card.style.border = "1px solid #c7d2fe";
  card.style.borderRadius = "16px";
  card.style.padding = "14px";
  card.style.marginBottom = "16px";
  card.style.background = "#f8faff";

  const heading = document.createElement("strong");
  heading.style.display = "flex";
  heading.style.alignItems = "center";
  heading.style.gap = "8px";
  heading.textContent = languageIsItalian ? "📧 Posta intelligente" : "📧 Smart mail";

  const description = document.createElement("p");
  description.style.margin = "8px 0 12px";
  description.style.color = "#64748b";
  description.style.fontSize = "14px";
  description.style.lineHeight = "1.45";
  description.textContent = languageIsItalian
    ? "Collega Gmail per riconoscere fatture, pagamenti, documenti e appuntamenti dalle tue email."
    : "Connect Gmail to detect invoices, payments, documents and appointments from your emails.";

  const link = document.createElement("a");
  link.href = "/email";
  link.textContent = languageIsItalian ? "Collega Gmail" : "Connect Gmail";
  link.style.display = "flex";
  link.style.width = "100%";
  link.style.alignItems = "center";
  link.style.justifyContent = "center";
  link.style.padding = "11px 14px";
  link.style.borderRadius = "12px";
  link.style.background = "#4f46e5";
  link.style.color = "#ffffff";
  link.style.fontWeight = "700";
  link.style.textDecoration = "none";
  link.style.boxSizing = "border-box";

  card.append(heading, description, link);
  panel.insertBefore(card, deleteButton);
}

export default function GmailSettingsLink() {
  useEffect(() => {
    installGmailLink();

    const observer = new MutationObserver(() => installGmailLink());
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(installGmailLink, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
