import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "app", "page.tsx");
let source = await readFile(pagePath, "utf8");

const marker = "  const [isLoaded, setIsLoaded] = useState(false);";
const sentinel = "documio-practice-live-sync";

if (!source.includes(sentinel) && source.includes(marker)) {
  const insertion = `${marker}\n\n  // ${sentinel}: mantiene l'elenco pratiche aggiornato quando un documento viene collegato da componenti globali.\n  useEffect(() => {\n    const onPracticeUpdate = (event: Event) => {\n      const detail = (event as CustomEvent<{\n        documentId?: string;\n        practiceId?: string | null;\n        practice?: { id?: string; title?: string; practice_type?: string };\n      }>).detail;\n      if (!detail?.documentId) return;\n\n      setDocuments((current) =>\n        current.map((document) =>\n          document.id === detail.documentId\n            ? { ...document, practiceId: detail.practiceId ?? null }\n            : document,\n        ),\n      );\n\n      const createdPractice = detail.practice;\n      const createdPracticeId = createdPractice?.id;\n      if (createdPracticeId) {\n        setPractices((current) => {\n          if (current.some((practice) => practice.id === createdPracticeId)) return current;\n          const now = new Date().toISOString();\n          return [\n            {\n              id: createdPracticeId,\n              userId: userId ?? \"\",\n              title: createdPractice?.title ?? \"Nuova pratica\",\n              practiceType: createdPractice?.practice_type ?? \"Altro\",\n              description: null,\n              status: \"In corso\",\n              openedAt: now.slice(0, 10),\n              closedAt: null,\n              createdAt: now,\n              updatedAt: now,\n            },\n            ...current,\n          ];\n        });\n      }\n    };\n\n    window.addEventListener(\"documio-document-practice-updated\", onPracticeUpdate);\n    return () =>\n      window.removeEventListener(\"documio-document-practice-updated\", onPracticeUpdate);\n  }, [userId]);`;
  source = source.replace(marker, insertion);
  await writeFile(pagePath, source, "utf8");
  console.log("Applied practice live synchronization.");
} else {
  console.log("Practice live synchronization already applied.");
}
