import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "app", "page.tsx");
const middlewarePath = path.join(root, "middleware.ts");
const contextPath = path.join(root, "app", "api", "assistant-context", "route.ts");

let page = await readFile(pagePath, "utf8");
if (!page.includes("conversation: assistantMessages.slice(-8)")) {
  page = page.replace(
    `          question: cleanQuestion,\n          language,`,
    `          question: cleanQuestion,\n          language,\n          conversation: assistantMessages.slice(-8).map((message) => ({\n            role: message.role,\n            text: message.text,\n          })),`,
  );
}
await writeFile(pagePath, page, "utf8");

let middleware = await readFile(middlewarePath, "utf8");
middleware = middleware.replace(
  `      language?: unknown;\n    } | null;`,
  `      language?: unknown;\n      conversation?: Array<{ role?: unknown; text?: unknown }>;\n    } | null;`,
);
if (!middleware.includes("const practiceFollowUp")) {
  middleware = middleware.replace(
    `    const italian = body?.language !== "en";`,
    `    const italian = body?.language !== "en";\n    const currentQuestion = normalizedQuestion(body?.question);\n    const conversationText = Array.isArray(body?.conversation)\n      ? body!.conversation!.slice(-8).map((item) => normalizedQuestion(item?.text)).join(" ")\n      : "";\n    const practiceFollowUp = ["che documenti comprende", "quali documenti comprende", "che documenti contiene", "quali documenti contiene", "cosa comprende", "cosa contiene", "mostrami i documenti"].some((term) => currentQuestion.includes(term));\n    const hasPracticeContext = conversationText.includes("pratica");`,
  );
  middleware = middleware.replace(
    `    const useContext = italian && needsAssistantContext(body?.question);`,
    `    const useContext = italian && (needsAssistantContext(body?.question) || (practiceFollowUp && hasPracticeContext));`,
  );
}
await writeFile(middlewarePath, middleware, "utf8");

let context = await readFile(contextPath, "utf8");
context = context.replace(
  `      language?: "it" | "en";\n    } | null;`,
  `      language?: "it" | "en";\n      conversation?: Array<{ role?: string; text?: string }>;\n    } | null;`,
);
if (!context.includes("const followUpQuestion")) {
  context = context.replace(
    `    const terms = queryTerms(question);`,
    `    const conversationText = Array.isArray(body?.conversation) ? body!.conversation!.slice(-8).map((item) => String(item?.text ?? "")).join(" ") : "";\n    const followUpQuestion = ["che documenti comprende", "quali documenti comprende", "che documenti contiene", "quali documenti contiene", "cosa comprende", "cosa contiene", "mostrami i documenti"].some((term) => normalize(question).includes(term));\n    const terms = queryTerms(followUpQuestion ? conversationText : question);`,
  );
  context = context.replace(
    `    const selected = (matched.length > 0 ? matched : ranked).slice(0, 12);`,
    `    const selected = (matched.length > 0 ? matched : ranked).slice(0, followUpQuestion ? 1 : 12);\n\n    if (followUpQuestion && selected.length === 1) {\n      const practice = selected[0].practice;\n      const linkedDocuments = documentsByPractice.get(practice.id) ?? [];\n      const documentList = linkedDocuments.map((document) => \`• \${document.title || "Documento senza titolo"}\`).join("\\n");\n      return NextResponse.json({\n        answer: linkedDocuments.length ? \`La pratica “\${practice.title || "Pratica senza titolo"}” comprende \${linkedDocuments.length} \${plural(linkedDocuments.length, "documento", "documenti")}:\\n\${documentList}\` : \`La pratica “\${practice.title || "Pratica senza titolo"}” non contiene ancora documenti collegati.\`,\n        documentIds: linkedDocuments.map((document) => document.id),\n        practiceIds: [practice.id],\n        filesInspected: 0,\n        mode: "practice-documents",\n      }, { headers: { "Cache-Control": "no-store, max-age=0" } });\n    }`,
  );
}
await writeFile(contextPath, context, "utf8");
console.log("Applied assistant conversation context.");
