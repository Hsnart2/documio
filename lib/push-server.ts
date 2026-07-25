import {
  createHash,
  createPrivateKey,
  sign,
} from "node:crypto";

const DAY_MS = 86_400_000;

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  lookup_key: string;
  failure_count: number | null;
};

type AutomationNotificationRow = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "urgent";
  document_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured() {
  return Boolean(readVapidConfig());
}

export function getVapidPublicKey() {
  return readVapidConfig()?.publicKey ?? null;
}

export function lookupKeyForSubscription(endpoint: string, authSecret: string) {
  return createHash("sha256")
    .update(`${endpoint}|${authSecret}`)
    .digest("hex");
}

function vapidAuthorization(endpoint: string, config: VapidConfig) {
  const publicBytes = Buffer.from(config.publicKey, "base64url");
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error("Chiave pubblica VAPID non valida.");
  }

  const privateBytes = Buffer.from(config.privateKey, "base64url");
  if (privateBytes.length !== 32) {
    throw new Error("Chiave privata VAPID non valida.");
  }

  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
      d: privateBytes.toString("base64url"),
    },
  });

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64Url(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: now + 12 * 60 * 60,
      sub: config.subject,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${unsigned}.${base64Url(signature)}`;
  return `vapid t=${token}, k=${config.publicKey}`;
}

async function sendEmptyPush(subscription: PushSubscriptionRow) {
  const config = readVapidConfig();
  if (!config) {
    return {
      ok: false,
      status: 0,
      error: "Variabili VAPID mancanti.",
      gone: false,
    };
  }

  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(subscription.endpoint, config),
        TTL: "300",
        Urgency: "normal",
      },
      body: null,
      cache: "no-store",
    });

    const gone = response.status === 404 || response.status === 410;
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok
        ? null
        : `Servizio push ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`,
      gone,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Invio push non riuscito.",
      gone: false,
    };
  }
}

export async function sendPendingPushNotifications(
  admin: any,
  userId: string,
) {
  if (!isWebPushConfigured()) {
    return {
      configured: false,
      sent: 0,
      deviceDeliveries: 0,
      errors: [] as string[],
    };
  }

  const [{ data: subscriptionRows, error: subscriptionError }, { data: notificationRows, error: notificationError }] =
    await Promise.all([
      admin
        .from("push_subscriptions")
        .select(
          "id,user_id,endpoint,p256dh,auth_secret,lookup_key,failure_count",
        )
        .eq("user_id", userId)
        .eq("enabled", true),
      admin
        .from("automation_notifications")
        .select("id,title,body,severity,document_id,metadata,created_at")
        .eq("user_id", userId)
        .is("push_sent_at", null)
        .gte("created_at", new Date(Date.now() - 7 * DAY_MS).toISOString())
        .order("created_at", { ascending: true })
        .limit(12),
    ]);

  if (subscriptionError || notificationError) {
    return {
      configured: true,
      sent: 0,
      deviceDeliveries: 0,
      errors: [
        subscriptionError?.message ?? notificationError?.message ?? "Lettura push non riuscita.",
      ],
    };
  }

  const subscriptions = (subscriptionRows ?? []) as PushSubscriptionRow[];
  const notifications = (notificationRows ?? []) as AutomationNotificationRow[];
  if (!subscriptions.length || !notifications.length) {
    return {
      configured: true,
      sent: 0,
      deviceDeliveries: 0,
      errors: [] as string[],
    };
  }

  let sent = 0;
  let deviceDeliveries = 0;
  const errors: string[] = [];

  for (const notification of notifications) {
    let notificationDelivered = false;

    for (const subscription of subscriptions) {
      const { data: delivery, error: deliveryError } = await admin
        .from("push_deliveries")
        .upsert(
          {
            subscription_id: subscription.id,
            notification_id: notification.id,
          },
          { onConflict: "subscription_id,notification_id" },
        )
        .select("id,sent_at")
        .single();

      if (deliveryError || !delivery) {
        errors.push(deliveryError?.message ?? "Coda push non disponibile.");
        continue;
      }

      if (delivery.sent_at) {
        notificationDelivered = true;
        continue;
      }

      const result = await sendEmptyPush(subscription);
      if (result.ok) {
        const now = new Date().toISOString();
        notificationDelivered = true;
        deviceDeliveries += 1;
        await Promise.all([
          admin
            .from("push_deliveries")
            .update({ sent_at: now, error: null })
            .eq("id", delivery.id),
          admin
            .from("push_subscriptions")
            .update({
              failure_count: 0,
              last_success_at: now,
              enabled: true,
            })
            .eq("id", subscription.id),
        ]);
      } else if (result.gone) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", subscription.id);
      } else {
        const message = result.error ?? "Invio push non riuscito.";
        errors.push(message);
        await Promise.all([
          admin
            .from("push_deliveries")
            .update({ error: message })
            .eq("id", delivery.id),
          admin
            .from("push_subscriptions")
            .update({
              failure_count: Math.max(0, Number(subscription.failure_count) || 0) + 1,
            })
            .eq("id", subscription.id),
        ]);
      }
    }

    if (notificationDelivered) {
      sent += 1;
      await admin
        .from("automation_notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("user_id", userId);
    }
  }

  return { configured: true, sent, deviceDeliveries, errors };
}
