import { readFile, writeFile } from "node:fs/promises";

const pagePath = new URL("../app/page.tsx", import.meta.url);
const text = await readFile(pagePath, "utf8");
const marker = "const maxFileBytes = 20 * 1024 * 1024;";

if (text.includes(marker)) {
  console.log("20 MB smart upload patch already applied.");
  process.exit(0);
}

const oldRequest = `  async function requestAnalysis(
    candidateDocuments: ReturnType<typeof serializeCandidateDocuments> = [],
    mode: "document" | "attachment" = "document",
  ) {
    if (!file) {
      throw new Error(language === "it" ? "File mancante." : "Missing file.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userNote", note);
    formData.append("language", language);
    formData.append("mode", mode);
    formData.append("candidateDocuments", JSON.stringify(candidateDocuments));

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: await getApiAuthHeaders(),
      body: formData,
    });

    const data = (await response.json()) as SmartAnalysis & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || "Analysis failed");
    }

    return data;
  }
`;

const newRequest = `  async function requestAnalysis(
    candidateDocuments: ReturnType<typeof serializeCandidateDocuments> = [],
    mode: "document" | "attachment" = "document",
  ) {
    if (!file) {
      throw new Error(language === "it" ? "File mancante." : "Missing file.");
    }

    const maxFileBytes = 20 * 1024 * 1024;
    const directAnalysisBytes = 4 * 1024 * 1024;

    if (file.size > maxFileBytes) {
      throw new Error(
        language === "it"
          ? "Il file supera 20 MB. Scegli un file più piccolo."
          : "The file is larger than 20 MB. Choose a smaller file.",
      );
    }

    let temporaryStoragePath: string | null = null;

    try {
      let response: Response;

      if (file.size > directAnalysisBytes) {
        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error(t.notConfigured);
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(t.invalidSession);
        }

        const safeName = file.name
          .normalize("NFKD")
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/-+/g, "-");
        temporaryStoragePath = \`\${user.id}/analisi-temporanea/\${crypto.randomUUID()}-\${safeName}\`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(temporaryStoragePath, file, {
            cacheControl: "3600",
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        response = await fetch("/api/analyze", {
          method: "POST",
          headers: await getApiAuthHeaders("application/json"),
          body: JSON.stringify({
            storagePath: temporaryStoragePath,
            fileName: file.name,
            userNote: note,
            language,
            mode,
            candidateDocuments,
          }),
        });
      } else {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("userNote", note);
        formData.append("language", language);
        formData.append("mode", mode);
        formData.append("candidateDocuments", JSON.stringify(candidateDocuments));

        response = await fetch("/api/analyze", {
          method: "POST",
          headers: await getApiAuthHeaders(),
          body: formData,
        });
      }

      const data = (await response.json()) as SmartAnalysis & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      return data;
    } finally {
      if (temporaryStoragePath) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error: cleanupError } = await supabase.storage
            .from("documents")
            .remove([temporaryStoragePath]);
          if (cleanupError) {
            console.warn(
              "Pulizia file temporaneo non riuscita:",
              cleanupError.message,
            );
          }
        }
      }
    }
  }
`;

const oldLimit = `      if (file.size > 4 * 1024 * 1024) {
        throw new Error(
          language === "it"
            ? "Il file supera 4 MB. Scegli un file più piccolo."
            : "The file is larger than 4 MB. Choose a smaller file.",
        );
      }

`;

if (!text.includes(oldRequest)) {
  throw new Error("requestAnalysis block not found; patch not applied.");
}

if (!text.includes(oldLimit)) {
  throw new Error("Old 4 MB limit block not found; patch not applied.");
}

const patched = text.replace(oldRequest, newRequest).replace(oldLimit, "");
await writeFile(pagePath, patched, "utf8");
console.log("Enabled private Storage analysis for files up to 20 MB.");
