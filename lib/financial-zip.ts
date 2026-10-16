import { unzip, type UnzipFileInfo } from "fflate";

/** I file rimangono sul dispositivo fino al caricamento XML nello Storage privato. */
export const MAX_ZIP_BYTES = 30_000_000;
export const MAX_ZIP_INVOICES = 250;
export const MAX_XML_BYTES = 5_000_000;
export const MAX_EXPANDED_BYTES = 75_000_000;

export type InvoiceZipResult = {
  files: File[];
  skipped: number;
  signedP7m: number;
  tooLarge: number;
  totalXml: number;
  limited: boolean;
};

export async function extractInvoiceXmlZip(file: File): Promise<InvoiceZipResult> {
  if (!/\.zip$/i.test(file.name) || file.size < 4 || file.size > MAX_ZIP_BYTES) {
    throw new Error("Seleziona uno ZIP di fatture fino a 30 MB.");
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const signature = buffer[0] === 80 && buffer[1] === 75 &&
    ((buffer[2] === 3 && buffer[3] === 4) ||
     (buffer[2] === 5 && buffer[3] === 6) ||
     (buffer[2] === 7 && buffer[3] === 8));
  if (!signature) throw new Error("File ZIP non valido o danneggiato.");

  const acceptedNames = new Set<string>();
  let skipped = 0;
  let signedP7m = 0;
  let tooLarge = 0;
  let totalXml = 0;
  let expandedBytes = 0;
  let limited = false;
  let included = 0;

  const extracted = await new Promise<Record<string, Uint8Array>>((resolve,reject) => {
    try {
      unzip(buffer, {
        filter(info: UnzipFileInfo): boolean {
          const name = info.name.replace(/\\/g, "/");
          if (name.endsWith("/") || name.startsWith("__MACOSX/")) return false;
          if (/\.p7m$/i.test(name)) { signedP7m++; return false; }
          if (!/\.xml$/i.test(name)) { skipped++; return false; }
          totalXml++;
          if (info.originalSize <= 0 || info.originalSize > MAX_XML_BYTES) {
            tooLarge++; return false;
          }
          if (acceptedNames.has(name)) { skipped++; return false; }
          if (included >= MAX_ZIP_INVOICES ||
              expandedBytes + info.originalSize > MAX_EXPANDED_BYTES) {
            limited = true; skipped++; return false;
          }
          // ZIP cifrati o con metodo di compressione non supportato vengono
          // rifiutati dal decompressor (nessuna estrazione parziale).
          acceptedNames.add(name);
          included++;
          expandedBytes += info.originalSize;
          return true;
        },
      }, (error, files) => {
        if (error) reject(new Error("ZIP non leggibile o protetto da password."));
        else resolve(files);
      });
    } catch {
      reject(new Error("ZIP non leggibile o protetto da password."));
    }
  });

  const files = Object.entries(extracted).map(([path, bytes]) => {
    const basename = path.split(/[\\/]/).pop()?.trim() || "fattura.xml";
    // Copia nel proprio ArrayBuffer per evitare BlobPart su SharedArrayBuffer.
    const data = new Uint8Array(bytes.length);
    data.set(bytes);
    return new File([data.buffer], basename.slice(0,180),
      { type: "application/xml" });
  });
  return {files,skipped,signedP7m,tooLarge,totalXml,limited};
}
