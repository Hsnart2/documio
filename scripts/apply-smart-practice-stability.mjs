import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = path.join(root, "app", "SmartPracticeCenter.tsx");
let source = await readFile(componentPath, "utf8");

const replacements = [
  [
    "  const load = useCallback(async (practiceId?: string) => {\n    const supabase = getSupabaseClient();\n    const id = practiceId ?? practice?.id;\n    if (!supabase || !id) return;",
    "  const load = useCallback(async (id: string) => {\n    const supabase = getSupabaseClient();\n    if (!supabase || !id) return;",
  ],
  ["  }, [practice?.id]);", "  }, []);"],
];

let changed = false;
for (const [before, after] of replacements) {
  if (source.includes(before)) {
    source = source.replace(before, after);
    changed = true;
  }
}

if (changed) {
  await writeFile(componentPath, source, "utf8");
  console.log("Applied intelligent practice stability patch.");
} else {
  console.log("Intelligent practice stability patch already applied.");
}
