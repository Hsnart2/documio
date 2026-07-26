import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "assistant", "route.ts");
let source = await readFile(routePath, "utf8");

const summaryMarker = `function isSummaryRequest(question: string) {`;
const intentHelper = `function isExpiryQuestion(question: string) {
  const value = normalize(question);
  const asksWhen = ["quando scade", "data scadenza", "fino a quando", "validita", "scadenza"].some((term) => value.includes(term));
  const target = ["assicurazione", "polizza", "rca", "certificato assicurazione", "contratto"].some((term) => value.includes(term));
  return asksWhen && target;
}

${summaryMarker}`;
if (!source.includes("function isExpiryQuestion(") && source.includes(summaryMarker)) {
  source = source.replace(summaryMarker, intentHelper);
}

source = source.replace(
  `    const summaryMode = isSummaryRequest(question);`,
  `    const summaryMode = isSummaryRequest(question);\n    const expiryQuestion = isExpiryQuestion(question);`,
);

source = source.replace(
  `        score: scoreText(searchableText, terms),`,
  `        score: scoreText(searchableText, terms) + (expiryQuestion && [document.title, document.category, document.summary, keywords.join(" ")].join(" ").toLowerCase().match(/assicurazione|polizza|rca/) ? 25 : 0),`,
);

const rulesNeedle = `- Non inventare dati.\n- Sii concreto e leggibile.`;
const rulesReplacement = `- Non inventare dati.\n- Se la domanda chiede quando scade un'assicurazione o una polizza, cerca prima nel testo reale del certificato/polizza la data di fine validità, scadenza, copertura fino al o periodo assicurato. Non confondere la data della quietanza o del pagamento con la scadenza della copertura. Non rispondere con le sole rate o scadenze di pagamento. Se trovi una data, rispondi direttamente nel formato “L'assicurazione scade il GG/MM/AAAA”. Se non è presente, dichiara chiaramente che nel documento disponibile non compare la data di scadenza.\n- Sii concreto e leggibile.`;
if (!source.includes("Non confondere la data della quietanza") && source.includes(rulesNeedle)) {
  source = source.replace(rulesNeedle, rulesReplacement);
}

await writeFile(routePath, source, "utf8");
console.log("Applied assistant insurance expiry intent handling.");
