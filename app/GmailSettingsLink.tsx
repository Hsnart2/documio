"use client";

import { useEffect } from "react";

const LINK_ID = "documio-gmail-settings-link";

function installGmailLink() {
  if (document.getElementById(LINK_ID)) return;

  const settingsTitle = Array.from(document.querySelectorAll("h2")).find((element) => {
    const text = element.textContent?.trim().toLowerCase();
    return text === "impostazioni" || text === "settings";
  });

  const panel = settingsTitle?.closest("section");
  if (!panel) return;

  const deleteButton = Array.from(panel.querySelectorAll("button")).find((button) => {
    const text = button.textContent?.trim().toLowerCase() ?? "";
    return text.includes("cancella account") || text.includes("delete account");
  });

  const languageIsItalian = settingsTitle?.textContent?.trim().toLowerCase() === "impostazioni";
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
  link.style.display = "inline-flex";
  link.style.alignItems = "center";
  link.style.justifyContent = "center";
  link.style.gap = "8px";
  link.style.padding = "10px 14px";
  link.style.borderRadius = "12px";
  link.style.background = "#4f46e5";
  link.style.color = "#ffffff";
  link.style.fontWeight = "700";
  link.style.textDecoration = "none";

  card.append(heading, description, link);

  if (deleteButton?.parentElement === panel) {
    panel.insertBefore(card, deleteButton);
  } else {
    panel.appendChild(card);
  }
}

export default function GmailSettingsLink() {
  useEffect(() => {
    installGmailLink();

    const observer = new MutationObserver(() => installGmailLink());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
