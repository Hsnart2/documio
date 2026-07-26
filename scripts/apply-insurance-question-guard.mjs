import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "assistant", "route.ts");
let source = await readFile(routePath, "utf8");

const marker = `    const authClient = createClient(supabaseUrl, publishableKey, {`;
const guard = `    const normalizedQuestion = normalize(question);
    const asksInsuranceExpiry =
      ["quando scade", "data scadenza", "fino a quando", "validita", "scadenza"].some((term) =>
        normalizedQuestion.includes(term),
      ) &&
      ["assicurazione", "polizza", "rca"].some((term) => normalizedQuestion.includes(term));
    const specifiesInsuranceSubject = [
      "audi",
      "camper",
      "ducato",
      "motorhome",
      "autocaravan",
      "casa",
      "abitazione",
      "immobile",
      "fabbricato",
    ].some((term) => normalizedQuestion.includes(term));

    if (asksInsuranceExpiry && !specifiesInsuranceSubject) {
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
    }

${marker}`;

if (!source.includes("const asksInsuranceExpiry =") && source.includes(marker)) {
  source = source.replace(marker, guard);
}

await writeFile(routePath, source, "utf8");
console.log("Applied direct insurance question guard.");
