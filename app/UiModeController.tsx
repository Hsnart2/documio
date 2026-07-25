"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, LayoutDashboard, Sparkles } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

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
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const syncPreference = useCallback(
    async (nextMode: UiMode, changeAutomation: boolean) => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setSyncState("saving");
      const payload: Record<string, unknown> = {
        user_id: user.id,
        ui_mode: nextMode,
      };
      if (changeAutomation) {
        payload.daily_email_enabled = nextMode === "advanced";
      }

      const { error } = await supabase
        .from("automation_preferences")
        .upsert(payload, { onConflict: "user_id" });

      if (error) {
        // La modalità locale continua a funzionare anche prima dell'applicazione della migrazione SQL.
        console.warn("Preferenza automazione non sincronizzata:", error.message);
        setSyncState("error");
        return;
      }

      setSyncState("saved");
    },
    [],
  );

  useEffect(() => {
    const initialMode = readMode();
    setMode(initialMode);
    applyMode(initialMode);
    void syncPreference(initialMode, false);

    const supabase = getSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void syncPreference(readMode(), false);
    }).data.subscription;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const nextMode: UiMode = event.newValue === "standard" ? "standard" : "advanced";
      setMode(nextMode);
      applyMode(nextMode);
      void syncPreference(nextMode, true);
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      subscription?.unsubscribe();
    };
  }, [syncPreference]);

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
    void syncPreference(nextMode, true);
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
              ? "La scelta cambia il livello di autonomia, non i tuoi dati: archivio, pratiche e documenti restano identici."
              : "The choice changes the level of autonomy, not your data: archive, cases and documents stay the same."}
          </p>
          {syncState === "saving" && <small>{isItalian ? "Salvataggio preferenza…" : "Saving preference…"}</small>}
          {syncState === "saved" && <small>{isItalian ? "Preferenza sincronizzata" : "Preference synced"}</small>}
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
              <small>{isItalian ? "Automatica" : "Automatic"}</small>
            </span>
            <span>
              {isItalian
                ? "Gestisce ogni giorno la posta collegata, importa allegati utili e cestina soltanto pubblicità a basso rischio."
                : "Manages connected mail every day, imports useful attachments and only trashes low-risk advertising."}
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
              <small>{isItalian ? "Con conferma" : "With confirmation"}</small>
            </span>
            <span>
              {isItalian
                ? "Mostra la versione classica e chiede sempre il consenso prima di importare, archiviare, collegare o cestinare."
                : "Shows the classic version and always asks before importing, archiving, linking or trashing."}
            </span>
          </span>
          <span className="documio-mode-check" aria-hidden="true">✓</span>
        </button>
      </div>
    </section>,
    target,
  );
}
