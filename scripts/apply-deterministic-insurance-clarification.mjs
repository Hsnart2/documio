import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "assistant", "route.ts");
let source = await readFile(routePath, "utf8");

const marker = `    const insuranceSubject = getInsuranceSubject(question);`;
const replacement = `${marker}

    if (expiryQuestion && !insuranceSubject) {
      return NextResponse.json({
        answer:
          language === "it"
            ? "Quale assicurazione intendi: quella dell’Audi, del camper o della casa?"
            : "Which insurance do you mean: the Audi, the camper, or the home insurance?",
        documentIds: [],
        practiceIds: [],
        filesInspected: 0,
        mode: "insurance-clarification",
      });
    }`;

if (!source.includes('mode: "insurance-clarification"') && source.includes(marker)) {
  source = source.replace(marker, replacement);
}

await writeFile(routePath, source, "utf8");
console.log("Applied deterministic insurance clarification.");
