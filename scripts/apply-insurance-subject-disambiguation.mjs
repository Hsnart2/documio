import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "assistant", "route.ts");
let source = await readFile(routePath, "utf8");

const expiryMarker = `function isExpiryQuestion(question: string) {`;
const helper = `function getInsuranceSubject(question: string) {
  const value = normalize(question);
  const subjects: Array<{ label: string; terms: string[] }> = [
    { label: "Audi", terms: ["audi"] },
    { label: "camper", terms: ["camper", "ducato", "motorhome", "autocaravan"] },
    { label: "casa", terms: ["casa", "abitazione", "immobile", "fabbricato"] },
  ];
  return subjects.find((subject) => subject.terms.some((term) => value.includes(term))) ?? null;
}

${expiryMarker}`;
if (!source.includes("function getInsuranceSubject(") && source.includes(expiryMarker)) {
  source = source.replace(expiryMarker, helper);
}

source = source.replace(
  `    const expiryQuestion = isExpiryQuestion(question);`,
  `    const expiryQuestion = isExpiryQuestion(question);\n    const insuranceSubject = getInsuranceSubject(question);`,
);

source = source.replace(
  `        score: scoreText(searchableText, terms) + (expiryQuestion && [document.title, document.category, document.summary, keywords.join(" ")].join(" ").toLowerCase().match(/assicurazione|polizza|rca/) ? 25 : 0),`,
  `        score:\n          scoreText(searchableText, terms) +\n          (expiryQuestion && [document.title, document.category, document.summary, keywords.join(" ")].join(" ").toLowerCase().match(/assicurazione|polizza|rca/) ? 25 : 0) +\n          (insuranceSubject && insuranceSubject.terms.some((term) => normalize(searchableText).includes(term)) ? 60 : 0),`,
);

const rulesNeedle = `- Se la domanda chiede quando scade un'assicurazione o una polizza, cerca prima nel testo reale del certificato/polizza la data di fine validità, scadenza, copertura fino al o periodo assicurato. Non confondere la data della quietanza o del pagamento con la scadenza della copertura. Non rispondere con le sole rate o scadenze di pagamento. Se trovi una data, rispondi direttamente nel formato “L'assicurazione scade il GG/MM/AAAA”. Se non è presente, dichiara chiaramente che nel documento disponibile non compare la data di scadenza.`;
const rulesReplacement = `${rulesNeedle}\n- Quando l'utente specifica il bene assicurato, per esempio Audi, camper o casa, usa esclusivamente la polizza riferita a quel bene. Verifica titolo, riepilogo, parole chiave e testo del PDF; non mescolare date o importi di polizze diverse. Nella risposta nomina sempre il bene: “L'assicurazione dell'Audi scade il…”, “L'assicurazione del camper scade il…” oppure “L'assicurazione della casa scade il…”. Se esistono più polizze e il bene non è specificato, chiedi quale assicurazione intende.`;
if (!source.includes("non mescolare date o importi di polizze diverse") && source.includes(rulesNeedle)) {
  source = source.replace(rulesNeedle, rulesReplacement);
}

await writeFile(routePath, source, "utf8");
console.log("Applied insurance subject disambiguation.");
