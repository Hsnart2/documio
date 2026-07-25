import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "cron", "daily-automation", "route.ts");

let source = await readFile(routePath, "utf8");
const before = "type SupabaseAdmin = ReturnType<typeof createClient>;";
const after = "type SupabaseAdmin = any;";

if (source.includes(before)) {
  source = source.replace(before, after);
  await writeFile(routePath, source, "utf8");
  console.log("Normalized daily automation Supabase helper typing.");
} else {
  console.log("Daily automation Supabase helper typing already normalized.");
}
