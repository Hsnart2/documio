"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type PasskeyResult = Promise<{ error: { message: string } | null }>;
type PasskeyAuth = {
  registerPasskey: () => PasskeyResult;
  signInWithPasskey: () => PasskeyResult;
};

export default function PasskeyControls() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" && "PublicKeyCredential" in window,
    );

    const supabase = getSupabaseClient();
    if (!supabase) {
      setSignedIn(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!supported || signedIn === null) return null;

  async function handlePasskey() {
    const supabase = getSupabaseClient();
    if (!supabase || busy) return;

    const passkeyAuth = supabase.auth as unknown as PasskeyAuth;
    setBusy(true);

    try {
      const { error } = signedIn
        ? await passkeyAuth.registerPasskey()
        : await passkeyAuth.signInWithPasskey();

      if (error) {
        if (!error.message.toLowerCase().includes("cancel")) {
          window.alert(error.message);
        }
        return;
      }

      if (signedIn) {
        window.alert(
          "Face ID attivato. Da ora puoi accedere senza password.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handlePasskey()}
      disabled={busy}
      aria-label={signedIn ? "Attiva Face ID" : "Accedi con Face ID"}
      title={signedIn ? "Attiva Face ID" : "Accedi con Face ID"}
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid #111827",
        borderRadius: 999,
        padding: "12px 16px",
        background: "#111827",
        color: "white",
        fontWeight: 800,
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.28)",
        opacity: busy ? 0.7 : 1,
      }}
    >
      <Fingerprint size={20} />
      <span>
        {busy
          ? "Attendi…"
          : signedIn
            ? "Attiva Face ID"
            : "Accedi con Face ID"}
      </span>
    </button>
  );
}
