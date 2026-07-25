"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

function buttonWithText(value: string) {
  const normalized = value.trim().toLowerCase();
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim().toLowerCase() === normalized,
  ) as HTMLButtonElement | undefined;
}

async function waitForElement(selector: string, timeoutMs = 12_000) {
  const immediate = document.querySelector(selector);
  if (immediate instanceof HTMLElement) return immediate;

  return new Promise<HTMLElement | null>((resolve) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found instanceof HTMLElement) {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function clearHandledQuery() {
  const url = new URL(window.location.href);
  for (const key of ["document", "practice", "notification", "settings"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function PushDeepLinkHandler() {
  useEffect(() => {
    let cancelled = false;

    const handle = async () => {
      const params = new URLSearchParams(window.location.search);
      const documentId = params.get("document");
      const practiceId = params.get("practice");
      const notificationId = params.get("notification");
      const settings = params.get("settings");
      if (!documentId && !practiceId && !settings && !notificationId) return;

      if (notificationId) {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase
            .from("automation_notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", notificationId);
        }
      }

      if ("clearAppBadge" in navigator) {
        try {
          await (navigator as Navigator & { clearAppBadge: () => Promise<void> })
            .clearAppBadge();
        } catch {
          // Il badge è facoltativo.
        }
      }

      if (settings) {
        const settingsButton = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Impostazioni"], button[aria-label="Settings"]',
        );
        settingsButton?.click();
        const target = await waitForElement("#documio-push-settings-root", 8_000);
        if (!cancelled && target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.add("push-deep-link-highlight");
          window.setTimeout(
            () => target.classList.remove("push-deep-link-highlight"),
            2400,
          );
        }
      } else if (practiceId) {
        buttonWithText("Pratiche")?.click();
        buttonWithText("Cases")?.click();
        const card = await waitForElement(
          `[data-practice-id="${CSS.escape(practiceId)}"]`,
        );
        if (!cancelled && card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("push-deep-link-highlight");
          const openButton = Array.from(card.querySelectorAll("button")).find(
            (button) => /^(apri|open)$/i.test(button.textContent?.trim() ?? ""),
          );
          (openButton as HTMLButtonElement | undefined)?.click();
          window.setTimeout(
            () => card.classList.remove("push-deep-link-highlight"),
            2400,
          );
        }
      } else if (documentId) {
        buttonWithText("Documenti")?.click();
        buttonWithText("Documents")?.click();
        const card = await waitForElement(
          `[data-document-id="${CSS.escape(documentId)}"]`,
        );
        if (!cancelled && card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("push-deep-link-highlight");
          window.setTimeout(
            () => card.classList.remove("push-deep-link-highlight"),
            2400,
          );
        }
      }

      clearHandledQuery();
    };

    void handle();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
