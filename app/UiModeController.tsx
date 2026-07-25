"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, LayoutDashboard, Sparkles } from "lucide-react";

type UiMode = "advanced" | "standard";

const STORAGE_KEY = "documio-ui-mode";

function readMode(): UiMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "standard" ? "standard" : "advanced";
  } catch {
    return "advanced";
  }
}

function applyMode(mode: UiMode) {
  document.documentElement.dataset.documioMode = mode;
  document.body.classList.toggle("documio-standard-mode", mode === "standard");
  document.body.classList.toggle("documio-advanced-mode", mode === "advanced");
}

export default function UiModeController() {
  const [mode, setMode] = useState<UiMode>("advanced");
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [isItalian, setIsItalian] = useState(true);

  useEffect(() => {
    const initialMode = readMode();
    setMode(initialMode);
    applyMode(initialMode);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const nextMode: UiMode = event.newValue === "standard" ? "standard" : "advanced";
      setMode(nextMode);
      applyMode(nextMode);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let currentMount: HTMLDivElement | null = null;

    const findSettingsModal = () => {
      const headings = Array.from(document.querySelectorAll("h2"));
      const heading = headings.find((item) => {
        const text = item.textContent?.trim().toLowerCase();
        return text === "impostazioni" || text === "settings";
      });

      const section = heading?.closest("section");
      const header = heading?.closest("header");

      if (!(section instanceof HTMLElement) || !(header instanceof HTMLElement)) {
        if (currentMount && !currentMount.isConnected) {
          currentMount = null;
          setTarget(null);
        }
        return;
      }

      setIsItalian(heading?.textContent?.trim().toLowerCase() !== "settings");

      let mount = section.querySelector<HTMLDivElement>("#documio-ui-mode-settings-root");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-ui-mode-settings-root";
        header.insertAdjacentElement("afterend", mount);
      }

      if (currentMount !== mount) {
        currentMount = mount;
        setTarget(mount);
      }
    };

    findSettingsModal();
    const observer = new MutationObserver(findSettingsModal);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  const chooseMode = (nextMode: UiMode) => {
    setMode(nextMode);
    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // The visual change still works for the current session.
    }
    applyMode(nextMode);
    window.dispatchEvent(
      new CustomEvent("documio-ui-mode-changed", { detail: { mode: nextMode } }),
    );
  };

  if (!target) return null;

  return createPortal(
    <section className="documio-mode-settings" aria-label={isItalian ? "Versione di DocuMio" : "DocuMio version"}>
      <div className="documio-mode-settings-heading">
        <span className="documio-mode-settings-icon"><Sparkles size={19} /></span>
        <div>
          <strong>{isItalian ? "Versione di DocuMio" : "DocuMio version"}</strong>
          <p>
            {isItalian
              ? "Puoi cambiare versione in qualsiasi momento senza perdere documenti o impostazioni."
              : "Switch versions at any time without losing documents or settings."}
          </p>
        </div>
      </div>

      <div className="documio-mode-options">
        <button
          type="button"
          className={mode === "advanced" ? "selected" : ""}
          aria-pressed={mode === "advanced"}
          onClick={() => chooseMode("advanced")}
        >
          <span className="documio-mode-option-icon"><Bot size={23} /></span>
          <span className="documio-mode-option-copy">
            <span className="documio-mode-option-title">
              {isItalian ? "IA avanzata" : "Advanced AI"}
              <small>{isItalian ? "Consigliata" : "Recommended"}</small>
            </span>
            <span>
              {isItalian
                ? "Nuova Home, consigli intelligenti, riepiloghi e chat centrale."
                : "New Home, smart advice, summaries and central chat."}
            </span>
          </span>
          <span className="documio-mode-check" aria-hidden="true">✓</span>
        </button>

        <button
          type="button"
          className={mode === "standard" ? "selected" : ""}
          aria-pressed={mode === "standard"}
          onClick={() => chooseMode("standard")}
        >
          <span className="documio-mode-option-icon"><LayoutDashboard size={23} /></span>
          <span className="documio-mode-option-copy">
            <span className="documio-mode-option-title">
              {isItalian ? "Standard" : "Standard"}
            </span>
            <span>
              {isItalian
                ? "La versione classica di DocuMio con archivio e riquadri tradizionali."
                : "The classic DocuMio archive with the traditional dashboard."}
            </span>
          </span>
          <span className="documio-mode-check" aria-hidden="true">✓</span>
        </button>
      </div>
    </section>,
    target,
  );
}
