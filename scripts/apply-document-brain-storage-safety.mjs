import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "app", "api", "document-brain", "route.ts");
let route = await readFile(routePath, "utf8");

const oldBlock = `    for (const candidate of fileCandidates.sort((a, b) => a.priority - b.priority)) {
      if (loadedFiles.length >= MAX_FILES) break;
      const { data, error } = await admin.storage.from("documents").download(candidate.storagePath);
      if (error || !data) continue;
      const bytes = Buffer.from(await data.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES || totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;
      const mime = getMimeType(candidate.fileName, data.type);
      if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) continue;
      loadedFiles.push({
        info: candidate,
        mime,
        fileName: candidate.fileName,
        dataUrl: \`data:\${mime};base64,\${bytes.toString("base64")}\`,
      });
      totalBytes += bytes.length;
    }`;

const newBlock = `    for (const candidate of fileCandidates.sort((a, b) => a.priority - b.priority)) {
      if (loadedFiles.length >= MAX_FILES) break;

      try {
        const safeStoragePath = String(candidate.storagePath ?? "").trim();
        if (!safeStoragePath || !safeStoragePath.startsWith(\`\${user.id}/\`)) continue;

        const { data, error } = await admin.storage
          .from("documents")
          .download(safeStoragePath);
        if (error || !data) {
          console.warn("Document brain skipped unreadable file", {
            documentId: candidate.documentId,
            title: candidate.title,
            error: error?.message,
          });
          continue;
        }

        const bytes = Buffer.from(await data.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_FILE_BYTES || totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;
        const mime = getMimeType(candidate.fileName, data.type);
        if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) continue;
        loadedFiles.push({
          info: candidate,
          mime,
          fileName: candidate.fileName,
          dataUrl: \`data:\${mime};base64,\${bytes.toString("base64")}\`,
        });
        totalBytes += bytes.length;
      } catch (fileError) {
        console.warn("Document brain ignored malformed storage file", {
          documentId: candidate.documentId,
          title: candidate.title,
          error: fileError instanceof Error ? fileError.message : String(fileError),
        });
      }
    }`;

if (route.includes(oldBlock)) {
  route = route.replace(oldBlock, newBlock);
} else if (!route.includes("Document brain ignored malformed storage file")) {
  throw new Error("Document Brain file loading block not found");
}

await writeFile(routePath, route, "utf8");
console.log("Applied Document Brain storage safety.");
