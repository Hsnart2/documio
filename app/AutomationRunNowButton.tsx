"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, Play, TriangleAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type UiMode = "advanced" | "standard";

type RunSummary = {
  analyzed?: number;
  imported?: number;
  trashed?: number;
  notifications?: number;
  skipped?: number;
  warnings?: string[];
};

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; summary: RunSummary }
  | { status: "error"; message: string };

const MODE_KEY = "documio-ui-mode";

function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === "standard" ? "standard" : "advanced";
  } catch {
    return "advanced";
  }
}

export default function AutomationRunNowButton() {
  const [mode, setMode] = useState<UiMode>("advanced");
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<RunState>({ status: "idle" });

  useEffect(() => {
    setMode(readMode());
    const onModeChange = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: UiMode }>).detail?.mode;
      setMode(next === "standard" ? "standard" : "advanced");
      setState({ status: "idle" });
    };
    window.addEventListener("documio-ui-mode-changed", onModeChange);
    return () => window.removeEventListener("documio-ui-mode-changed", onModeChange);
  }, []);

  useEffect(() => {
    let currentMount: HTMLDivElement | null = null;

    const findAutomationCenter = () => {
      const center = document.querySelector<HTMLElement>(".automation-center");
      if (!center) {
        if (currentMount && !currentMount.isConnected) {
          currentMount = null;
          setTarget(null);
        }
        return;
      }

      let mount = center.querySelector<HTMLDivElement>(
        "#documio-automation-run-now-root",
      );
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-automation-run-now-root";
        const lastRun = center.querySelector(".automation-last-run");
        if (lastRun) lastRun.insertAdjacentElement("afterend", mount);
        else center.prepend(mount);
      }

      if (currentMount !== mount) {
        currentMount = mount;
        setTarget(mount);
      }
    };

    findAutomationCenter();
    const observer = new MutationObserver(findAutomationCenter);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function runNow() {
    if (mode !== "advanced" || state.status === "running") return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setState({ status: "error", message: "Connessione a DocuMio non disponibile." });
      return;
    }

    setState({ status: "running" });
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setState({ status: "error", message: "Accedi di nuovo a DocuMio e riprova." });
      return;
    }

    try {
      const response = await fetch("/api/automation/run-now", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "advanced" }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; summary?: RunSummary; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Controllo non riuscito.");
      }

      setState({ status: "success", summary: result?.summary ?? {} });
      window.dispatchEvent(new CustomEvent("documio-automation-refresh"));
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Controllo non riuscito.",
      });
    }
  }

  if (!target) return null;

  const disabled = mode !== "advanced" || state.status === "running";

  return createPortal(
    <div className="automation-run-now">
      <button
        type="button"
        onClick={() => void runNow()}
        disabled={disabled}
        aria-busy={state.status === "running"}
      >
        {state.status === "running" ? (
          <Loader2 className="automation-spin" size={18} />
        ) : (
          <Play size={18} fill="currentColor" />
        )}
        <span>
          <strong>
            {state.status === "running"
              ? "Controllo in corso…"
              : "Esegui controllo adesso"}
          </strong>
          <small>
            {mode === "standard"
              ? "Disponibile soltanto con IA avanzata"
              : "Controlla subito email, documenti e scadenze"}
          </small>
        </span>
      </button>

      {state.status === "success" && (
        <div className="automation-run-result success" role="status">
          <CheckCircle2 size={18} />
          <span>
            <strong>Controllo completato</strong>
            <small>
              {Number(state.summary.analyzed ?? 0)} email analizzate ·{" "}
              {Number(state.summary.imported ?? 0)} documenti importati ·{" "}
              {Number(state.summary.trashed ?? 0)} email nel cestino ·{" "}
              {Number(state.summary.notifications ?? 0)} avvisi
            </small>
            {(state.summary.warnings?.length ?? 0) > 0 && (
              <em>{state.summary.warnings?.[0]}</em>
            )}
          </span>
        </div>
      )}

      {state.status === "error" && (
        <div className="automation-run-result error" role="alert">
          <TriangleAlert size={18} />
          <span>
            <strong>Controllo non completato</strong>
            <small>{state.message}</small>
          </span>
        </div>
      )}
    </div>,
    target,
  );
}
