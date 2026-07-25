"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

const LINK_ID = "documio-gmail-settings-link";

type GmailStatus = {
  state: "loading" | "connected" | "disconnected" | "unknown";
  emailAddress?: string;
};

function installOrUpdateGmailLink(status: GmailStatus) {
  if (status.state === "loading") return;

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

  const signature = `${status.state}:${status.emailAddress ?? ""}:${languageIsItalian ? "it" : "en"}`;
  let card = document.getElementById(LINK_ID) as HTMLDivElement | null;

  if (card && card.parentElement !== panel) {
    card.remove();
    card = null;
  }

  if (!card) {
    card = document.createElement("div");
    card.id = LINK_ID;
    panel.insertBefore(card, deleteButton);
  }

  if (card.dataset.signature === signature) return;
  card.dataset.signature = signature;

  const connected = status.state === "connected";
  const disconnected = status.state === "disconnected";

  card.style.border = connected
    ? "1px solid #bbf7d0"
    : disconnected
      ? "1px solid #c7d2fe"
      : "1px solid #fde68a";
  card.style.borderRadius = "16px";
  card.style.padding = "14px";
  card.style.marginBottom = "16px";
  card.style.background = connected
    ? "#f0fdf4"
    : disconnected
      ? "#f8faff"
      : "#fffbeb";

  const heading = document.createElement("strong");
  heading.style.display = "flex";
  heading.style.alignItems = "center";
  heading.style.gap = "8px";
  heading.textContent = languageIsItalian ? "📧 Posta intelligente" : "📧 Smart mail";

  const description = document.createElement("p");
  description.style.margin = "8px 0 12px";
  description.style.color = connected ? "#166534" : disconnected ? "#64748b" : "#92400e";
  description.style.fontSize = "14px";
  description.style.lineHeight = "1.45";

  if (connected) {
    description.textContent = languageIsItalian
      ? `Gmail collegata${status.emailAddress ? `: ${status.emailAddress}` : ""}. DocuMio può analizzare e organizzare le tue email.`
      : `Gmail connected${status.emailAddress ? `: ${status.emailAddress}` : ""}. DocuMio can analyze and organize your email.`;
  } else if (disconnected) {
    description.textContent = languageIsItalian
      ? "Collega Gmail per riconoscere fatture, pagamenti, documenti e appuntamenti dalle tue email."
      : "Connect Gmail to detect invoices, payments, documents and appointments from your emails.";
  } else {
    description.textContent = languageIsItalian
      ? "Non riesco a verificare ora lo stato di Gmail. Apri la Posta intelligente per riprovare."
      : "Gmail status is temporarily unavailable. Open Smart mail to try again.";
  }

  const link = document.createElement("a");
  link.href = "/email";
  link.textContent = connected || status.state === "unknown"
    ? languageIsItalian ? "Apri posta intelligente" : "Open smart mail"
    : languageIsItalian ? "Collega Gmail" : "Connect Gmail";
  link.style.display = "flex";
  link.style.width = "100%";
  link.style.alignItems = "center";
  link.style.justifyContent = "center";
  link.style.padding = "11px 14px";
  link.style.borderRadius = "12px";
  link.style.background = connected ? "#16a34a" : status.state === "unknown" ? "#d97706" : "#4f46e5";
  link.style.color = "#ffffff";
  link.style.fontWeight = "700";
  link.style.textDecoration = "none";
  link.style.boxSizing = "border-box";

  card.replaceChildren(heading, description, link);
}

export default function GmailSettingsLink() {
  const [status, setStatus] = useState<GmailStatus>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    async function checkConnection() {
      try {
        const supabase = getSupabaseClient();
        const { data } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        const token = data.session?.access_token;

        if (!token) {
          if (!cancelled) setStatus({ state: "disconnected" });
          return;
        }

        const response = await fetch("/api/email/gmail/status", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json() as {
          connected?: boolean;
          emailAddress?: string;
        };

        if (cancelled) return;
        if (!response.ok) {
          setStatus({ state: "unknown" });
          return;
        }

        setStatus({
          state: result.connected ? "connected" : "disconnected",
          emailAddress: result.emailAddress,
        });
      } catch {
        if (!cancelled) setStatus({ state: "unknown" });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkConnection();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    installOrUpdateGmailLink(status);

    let frame = 0;
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => installOrUpdateGmailLink(status));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      document.getElementById(LINK_ID)?.remove();
    };
  }, [status]);

  return null;
}
