import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, "app", "SmartHomeV2.tsx"),
  path.join(root, "app", "page.tsx"),
];

for (const target of targets) {
  let source = await readFile(target, "utf8");
  source = source.replaceAll('fetch("/api/assistant", {', 'fetch("/api/document-brain", {');
  source = source.replaceAll("fetch('/api/assistant', {", "fetch('/api/document-brain', {");
  await writeFile(target, source, "utf8");
}

console.log("Applied direct Document Brain endpoint to all assistant interfaces.");
