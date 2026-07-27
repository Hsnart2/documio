import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const relative of ["app/SmartHomeV2.tsx", "app/page.tsx"]) {
  const filePath = path.join(root, relative);
  let source = await readFile(filePath, "utf8");
  source = source.replaceAll(
    'throw new Error(result.error || "Risposta non disponibile.");',
    'throw new Error(result.error || "Non riesco a completare il controllo. Riprova tra poco.");',
  );
  source = source.replaceAll(
    'throw new Error(data.error || "Assistant failed");',
    'throw new Error(data.error || "Non riesco a completare il controllo. Riprova tra poco.");',
  );
  await writeFile(filePath, source, "utf8");
}
console.log("Applied friendly Document Brain error messages.");
