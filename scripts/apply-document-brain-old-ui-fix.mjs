import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "app", "page.tsx");

let page = await readFile(pagePath, "utf8");

if (!page.includes("conversation: assistantMessages.slice(-10)")) {
  const requestStart = `        body: JSON.stringify({\n          question: cleanQuestion,\n          language,`;
  const requestWithContext = `        body: JSON.stringify({\n          question: cleanQuestion,\n          language,\n          conversation: assistantMessages.slice(-10).map((message) => ({\n            role: message.role,\n            text: message.text,\n          })),`;

  if (!page.includes(requestStart)) {
    throw new Error("Old assistant request body not found in app/page.tsx");
  }

  page = page.replace(requestStart, requestWithContext);
}

page = page.replace(
  "Ciao! Posso rispondere usando i dati già estratti dai tuoi documenti.",
  "Ciao! Leggo i tuoi documenti reali, ricordo la conversazione e rispondo senza inventare.",
);
page = page.replace(
  "Hi! I can answer using the information already extracted from your documents.",
  "Hi! I read your actual documents, remember the conversation, and answer without making things up.",
);

await writeFile(pagePath, page, "utf8");
console.log("Applied Document Brain to the legacy assistant UI.");
