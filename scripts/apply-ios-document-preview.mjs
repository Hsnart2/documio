import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "app", "page.tsx");
let source = await readFile(pagePath, "utf8");

const marker = `  async function openDocument(document: StoredDocument, download = false) {`;
const helper = `  function fileMimeType(fileName: string, responseType?: string) {
    const cleanType = String(responseType ?? "").split(";")[0].trim().toLowerCase();
    if (cleanType && cleanType !== "application/octet-stream" && cleanType !== "binary/octet-stream") return cleanType;
    const extension = String(fileName ?? "").toLowerCase().split(".").pop();
    if (extension === "pdf") return "application/pdf";
    if (["jpg", "jpeg"].includes(extension ?? "")) return "image/jpeg";
    if (extension === "png") return "image/png";
    if (extension === "webp") return "image/webp";
    return "application/octet-stream";
  }

  async function openSignedFile(signedUrl: string, fileName: string, download: boolean, reservedWindow: Window | null) {
    try {
      const response = await fetch(signedUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(\`File non disponibile (\${response.status}).\`);
      const bytes = await response.arrayBuffer();
      const safeName = fileName?.trim() || "documento.pdf";
      const mimeType = fileMimeType(safeName, response.headers.get("content-type") ?? undefined);
      const file = new File([bytes], safeName, { type: mimeType });
      const objectUrl = URL.createObjectURL(file);

      if (download) {
        if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          await navigator.share({ files: [file], title: safeName });
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
          return;
        }
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = safeName;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return;
      }

      if (reservedWindow && !reservedWindow.closed) reservedWindow.location.replace(objectUrl);
      else window.location.assign(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300_000);
    } catch (error) {
      reservedWindow?.close();
      throw error;
    }
  }

${marker}`;
if (!source.includes("function fileMimeType(") && source.includes(marker)) {
  if (source.includes("async function openSignedFile(")) {
    const start = source.indexOf("  async function openSignedFile(");
    const end = source.indexOf(marker, start);
    if (start >= 0 && end > start) source = source.slice(0, start) + helper;
  } else {
    source = source.replace(marker, helper);
  }
}

source = source.replace(
`    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(document.storagePath, 60, {
        download: download ? document.fileName : false,
      });`,
`    const reservedWindow = download ? null : window.open("", "_blank");
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(document.storagePath, 60);`,
);
source = source.replace(
`    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function openAttachment`,
`    try {
      await openSignedFile(data.signedUrl, document.fileName, download, reservedWindow);
    } catch (openError) {
      alert(openError instanceof Error ? openError.message : t.fileUnavailable);
    }
  }

  async function openAttachment`,
);
source = source.replace(
`    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(attachment.storagePath, 60, {
        download: download ? attachment.fileName : false,
      });`,
`    const reservedWindow = download ? null : window.open("", "_blank");
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(attachment.storagePath, 60);`,
);
source = source.replace(
`    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteAttachment`,
`    try {
      await openSignedFile(data.signedUrl, attachment.fileName, download, reservedWindow);
    } catch (openError) {
      alert(openError instanceof Error ? openError.message : t.fileUnavailable);
    }
  }

  async function deleteAttachment`,
);

await writeFile(pagePath, source, "utf8");
console.log("Applied iOS-safe document preview with correct MIME types.");
