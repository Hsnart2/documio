import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function patchDailyAutomation() {
  const routePath = path.join(
    root,
    "app",
    "api",
    "cron",
    "daily-automation",
    "route.ts",
  );
  let source = await readFile(routePath, "utf8");
  const importMarker =
    'import { decryptEmailSecret, encryptEmailSecret } from "@/lib/email-crypto";';
  const pushImport =
    'import { sendPendingPushNotifications } from "@/lib/push-server";';

  if (!source.includes(pushImport) && source.includes(importMarker)) {
    source = source.replace(importMarker, `${importMarker}\n${pushImport}`);
  }

  const marker = `    if (preference.email_digest_enabled) {
      await sendDigest(admin, userId, digestItems);
    }

    await logActivity(admin, {`;
  const sentinel = "web-push-daily-delivery";
  if (!source.includes(sentinel) && source.includes(marker)) {
    source = source.replace(
      marker,
      `    if (preference.email_digest_enabled) {
      await sendDigest(admin, userId, digestItems);
    }

    // ${sentinel}: invia gli avvisi già creati ai dispositivi PWA registrati.
    const pushResult = await sendPendingPushNotifications(admin, userId);
    if (pushResult.deviceDeliveries > 0) {
      await logActivity(admin, {
        userId,
        runId,
        actionType: "push_notifications_sent",
        title: \\`${"${pushResult.sent}"} notifiche push inviate\\`,
        detail: \\`${"${pushResult.deviceDeliveries}"} consegne ai dispositivi registrati.\\`,
        metadata: pushResult,
      });
    }
    if (pushResult.errors.length) {
      summary.warnings.push(
        ...pushResult.errors.slice(0, 3).map((message) => \\`Push: ${"${message}"}\\`),
      );
    }

    await logActivity(admin, {`,
    );
  }

  await writeFile(routePath, source, "utf8");
}

async function patchPracticeAnchors() {
  const pagePath = path.join(root, "app", "page.tsx");
  let source = await readFile(pagePath, "utf8");
  const marker = '<article className="doc-card" key={practice.id}>';
  if (!source.includes('data-practice-id={practice.id}') && source.includes(marker)) {
    source = source.replace(
      marker,
      '<article className="doc-card" key={practice.id} data-practice-id={practice.id}>',
    );
  }
  await writeFile(pagePath, source, "utf8");
}

await patchDailyAutomation();
await patchPracticeAnchors();
console.log("Applied web push integration.");
