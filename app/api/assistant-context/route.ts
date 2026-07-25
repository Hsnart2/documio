import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type PracticeRow = {
  id: string;
  title: string | null;
  practice_type: string | null;
  description: string | null;
  status: string | null;
  opened_at: string | null;
};

type DocumentRow = {
  id: string;
  practice_id: string | null;
  title: string | null;
};

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isCapabilityQuestion(question: string) {
  const value = normalize(question);
  return [
    "cosa sai fare",
    "cosa puoi fare",
    "come mi puoi aiutare",
    "come puoi aiutarmi",
    "a cosa servi",
    "che funzioni hai",
  ].some((term) => value.includes(term));
}

function queryTerms(question: string) {
  const ignored = new Set([
    "pratica", "pratiche", "ho", "hai", "qualche", "quali", "quante",
    "quanti", "elenco", "lista", "mostra", "mostrami", "fammi", "vedere",
    "tutte", "tutti", "disponibili", "risultano", "risulta", "archivio",
    "sbaglio", "sono", "delle", "della", "degli", "dello", "dei", "del",
    "che", "una", "uno", "nel", "nella", "nelle", "mia", "mie", "miei",
    "io", "ci", "oppure", "anche", "la", "le", "il", "lo", "gli", "un",
    "e", "o", "ma", "se", "per", "con", "da", "in", "su", "mi", "me",
  ]);

  return normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !ignored.has(term));
}

function scorePractice(practice: PracticeRow, terms: string[]) {
  const source = normalize(
    `${practice.title ?? ""} ${practice.practice_type ?? ""} ${practice.description ?? ""} ${practice.status ?? ""}`,
  );
  return terms.reduce((score, term) => {
    if (!source.includes(term)) return score;
    return score + (new RegExp(`(^|\\s)${term}(\\s|$)`).test(source) ? 4 : 2);
  }, 0);
}

function statusLabel(value: string | null) {
  const normalized = normalize(value);
  if (!normalized) return "Stato non indicato";
  if (normalized.includes("chius")) return "Chiusa";
  if (normalized.includes("complet")) return "Completata";
  if (normalized.includes("sospes")) return "Sospesa";
  if (normalized.includes("archiv")) return "Archiviata";
  if (normalized.includes("cors") || normalized.includes("attiv") || normalized.includes("apert")) return "In corso";
  return String(value);
}

function plural(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue;
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    const body = (await request.json().catch(() => null)) as {
      question?: string;
      language?: "it" | "en";
    } | null;
    const question = String(body?.question ?? "").trim();
    const language = body?.language === "en" ? "en" : "it";

    if (!token || !question) {
      return NextResponse.json(
        { error: language === "it" ? "Sessione o domanda mancante." : "Missing session or question." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [practiceResult, documentResult] = await Promise.all([
      admin
        .from("practices")
        .select("id,title,practice_type,description,status,opened_at")
        .eq("user_id", user.id)
        .order("opened_at", { ascending: false, nullsFirst: false })
        .limit(250),
      admin
        .from("documents")
        .select("id,practice_id,title")
        .eq("user_id", user.id)
        .limit(1000),
    ]);

    if (practiceResult.error || documentResult.error) {
      return NextResponse.json({ error: "Non riesco a leggere pratiche e documenti." }, { status: 500 });
    }

    const practices = (practiceResult.data ?? []) as PracticeRow[];
    const documents = (documentResult.data ?? []) as DocumentRow[];
    const documentsByPractice = new Map<string, DocumentRow[]>();
    for (const document of documents) {
      if (!document.practice_id) continue;
      documentsByPractice.set(document.practice_id, [
        ...(documentsByPractice.get(document.practice_id) ?? []),
        document,
      ]);
    }

    if (isCapabilityQuestion(question)) {
      const activeCount = practices.filter((practice) =>
        ["in corso", "attiva", "aperta"].some((term) => normalize(practice.status).includes(term)),
      ).length;
      const answer = language === "it"
        ? `Posso cercare e leggere documenti e allegati, elencare le pratiche, riassumerne una, controllare pagamenti, scadenze e ricevute, confrontare documenti e preparare riepiloghi. Nel tuo archivio risultano ${practices.length} ${plural(practices.length, "pratica", "pratiche")} (${activeCount} in corso) e ${documents.length} ${plural(documents.length, "documento", "documenti")}. Puoi chiedermi, per esempio: “Quali pratiche ho?” oppure “Fammi il riepilogo della pratica Peugeot 206”.`
        : `I can search documents and attachments, list cases, summarize a case, check payments, deadlines and receipts, compare documents, and prepare summaries. Your archive contains ${practices.length} cases and ${documents.length} documents.`;

      return NextResponse.json(
        {
          answer,
          documentIds: [],
          practiceIds: practices.slice(0, 10).map((practice) => practice.id),
          filesInspected: 0,
          mode: "capabilities",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    if (practices.length === 0) {
      return NextResponse.json(
        {
          answer: language === "it"
            ? "Al momento non risultano pratiche salvate. I documenti possono comunque essere presenti nell’archivio senza essere collegati a una pratica."
            : "There are currently no saved cases. Documents may still exist without being linked to a case.",
          documentIds: [],
          practiceIds: [],
          filesInspected: 0,
          mode: "practice-overview",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const terms = queryTerms(question);
    const ranked = practices
      .map((practice) => ({ practice, score: scorePractice(practice, terms) }))
      .sort((a, b) => b.score - a.score);
    const matched = terms.length > 0 ? ranked.filter((item) => item.score > 0) : [];
    const selected = (matched.length > 0 ? matched : ranked).slice(0, 12);
    const totalActive = practices.filter((practice) =>
      ["in corso", "attiva", "aperta"].some((term) => normalize(practice.status).includes(term)),
    ).length;
    const list = selected
      .map(({ practice }) => {
        const count = documentsByPractice.get(practice.id)?.length ?? 0;
        return `• ${practice.title || "Pratica senza titolo"} — ${statusLabel(practice.status)} — ${count} ${plural(count, "documento", "documenti")}`;
      })
      .join("\n");
    const matchedIntro = matched.length > 0 && matched.length < practices.length
      ? `Ho trovato ${matched.length} ${plural(matched.length, "pratica corrispondente", "pratiche corrispondenti")}:`
      : `Sì. Nel tuo archivio risultano ${practices.length} ${plural(practices.length, "pratica", "pratiche")}, di cui ${totalActive} in corso:`;
    const omitted = selected.length < (matched.length || practices.length)
      ? `\nNe risultano altre ${(matched.length || practices.length) - selected.length}.`
      : "";

    return NextResponse.json(
      {
        answer: `${matchedIntro}\n${list}${omitted}`,
        documentIds: [],
        practiceIds: selected.map(({ practice }) => practice.id),
        filesInspected: 0,
        mode: "practice-overview",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Assistant context error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore imprevisto." },
      { status: 500 },
    );
  }
}
