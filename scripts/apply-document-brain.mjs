import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const middlewarePath = path.join(root, "middleware.ts");
const smartHomePath = path.join(root, "app", "SmartHomeV2.tsx");
const pagePath = path.join(root, "app", "page.tsx");

let middleware = await readFile(middlewarePath, "utf8");
const assistantStart = middleware.indexOf('  if (request.nextUrl.pathname === "/api/assistant") {');
const assistantEnd = middleware.indexOf("\n  if (!PROTECTED_API_PATHS.has", assistantStart);
if (assistantStart >= 0 && assistantEnd > assistantStart) {
  const replacement = `  if (request.nextUrl.pathname === "/api/assistant") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/api/document-brain";
    return NextResponse.rewrite(destination);
  }
`;
  middleware = middleware.slice(0, assistantStart) + replacement + middleware.slice(assistantEnd);
}
await writeFile(middlewarePath, middleware, "utf8");

let smartHome = await readFile(smartHomePath, "utf8");
if (!smartHome.includes("conversation: messages.slice(-10)")) {
  smartHome = smartHome.replace(
    '        body: JSON.stringify({ question: clean, language: "it" }),',
    `        body: JSON.stringify({
          question: clean,
          language: "it",
          conversation: messages.slice(-10).map((message) => ({
            role: message.role,
            text: message.text,
          })),
        }),`,
  );
}
smartHome = smartHome.replace(
  "DocuMio risponde usando il tuo archivio reale.",
  "DocuMio AI legge e ragiona soltanto sul tuo archivio reale.",
);
await writeFile(smartHomePath, smartHome, "utf8");

let page = await readFile(pagePath, "utf8");
if (!page.includes("conversation: assistantMessages.slice(-10)")) {
  if (page.includes("conversation: assistantMessages.slice(-8)")) {
    page = page.replace(
      "conversation: assistantMessages.slice(-8)",
      "conversation: assistantMessages.slice(-10)",
    );
  } else {
    const assistantRequestPattern = /(body:\s*JSON\.stringify\(\{\s*\n\s*question:\s*cleanQuestion,\s*\n\s*language,)/;
    const match = page.match(assistantRequestPattern);

    if (match) {
      page = page.replace(
        assistantRequestPattern,
        `$1\n          conversation: assistantMessages.slice(-10).map((message) => ({\n            role: message.role,\n            text: message.text,\n          })),`,
      );
    } else {
      console.warn("Legacy assistant request body not found; Document Brain routing remains active.");
    }
  }
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

console.log("Applied DocuMio Document Brain routing and conversation context to both interfaces.");
