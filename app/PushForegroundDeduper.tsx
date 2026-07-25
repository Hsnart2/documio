"use client";

import { useEffect } from "react";

const LAST_BROWSER_NOTIFICATION_KEY =
  "documio-last-automation-browser-notification";

export default function PushForegroundDeduper() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; notificationId?: string | null }
        | null;
      if (
        data?.type !== "documio-push-shown" ||
        typeof data.notificationId !== "string" ||
        !data.notificationId
      ) {
        return;
      }
      try {
        localStorage.setItem(
          LAST_BROWSER_NOTIFICATION_KEY,
          data.notificationId,
        );
      } catch {
        // Il deduplicatore è facoltativo.
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
