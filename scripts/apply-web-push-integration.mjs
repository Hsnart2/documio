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
        title: pushResult.sent + " notifiche push inviate",
        detail: pushResult.deviceDeliveries + " consegne ai dispositivi registrati.",
        metadata: pushResult,
      });
    }
    if (pushResult.errors.length) {
      summary.warnings.push(
        ...pushResult.errors.slice(0, 3).map((message) => "Push: " + message),
      );
    }

    await logActivity(admin, {`,
    );
  }

  const legacyWindow = `  const today = romeDate();
  const limitDate = addDays(today, 7);`;
  const milestoneWindow = `  const today = romeDate();
  const reminderMilestones = new Set([30, 7, 1, 0]);`;
  if (source.includes(legacyWindow)) {
    source = source.replace(legacyWindow, milestoneWindow);
  }

  const legacyDateFilter = `    if (!dueDate || dueDate < today || dueDate > limitDate) continue;
    const days = daysBetween(today, dueDate);`;
  const milestoneDateFilter = `    if (!dueDate || dueDate < today) continue;
    const days = daysBetween(today, dueDate);
    if (!reminderMilestones.has(days)) continue;`;
  if (source.includes(legacyDateFilter)) {
    source = source.replace(legacyDateFilter, milestoneDateFilter);
  }

  source = source.replace(
    '      severity: days <= 1 ? "urgent" : "warning",',
    '      severity: days <= 1 ? "urgent" : days <= 7 ? "warning" : "info",',
  );
  source = source.replace(
    '      dedupeKey: `deadline:${document.id}:${dueDate}`,',
    '      dedupeKey: `scheduled-reminder:${document.id}:${dueDate}:d${days}`,',
  );
  source = source.replace(
    "      metadata: { dueDate },",
    "      metadata: { dueDate, days, source: \"daily-automation\" },",
  );

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

async function patchPushControls() {
  const controlsPath = path.join(root, "app", "PushNotificationControls.tsx");
  let source = await readFile(controlsPath, "utf8");
  source = source.replace(
    "if (!config.configured || !config.publicKey) {",
    "if (!config || !config.configured || !config.publicKey) {",
  );
  await writeFile(controlsPath, source, "utf8");
}

await patchDailyAutomation();
await patchPracticeAnchors();
await patchPushControls();
console.log("Applied web push integration.");
