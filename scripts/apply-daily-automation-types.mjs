import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "cron", "daily-automation", "route.ts");

let source = await readFile(routePath, "utf8");
const replacements = [
  [
    "type SupabaseAdmin = ReturnType<typeof createClient>;",
    "type SupabaseAdmin = any;",
  ],
  [
    '.filter((item) => ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachment_type))',
    '.filter((item: { attachment_type: string; document_id: string }) => ["Ricevuta", "Quietanza", "Pagamento"].includes(item.attachment_type))',
  ],
  [
    ".map((item) => item.document_id)",
    ".map((item: { attachment_type: string; document_id: string }) => item.document_id)",
  ],
];

let changed = false;
for (const [before, after] of replacements) {
  if (source.includes(before)) {
    source = source.replace(before, after);
    changed = true;
  }
}

if (changed) {
  await writeFile(routePath, source, "utf8");
  console.log("Normalized daily automation TypeScript inference.");
} else {
  console.log("Daily automation TypeScript inference already normalized.");
}
