const DOCUMIO_ICON = "/documio-icon.svg";
const DOCUMIO_BADGE = "/documio-badge.svg";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function subscriptionLookupKey() {
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) return null;
  const json = subscription.toJSON();
  const auth = json.keys && json.keys.auth ? json.keys.auth : "";
  const source = new TextEncoder().encode(`${subscription.endpoint}|${auth}`);
  return bytesToHex(await crypto.subtle.digest("SHA-256", source));
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const key = await subscriptionLookupKey();
      if (!key) return;

      const response = await fetch(`/api/push/pull?key=${encodeURIComponent(key)}`, {
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok || response.status === 204) return;

      const payload = await response.json();
      if (!payload || !payload.title) return;

      await self.registration.showNotification(payload.title, {
        body: payload.body || "Apri DocuMio per vedere i dettagli.",
        icon: DOCUMIO_ICON,
        badge: DOCUMIO_BADGE,
        tag: payload.tag || `documio-${payload.id || Date.now()}`,
        renotify: true,
        requireInteraction: payload.severity === "urgent",
        data: {
          url: payload.url || "/",
          notificationId: payload.id || null,
          deliveryId: payload.deliveryId || null,
        },
        actions: [{ action: "open", title: "Apri DocuMio" }],
      });

      const openClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of openClients) {
        client.postMessage({
          type: "documio-push-shown",
          notificationId: payload.id || null,
        });
      }

      if (navigator.setAppBadge) {
        try {
          await navigator.setAppBadge(1);
        } catch {
          // Il badge non è disponibile su tutti i dispositivi.
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) {
          try {
            await client.navigate(targetUrl);
          } catch {
            // Alcuni browser non consentono navigate durante il risveglio.
          }
        }
        await client.focus();
        return;
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
