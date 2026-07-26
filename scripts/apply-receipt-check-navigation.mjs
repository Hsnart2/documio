import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = path.join(root, "app", "TodayActionCenter.tsx");
let source = await readFile(componentPath, "utf8");

const oldFunction = `  async function openDocument(documentId: string) {
    const documentRow = documents.find((item) => item.id === documentId);
    if (!documentRow?.storage_path) {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (item) => ["documenti", "documents"].includes(item.textContent?.trim().toLowerCase() ?? ""),
      );
      button?.click();
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(documentRow.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }`;

const newFunction = `  async function openDocument(documentId: string, receiptCheck = false) {
    if (receiptCheck) {
      const documentsButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (item) => ["documenti", "documents"].includes(item.textContent?.trim().toLowerCase() ?? ""),
      );
      documentsButton?.click();

      const target = await new Promise<HTMLElement | null>((resolve) => {
        const selector = \`[data-document-id="\${CSS.escape(documentId)}"]\`;
        const immediate = document.querySelector<HTMLElement>(selector);
        if (immediate) return resolve(immediate);
        const observer = new MutationObserver(() => {
          const found = document.querySelector<HTMLElement>(selector);
          if (!found) return;
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve(found);
        });
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, 8000);
        observer.observe(document.body, { childList: true, subtree: true });
      });

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("push-deep-link-highlight");
        window.setTimeout(() => target.classList.remove("push-deep-link-highlight"), 2400);
      }
      return;
    }

    const documentRow = documents.find((item) => item.id === documentId);
    if (!documentRow?.storage_path) {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (item) => ["documenti", "documents"].includes(item.textContent?.trim().toLowerCase() ?? ""),
      );
      button?.click();
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(documentRow.storage_path, 60);
    if (data?.signedUrl) window.location.assign(data.signedUrl);
  }`;

if (source.includes(oldFunction)) {
  source = source.replace(oldFunction, newFunction);
}

source = source.replace(
  'onClick={() => void openDocument(action.documentId)}',
  'onClick={() => void openDocument(action.documentId, action.kind === "receipt")}',
);

await writeFile(componentPath, source, "utf8");
console.log("Applied receipt check navigation fix.");
