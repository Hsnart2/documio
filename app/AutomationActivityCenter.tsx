"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BellRing,
  CheckCheck,
  Clock3,
  FileDown,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type UiMode = "advanced" | "standard";

type AutomationPreference = {
  ui_mode: UiMode;
  daily_email_enabled: boolean;
  trash_promotions_enabled: boolean;
  import_documents_enabled: boolean;
  email_digest_enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_summary: Record<string, unknown> | null;
};

type ActivityItem = {
  id: string;
  action_type: string;
  title: string;
  detail: string | null;
  status: "completed" | "skipped" | "warning" | "failed";
  entity_type: string | null;
  entity_id: string | null;
  recoverable: boolean;
  created_at: string;
};

type NotificationItem = {
  id: string;
  type: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  body: string;
  document_id: string | null;
  read_at: string | null;
  created_at: string;
};

const MODE_KEY = "documio-ui-mode";
const LAST_BROWSER_NOTIFICATION_KEY = "documio-last-automation-browser-notification";

function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === "standard" ? "standard" : "advanced";
  } catch {
    return "advanced";
  }
}

function formatDate(value: string | null) {
  if (!value) return "Mai eseguito";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function activityIcon(item: ActivityItem) {
  if (item.status === "failed") return <TriangleAlert size={17} />;
  if (item.action_type === "gmail_cleanup") return <Trash2 size={17} />;
  if (item.action_type === "email_document_imported") return <FileDown size={17} />;
  if (item.action_type === "alerts_created") return <BellRing size={17} />;
  return <Sparkles size={17} />;
}

export default function AutomationActivityCenter() {
  const [mode, setMode] = useState<UiMode>("advanced");
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [preference, setPreference] = useState<AutomationPreference | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (!user) return;

    setLoading(true);
    setError("");
    const [preferenceResult, activityResult, notificationResult] = await Promise.all([
      supabase
        .from("automation_preferences")
        .select(
          "ui_mode,daily_email_enabled,trash_promotions_enabled,import_documents_enabled,email_digest_enabled,last_run_at,last_run_status,last_run_summary",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("automation_activity")
        .select(
          "id,action_type,title,detail,status,entity_type,entity_id,recoverable,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("automation_notifications")
        .select("id,type,severity,title,body,document_id,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const firstError =
      preferenceResult.error ?? activityResult.error ?? notificationResult.error;
    if (firstError) {
      if (!firstError.message.includes("does not exist")) {
        setError(firstError.message);
      }
      setLoading(false);
      return;
    }

    setPreference((preferenceResult.data as AutomationPreference | null) ?? null);
    setActivities((activityResult.data as ActivityItem[] | null) ?? []);
    setNotifications((notificationResult.data as NotificationItem[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    setMode(readMode());
    void load();
    const supabase = getSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      if (session?.user) void load();
      else {
        setActivities([]);
        setNotifications([]);
        setPreference(null);
      }
    }).data.subscription;

    const onModeChange = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: UiMode }>).detail?.mode;
      setMode(next === "standard" ? "standard" : "advanced");
      window.setTimeout(() => void load(), 300);
    };
    window.addEventListener("documio-ui-mode-changed", onModeChange);
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      subscription?.unsubscribe();
      window.removeEventListener("documio-ui-mode-changed", onModeChange);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    let currentMount: HTMLDivElement | null = null;
    const findSettingsModal = () => {
      const heading = Array.from(document.querySelectorAll("h2")).find((item) => {
        const text = item.textContent?.trim().toLowerCase();
        return text === "impostazioni" || text === "settings";
      });
      const section = heading?.closest("section");
      if (!(section instanceof HTMLElement)) {
        if (currentMount && !currentMount.isConnected) {
          currentMount = null;
          setTarget(null);
        }
        return;
      }

      let mount = section.querySelector<HTMLDivElement>(
        "#documio-automation-activity-root",
      );
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-automation-activity-root";
        const modeRoot = section.querySelector("#documio-ui-mode-settings-root");
        if (modeRoot) modeRoot.insertAdjacentElement("afterend", mount);
        else section.appendChild(mount);
      }
      if (currentMount !== mount) {
        currentMount = mount;
        setTarget(mount);
        void load();
      }
    };

    findSettingsModal();
    const observer = new MutationObserver(findSettingsModal);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [load]);

  const unread = useMemo(
    () => notifications.filter((item) => !item.read_at),
    [notifications],
  );

  useEffect(() => {
    const newest = unread[0];
    if (!newest || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    let lastShown = "";
    try {
      lastShown = localStorage.getItem(LAST_BROWSER_NOTIFICATION_KEY) ?? "";
    } catch {
      lastShown = "";
    }
    if (lastShown === newest.id) return;
    new Notification(newest.title, {
      body: newest.body,
      icon: "/icon-192.png",
      tag: `documio-${newest.id}`,
    });
    try {
      localStorage.setItem(LAST_BROWSER_NOTIFICATION_KEY, newest.id);
    } catch {
      // Nessun problema: l'avviso potrà ricomparire alla prossima sessione.
    }
  }, [unread]);

  async function updatePreference(
    key:
      | "daily_email_enabled"
      | "trash_promotions_enabled"
      | "import_documents_enabled"
      | "email_digest_enabled",
    value: boolean,
  ) {
    if (!userId || mode === "standard") return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingKey(key);
    setError("");
    const { error: updateError } = await supabase
      .from("automation_preferences")
      .upsert(
        {
          user_id: userId,
          ui_mode: mode,
          [key]: value,
        },
        { onConflict: "user_id" },
      );
    setSavingKey(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPreference((current) => ({
      ui_mode: mode,
      daily_email_enabled: current?.daily_email_enabled ?? true,
      trash_promotions_enabled: current?.trash_promotions_enabled ?? true,
      import_documents_enabled: current?.import_documents_enabled ?? true,
      email_digest_enabled: current?.email_digest_enabled ?? true,
      last_run_at: current?.last_run_at ?? null,
      last_run_status: current?.last_run_status ?? null,
      last_run_summary: current?.last_run_summary ?? null,
      [key]: value,
    }));
  }

  async function markAllRead() {
    if (!userId || unread.length === 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("automation_notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotifications((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    );
  }

  async function openNotification(item: NotificationItem) {
    const supabase = getSupabaseClient();
    if (supabase && !item.read_at) {
      const readAt = new Date().toISOString();
      await supabase
        .from("automation_notifications")
        .update({ read_at: readAt })
        .eq("id", item.id);
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, read_at: readAt } : entry,
        ),
      );
    }
    if (item.document_id) {
      const targetDocument = document.querySelector(
        `[data-document-id="${item.document_id}"]`,
      );
      targetDocument?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  if (!target) return null;

  const effectivePreference: AutomationPreference =
    preference ?? {
      ui_mode: mode,
      daily_email_enabled: mode === "advanced",
      trash_promotions_enabled: true,
      import_documents_enabled: true,
      email_digest_enabled: true,
      last_run_at: null,
      last_run_status: null,
      last_run_summary: null,
    };
  const disabled = mode === "standard";

  return createPortal(
    <section className="automation-center">
      <header className="automation-center-header">
        <span className="automation-center-icon"><ShieldCheck size={20} /></span>
        <div>
          <strong>Automazione giornaliera</strong>
          <p>
            {disabled
              ? "Disattivata nella versione Standard: ogni azione richiede il consenso."
              : "DocuMio controlla posta e documenti anche quando non apri l'app."}
          </p>
        </div>
        {loading && <Loader2 className="automation-spin" size={18} />}
      </header>

      <div className={`automation-last-run ${effectivePreference.last_run_status ?? "idle"}`}>
        <Clock3 size={17} />
        <span>
          <strong>Ultimo controllo</strong>
          <small>{formatDate(effectivePreference.last_run_at)}</small>
        </span>
        {effectivePreference.last_run_status === "failed" && <TriangleAlert size={17} />}
      </div>

      <div className="automation-toggles">
        {[
          ["daily_email_enabled", "Controllo quotidiano", "Esegue il controllo programmato ogni giorno", Sparkles],
          ["import_documents_enabled", "Importa documenti", "Scarica PDF e immagini utili ricevuti via email", FileDown],
          ["trash_promotions_enabled", "Pulisci pubblicità", "Sposta nel cestino recuperabile solo email a basso rischio", Trash2],
          ["email_digest_enabled", "Riepilogo via email", "Ti avvisa anche quando DocuMio è chiuso", Mail],
        ].map(([key, label, description, Icon]) => {
          const preferenceKey = key as
            | "daily_email_enabled"
            | "trash_promotions_enabled"
            | "import_documents_enabled"
            | "email_digest_enabled";
          const checked = Boolean(effectivePreference[preferenceKey]);
          return (
            <label key={preferenceKey} className={disabled ? "disabled" : ""}>
              <span className="automation-toggle-copy">
                <Icon size={17} />
                <span><strong>{label as string}</strong><small>{description as string}</small></span>
              </span>
              {savingKey === preferenceKey ? (
                <Loader2 className="automation-spin" size={18} />
              ) : (
                <input
                  type="checkbox"
                  checked={!disabled && checked}
                  disabled={disabled}
                  onChange={(event) =>
                    void updatePreference(preferenceKey, event.target.checked)
                  }
                />
              )}
            </label>
          );
        })}
      </div>

      {error && <div className="automation-center-error">{error}</div>}

      <div className="automation-center-section-heading">
        <div><BellRing size={17} /><strong>Avvisi IA</strong><span>{unread.length} nuovi</span></div>
        {unread.length > 0 && (
          <button type="button" onClick={() => void markAllRead()}>
            <CheckCheck size={16} /> Segna letti
          </button>
        )}
      </div>
      <div className="automation-notification-list">
        {notifications.length === 0 ? (
          <p className="automation-empty">Nessun nuovo avviso automatico.</p>
        ) : (
          notifications.slice(0, 6).map((item) => (
            <button
              type="button"
              key={item.id}
              className={`automation-notification ${item.severity} ${item.read_at ? "read" : "unread"}`}
              onClick={() => void openNotification(item)}
            >
              <span><strong>{item.title}</strong><small>{item.body}</small></span>
              {!item.read_at && <i />}
            </button>
          ))
        )}
      </div>

      <div className="automation-center-section-heading">
        <div><RotateCcw size={17} /><strong>Registro attività IA</strong></div>
      </div>
      <div className="automation-activity-list">
        {activities.length === 0 ? (
          <p className="automation-empty">Il registro si riempirà dopo il primo controllo giornaliero.</p>
        ) : (
          activities.slice(0, 8).map((item) => (
            <article key={item.id} className={`automation-activity ${item.status}`}>
              <span className="automation-activity-icon">{activityIcon(item)}</span>
              <span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}<time>{formatDate(item.created_at)}</time></span>
              {item.recoverable && <em>Recuperabile</em>}
            </article>
          ))
        )}
      </div>
    </section>,
    target,
  );
}
