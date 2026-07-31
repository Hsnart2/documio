"use client";

import { useEffect, useRef } from "react";

export default function JarvisCasaPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let disposeCurrent: (() => void) | null = null;

    const installContinuousListening = () => {
      disposeCurrent?.();

      const win = frame.contentWindow as any;
      const doc = frame.contentDocument;
      if (!win || !doc) return;

      const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      const preferenceKey = "jarvis-continuous-mic";
      const originalEnable = typeof win.enableVoice === "function" ? win.enableVoice.bind(win) : null;
      const originalSpeak = typeof win.speak === "function" ? win.speak.bind(win) : null;

      let enabled = win.localStorage.getItem(preferenceKey) === "1";
      let recognition: any = null;
      let recognitionRunning = false;
      let jarvisSpeaking = false;
      let blocked = false;
      let restartTimer: ReturnType<typeof setTimeout> | null = null;
      let lastTranscript = "";
      let lastTranscriptAt = 0;

      const updateHint = (text: string, active: boolean) => {
        const hint = doc.getElementById("voiceHint");
        if (!hint) return;
        hint.textContent = text;
        hint.classList.toggle("active", active);
      };

      const setStage = (mode: string) => {
        if (typeof win.stage === "function") win.stage(mode);
      };

      const clearRestart = () => {
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = null;
      };

      const stopRecognition = () => {
        clearRestart();
        if (!recognition) return;
        try {
          recognition.onend = null;
          recognition.abort();
        } catch {}
        recognition = null;
        recognitionRunning = false;
      };

      const scheduleRestart = (delay = 350) => {
        clearRestart();
        if (!enabled || jarvisSpeaking || doc.hidden || blocked) return;
        restartTimer = setTimeout(startListening, delay);
      };

      const startListening = () => {
        clearRestart();
        if (!enabled || jarvisSpeaking || doc.hidden || blocked || recognitionRunning) return;

        if (!Recognition) {
          updateHint("🎙️ Ascolto continuo non disponibile qui", false);
          return;
        }

        const current = new Recognition();
        recognition = current;
        current.lang = "it-IT";
        current.interimResults = false;
        current.continuous = false;
        current.maxAlternatives = 1;

        current.onstart = () => {
          recognitionRunning = true;
          setStage("listening");
          updateHint("🎙️ Ascolto continuo attivo", true);
        };

        current.onresult = (event: any) => {
          const result = event.results?.[event.results.length - 1];
          const transcript = result?.[0]?.transcript?.trim() || "";
          if (!transcript) return;

          const now = Date.now();
          if (transcript === lastTranscript && now - lastTranscriptAt < 1800) return;
          lastTranscript = transcript;
          lastTranscriptAt = now;

          const input = doc.getElementById("q") as HTMLInputElement | null;
          if (input) input.value = transcript;
          if (typeof win.run === "function") win.run();
        };

        current.onerror = (event: any) => {
          recognitionRunning = false;
          const code = event?.error || "";

          if (code === "not-allowed" || code === "service-not-allowed") {
            blocked = true;
            updateHint("🎙️ Tocca una volta per consentire il microfono", false);
            setStage("");
            return;
          }

          if (code === "audio-capture") {
            updateHint("🎙️ Microfono non disponibile", false);
            scheduleRestart(1400);
            return;
          }

          scheduleRestart(code === "no-speech" ? 250 : 800);
        };

        current.onend = () => {
          recognitionRunning = false;
          recognition = null;
          if (enabled && !jarvisSpeaking) scheduleRestart(260);
        };

        try {
          current.start();
        } catch {
          recognitionRunning = false;
          recognition = null;
          scheduleRestart(650);
        }
      };

      const waitUntilJarvisFinishes = () => {
        if (!enabled) return;
        if (win.speechSynthesis?.speaking || jarvisSpeaking) {
          restartTimer = setTimeout(waitUntilJarvisFinishes, 180);
          return;
        }
        scheduleRestart(220);
      };

      const enableContinuousVoice = (greet = true) => {
        enabled = true;
        blocked = false;
        win.localStorage.setItem(preferenceKey, "1");
        updateHint("🎙️ Ascolto continuo attivo", true);

        if (originalEnable) originalEnable(greet);
        if (!greet) scheduleRestart(150);
        else waitUntilJarvisFinishes();

        return true;
      };

      win.enableVoice = enableContinuousVoice;
      win.listen = () => enableContinuousVoice(false);

      if (originalSpeak) {
        win.speak = (text: string, force = false) => {
          jarvisSpeaking = true;
          stopRecognition();
          originalSpeak(text, force);

          const monitor = () => {
            if (win.speechSynthesis?.speaking) {
              restartTimer = setTimeout(monitor, 160);
              return;
            }
            jarvisSpeaking = false;
            setStage("");
            scheduleRestart(420);
          };
          restartTimer = setTimeout(monitor, 180);
        };
      }

      const hint = doc.getElementById("voiceHint");
      if (hint) {
        hint.onclick = (event) => {
          event.preventDefault();
          enableContinuousVoice(true);
        };
      }

      const stage = doc.getElementById("stage");
      if (stage) {
        stage.onclick = () => {
          if (!enabled || blocked) enableContinuousVoice(true);
          else if (typeof win.toast === "function") win.toast("Jarvis è già in ascolto continuo");
        };
      }

      const onVisibilityChange = () => {
        if (doc.hidden) stopRecognition();
        else if (enabled) {
          blocked = false;
          scheduleRestart(450);
        }
      };

      doc.addEventListener("visibilitychange", onVisibilityChange);

      if (enabled) {
        updateHint("🎙️ Ascolto continuo attivo", true);
        scheduleRestart(700);
      } else {
        updateHint("🎙️ Tocca una volta: poi non devi più premere", false);
      }

      disposeCurrent = () => {
        doc.removeEventListener("visibilitychange", onVisibilityChange);
        stopRecognition();
      };
    };

    frame.addEventListener("load", installContinuousListening);
    if (frame.contentDocument?.readyState === "complete") installContinuousListening();

    return () => {
      frame.removeEventListener("load", installContinuousListening);
      disposeCurrent?.();
    };
  }, []);

  return (
    <main style={{ position: "fixed", inset: 0, background: "#050502" }}>
      <iframe
        ref={frameRef}
        src="/jarvis-casa.html"
        title="Jarvis Casa"
        allow="microphone; autoplay"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
