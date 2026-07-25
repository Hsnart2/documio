import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cronRoutePath = path.join(
  root,
  "app",
  "api",
  "cron",
  "daily-automation",
  "route.ts",
);
const activityCenterPath = path.join(root, "app", "AutomationActivityCenter.tsx");

let cronSource = await readFile(cronRoutePath, "utf8");
let activitySource = await readFile(activityCenterPath, "utf8");
let changed = false;

const adminAnchor = `  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: preferences, error } = await admin`;

const adminReplacement = `  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const requestedUserId = request.nextUrl.searchParams.get("userId")?.trim() || null;
  if (
    requestedUserId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedUserId)
  ) {
    return NextResponse.json({ error: "Identificativo utente non valido." }, { status: 400 });
  }
  const { data: preferences, error } = await admin`;

if (cronSource.includes(adminAnchor)) {
  cronSource = cronSource.replace(adminAnchor, adminReplacement);
  changed = true;
}

const queryAnchor = `    .eq("ui_mode", "advanced")
    .eq("daily_email_enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })`;

const queryReplacement = `    .eq("ui_mode", "advanced")
    .eq("daily_email_enabled", true)
    .or(requestedUserId ? \`user_id.eq.\${requestedUserId}\` : "user_id.not.is.null")
    .order("last_run_at", { ascending: true, nullsFirst: true })`;

if (cronSource.includes(queryAnchor)) {
  cronSource = cronSource.replace(queryAnchor, queryReplacement);
  changed = true;
}

const listenerAnchor = `    window.addEventListener("documio-ui-mode-changed", onModeChange);
    const interval = window.setInterval(() => void load(), 60_000);`;
const listenerReplacement = `    window.addEventListener("documio-ui-mode-changed", onModeChange);
    const onAutomationRefresh = () => void load();
    window.addEventListener("documio-automation-refresh", onAutomationRefresh);
    const interval = window.setInterval(() => void load(), 60_000);`;

if (activitySource.includes(listenerAnchor)) {
  activitySource = activitySource.replace(listenerAnchor, listenerReplacement);
  changed = true;
}

const cleanupAnchor = `      window.removeEventListener("documio-ui-mode-changed", onModeChange);
      window.clearInterval(interval);`;
const cleanupReplacement = `      window.removeEventListener("documio-ui-mode-changed", onModeChange);
      window.removeEventListener("documio-automation-refresh", onAutomationRefresh);
      window.clearInterval(interval);`;

if (activitySource.includes(cleanupAnchor)) {
  activitySource = activitySource.replace(cleanupAnchor, cleanupReplacement);
  changed = true;
}

if (changed) {
  await Promise.all([
    writeFile(cronRoutePath, cronSource, "utf8"),
    writeFile(activityCenterPath, activitySource, "utf8"),
  ]);
  console.log("Enabled user-scoped manual automation runs.");
} else {
  console.log("Manual automation run support already applied.");
}
