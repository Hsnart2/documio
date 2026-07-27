import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filePath = path.join(root, "app", "AdvancedEmailAutomation.tsx");
let source = await readFile(filePath, "utf8");

const oldBlock = `        if (usefulMessageIds.length) {
          setStage(
            \`Importo gli allegati utili da \${usefulMessageIds.length} email…\`,
          );
          const importResponse = await fetch("/api/email/gmail/import", {
            method: "POST",
            headers: {
              Authorization: \`Bearer \${token}\`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messageIds: usefulMessageIds,
              mode: "advanced",
              confirmed: true,
            }),
          });
          const imported = (await importResponse.json().catch(() => null)) as {
            importedDocuments?: number;
            linkedAttachments?: number;
            skipped?: number;
            errors?: string[];
            error?: string;
          } | null;

          if (!importResponse.ok) {
            nextReport.warnings.push(
              imported?.error ?? "Importazione degli allegati non riuscita.",
            );
          } else {
            nextReport.imported += imported?.importedDocuments ?? 0;
            nextReport.linked += imported?.linkedAttachments ?? 0;
            nextReport.skipped += imported?.skipped ?? 0;
            nextReport.warnings.push(...(imported?.errors ?? []));
          }
        }
`;

const newBlock = `        if (usefulMessageIds.length) {
          const importBatchSize = 2;
          for (let index = 0; index < usefulMessageIds.length; index += importBatchSize) {
            if (cancelled) return;
            const batchIds = usefulMessageIds.slice(index, index + importBatchSize);
            setStage(
              \`Importo allegati: \${Math.min(index + batchIds.length, usefulMessageIds.length)} di \${usefulMessageIds.length} email…\`,
            );

            try {
              const controller = new AbortController();
              const timeout = window.setTimeout(() => controller.abort(), 55_000);
              const importResponse = await fetch("/api/email/gmail/import", {
                method: "POST",
                headers: {
                  Authorization: \`Bearer \${token}\`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messageIds: batchIds,
                  mode: "advanced",
                  confirmed: true,
                }),
                signal: controller.signal,
              }).finally(() => window.clearTimeout(timeout));

              const imported = (await importResponse.json().catch(() => null)) as {
                importedDocuments?: number;
                linkedAttachments?: number;
                skipped?: number;
                errors?: string[];
                error?: string;
              } | null;

              if (!importResponse.ok) {
                nextReport.warnings.push(
                  imported?.error ?? \`Importazione non riuscita per \${batchIds.length} email.\`,
                );
                continue;
              }

              nextReport.imported += imported?.importedDocuments ?? 0;
              nextReport.linked += imported?.linkedAttachments ?? 0;
              nextReport.skipped += imported?.skipped ?? 0;
              nextReport.warnings.push(...(imported?.errors ?? []));
            } catch (error) {
              nextReport.warnings.push(
                error instanceof DOMException && error.name === "AbortError"
                  ? "Un gruppo di allegati ha impiegato troppo tempo: continuo con gli altri."
                  : "Un gruppo di allegati non è stato scaricato: continuo con gli altri.",
              );
            }
          }
        }
`;

if (source.includes(newBlock)) {
  console.log("Gmail import batching already applied.");
} else if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  await writeFile(filePath, source, "utf8");
  console.log("Applied resilient Gmail import batching.");
} else {
  throw new Error("Gmail import block not found in AdvancedEmailAutomation.tsx");
}
