"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BellRing,
  CheckCircle2,
  Loader2,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type PushConfiguration = {
  configured: boolean;
  publicKey: string | null;
  subscriptionCount: number;
};

function isIosDevice() {
  const platform = navigator.platform ?? "";
  const userAgent = navigator.userAgent ?? "";
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function deviceLabel() {
  const userAgent = navigator.userAgent ?? "";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Computer Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  return "Dispositivo web";
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function authHeaders(contentType = true) {
  const supabase = getSupabaseClient();
  const { data } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const token = data.session?.access_token;
  return {
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function registerServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  return registration;
}

export default function PushNotificationControls() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [supported, setSupported] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [configuration, setConfiguration] =
    useState<PushConfiguration | null>(null);
  const [active, setActive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const nextIos = isIosDevice();
    const nextStandalone = isStandaloneMode();
    const nextSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIos(nextIos);
    setStandalone(nextStandalone);
    setSupported(nextSupported);
    setPermission(
      typeof Notification === "undefined" ? "default" : Notification.permission,
    );

    const supabase = getSupabaseClient();
    const {
      data: { user },
    } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null } };
    if (!user) {
      setLoading(false);
      setActive(false);
      return;
    }

    try {
      let subscription: PushSubscription | null = null;
      if (nextSupported) {
        const registration = await registerServiceWorker();
        subscription = await registration.pushManager.getSubscription();
      }
      setActive(Boolean(subscription));

      const response = await fetch("/api/push/subscription", {
        headers: await authHeaders(false),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as
        | (PushConfiguration & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "Stato notifiche non disponibile.");
      }
      setConfiguration(result);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Stato notifiche non disponibile.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = getSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void load();
      else {
        setActive(false);
        setConfiguration(null);
      }
    }).data.subscription;

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => setStandalone(isStandaloneMode());
    standaloneQuery.addEventListener?.("change", onDisplayModeChange);
    return () => {
      subscription?.unsubscribe();
      standaloneQuery.removeEventListener?.("change", onDisplayModeChange);
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
        "#documio-push-settings-root",
      );
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-push-settings-root";
        const automationRoot = section.querySelector(
          "#documio-automation-activity-root",
        );
        const modeRoot = section.querySelector("#documio-ui-mode-settings-root");
        if (automationRoot) automationRoot.insertAdjacentElement("beforebegin", mount);
        else if (modeRoot) modeRoot.insertAdjacentElement("afterend", mount);
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

  async function enablePush() {
    if (working) return;
    setWorking(true);
    setError("");
    setMessage("");

    try {
      if (!supported) {
        throw new Error(
          ios && !standalone
            ? "Su iPhone aggiungi prima DocuMio alla schermata Home e aprilo dalla nuova icona."
            : "Questo browser non supporta le notifiche push.",
        );
      }
      if (ios && !standalone) {
        throw new Error(
          "Su iPhone apri DocuMio da Safari, premi Condividi e scegli “Aggiungi alla schermata Home”. Poi aprilo dall’icona.",
        );
      }

      let config = configuration;
      if (!config) {
        const configResponse = await fetch("/api/push/subscription", {
          headers: await authHeaders(false),
          cache: "no-store",
        });
        config = await configResponse.json();
        if (!configResponse.ok) {
          throw new Error(
            (config as PushConfiguration & { error?: string })?.error ??
              "Configurazione push non disponibile.",
          );
        }
        setConfiguration(config);
      }
      if (!config.configured || !config.publicKey) {
        throw new Error(
          "Le notifiche push sono installate, ma mancano ancora le chiavi VAPID su Vercel.",
        );
      }

      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        throw new Error(
          nextPermission === "denied"
            ? "Le notifiche sono state bloccate nelle impostazioni del dispositivo."
            : "Permesso notifiche non concesso.",
        );
      }

      const registration = await registerServiceWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        });
      }

      const serialized = subscription.toJSON();
      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: serialized.keys,
          userAgent: navigator.userAgent,
          deviceLabel: deviceLabel(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Attivazione push non riuscita.");
      }

      setActive(true);
      setMessage("Notifiche push attive su questo dispositivo.");
      setConfiguration((current) =>
        current
          ? {
              ...current,
              subscriptionCount: Math.max(1, current.subscriptionCount),
            }
          : current,
      );
    } catch (enableError) {
      setError(
        enableError instanceof Error
          ? enableError.message
          : "Attivazione push non riuscita.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function disablePush() {
    if (working || !supported) return;
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: await authHeaders(),
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error ?? "Disattivazione non riuscita.");
        }
        await subscription.unsubscribe();
      }
      setActive(false);
      setMessage("Notifiche push disattivate su questo dispositivo.");
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "Disattivazione non riuscita.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function sendTest() {
    if (testing || !active) return;
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: await authHeaders(),
        body: "{}",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Notifica di prova non inviata.");
      }
      setMessage("Notifica di prova inviata. Puoi anche chiudere DocuMio per verificarla.");
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Notifica di prova non inviata.",
      );
    } finally {
      setTesting(false);
    }
  }

  const status = useMemo(() => {
    if (loading) return "Controllo in corso";
    if (active) return "Attive";
    if (permission === "denied") return "Bloccate";
    return "Non attive";
  }, [active, loading, permission]);

  if (!target) return null;

  return createPortal(
    <section className="push-settings-card">
      <header>
        <span className="push-settings-icon">
          <BellRing size={21} />
        </span>
        <span>
          <strong>Notifiche push sul telefono</strong>
          <small>
            Ricevi avvisi di scadenze, documenti importati e controlli IA anche con
            DocuMio chiuso.
          </small>
        </span>
        <em className={active ? "active" : ""}>{status}</em>
      </header>

      {ios && !standalone && (
        <div className="push-install-help">
          <Smartphone size={19} />
          <span>
            <strong>Prima installa la web app su iPhone</strong>
            <small>
              Apri DocuMio in Safari, premi Condividi → Aggiungi alla schermata Home,
              poi aprilo dalla nuova icona.
            </small>
          </span>
        </div>
      )}

      {!supported && !(ios && !standalone) && !loading && (
        <div className="push-settings-warning">
          <TriangleAlert size={18} /> Questo browser non supporta Web Push.
        </div>
      )}

      {configuration && !configuration.configured && (
        <div className="push-settings-warning">
          <TriangleAlert size={18} /> Mancano le chiavi VAPID nelle variabili Vercel.
        </div>
      )}

      {message && (
        <div className="push-settings-success">
          <CheckCircle2 size={18} /> {message}
        </div>
      )}
      {error && (
        <div className="push-settings-error">
          <TriangleAlert size={18} /> {error}
        </div>
      )}

      <div className="push-settings-actions">
        {active ? (
          <>
            <button
              type="button"
              className="push-test-button"
              onClick={() => void sendTest()}
              disabled={testing || working}
            >
              {testing ? <Loader2 className="push-spin" size={18} /> : <Send size={18} />}
              Invia prova
            </button>
            <button
              type="button"
              onClick={() => void disablePush()}
              disabled={working}
            >
              {working && <Loader2 className="push-spin" size={18} />}
              Disattiva su questo dispositivo
            </button>
          </>
        ) : (
          <button
            type="button"
            className="push-enable-button"
            onClick={() => void enablePush()}
            disabled={loading || working || (!supported && !(ios && !standalone))}
          >
            {working ? <Loader2 className="push-spin" size={18} /> : <BellRing size={18} />}
            Attiva notifiche push
          </button>
        )}
      </div>

      <p className="push-settings-note">
        Ogni dispositivo va attivato una sola volta. Le notifiche mostrano solo il
        titolo e l’avviso; i documenti restano protetti dentro DocuMio.
      </p>
    </section>,
    target,
  );
}
