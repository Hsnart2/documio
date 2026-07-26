import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brainPath = path.join(root, "app", "api", "document-brain", "route.ts");
const smartHomePath = path.join(root, "app", "SmartHomeV2.tsx");

let brain = await readFile(brainPath, "utf8");
const unsafeDownload = `      const { data, error } = await admin.storage.from("documents").download(candidate.storagePath);
      if (error || !data) continue;`;
const safeDownload = `      let data: Blob | null = null;
      try {
        const result = await admin.storage.from("documents").download(candidate.storagePath);
        if (result.error || !result.data) continue;
        data = result.data;
      } catch (storageError) {
        console.warn("Document Brain skipped an unreadable storage path", {
          documentId: candidate.documentId,
          error: storageError instanceof Error ? storageError.message : String(storageError),
        });
        continue;
      }`;
if (brain.includes(unsafeDownload)) {
  brain = brain.replace(unsafeDownload, safeDownload);
}
brain = brain.replace(
  `      error: error instanceof Error ? error.message : "Errore imprevisto dell'assistente documentale.",`,
  `      error: "Non riesco a completare il controllo dei documenti in questo momento. Riprova tra pochi secondi.",`,
);
await writeFile(brainPath, brain, "utf8");

let smartHome = await readFile(smartHomePath, "utf8");
if (!smartHome.includes("const askingRef = useRef(false);")) {
  smartHome = smartHome.replace(
    `import { useEffect, useMemo, useState } from "react";`,
    `import { useEffect, useMemo, useRef, useState } from "react";`,
  );
  smartHome = smartHome.replace(
    `  const [asking, setAsking] = useState(false);`,
    `  const [asking, setAsking] = useState(false);\n  const askingRef = useRef(false);`,
  );
  smartHome = smartHome.replace(
    `    if (!clean || asking) return;`,
    `    if (!clean || askingRef.current) return;\n    askingRef.current = true;`,
  );
  smartHome = smartHome.replace(
    `    } finally {\n      setAsking(false);\n    }`,
    `    } finally {\n      askingRef.current = false;\n      setAsking(false);\n    }`,
  );
}
await writeFile(smartHomePath, smartHome, "utf8");

console.log("Applied Document Brain runtime safety and duplicate-submit protection.");
