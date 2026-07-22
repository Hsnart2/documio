"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Fingerprint } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

const STORAGE_KEY = "documio_passkey_enabled";

function findSettingsPanel(): HTMLElement | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));
  return (
    sections.find((section) => {
      const heading = section.querySelector("h2");
      const text = heading?.textContent?.trim().toLowerCase();
      return text === "impostazioni" || text === "settings";
    }) ?? null
  );
}

export default function PasskeyControls() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<HTMLElement | null>(null);
  const [loginPanel, setLoginPanel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");

    const supabase = getSupabaseClient();
    if (!supabase) {
      setSignedIn(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (signedIn === null) return;

    const refreshTargets = () => {
      setSettingsPanel(signedIn ? findSettingsPanel() : null);
      setLoginPanel(!signedIn ? document.querySelector<HTMLElement>("main") : null);
    };

    refreshTargets();
    const observer = new MutationObserver(refreshTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [signedIn]);

  if (!supported || signedIn === null) return null;

  async function activatePasskey() {
    const supabase = getSupabaseClient();
    if (!supabase || busy) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) {
        const message = error.message.toLowerCase();
        if (!message.includes("cancel") && !message.includes("abort")) {
          window.alert(error.message);
        }
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, "1");
      setEnabled(true);
      window.alert("Face ID attivato. Da ora comparirà nella schermata di accesso su questo dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  function disablePasskeyOnDevice() {
    window.localStorage.removeItem(STORAGE_KEY);
    setEnabled(false);
    window.alert("Accesso con Face ID nascosto su questo dispositivo.");
  }

  async function signInWithPasskey() {
    const supabase = getSupabaseClient();
    if (!supabase || busy) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) {
        const message = error.message.toLowerCase();
        if (!message.includes("cancel") && !message.includes("abort")) {
          window.alert(error.message);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const settingsControl = signedIn && settingsPanel
    ? createPortal(
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Fingerprint size={18} /> Face ID
          </strong>
          <p style={{ margin: "8px 0 12px", color: "#64748b", fontSize: 14, lineHeight: 1.45 }}>
            {enabled
              ? "Face ID è attivo su questo dispositivo e comparirà nella schermata di accesso."
              : "Attiva Face ID per accedere più velocemente da questo dispositivo."}
          </p>
          <button
            type="button"
            onClick={() => void (enabled ? disablePasskeyOnDevice() : activatePasskey())}
            disabled={busy}
            style={{
              width: "100%",
              minHeight: 48,
              border: 0,
              borderRadius: 12,
              background: enabled ? "#e2e8f0" : "#111827",
              color: enabled ? "#0f172a" : "white",
              fontWeight: 800,
            }}
          >
            {busy ? "Attendi…" : enabled ? "Disattiva Face ID su questo dispositivo" : "Attiva Face ID"}
          </button>
        </div>,
        settingsPanel,
      )
    : null;

  const loginControl = !signedIn && enabled && loginPanel
    ? createPortal(
        <button
          type="button"
          onClick={() => void signInWithPasskey()}
          disabled={busy}
          style={{
            width: "100%",
            minHeight: 52,
            marginTop: 10,
            border: "1px solid #111827",
            borderRadius: 12,
            background: "#111827",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontWeight: 800,
            fontSize: 16,
          }}
        >
          <Fingerprint size={21} />
          {busy ? "Attendi…" : "Accedi con Face ID"}
        </button>,
        loginPanel,
      )
    : null;

  return (
    <>
      {settingsControl}
      {loginControl}
    </>
  );
}
