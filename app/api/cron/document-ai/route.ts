import { NextResponse } from "next/server";
import {
  getDocumentAIAdmin, claimDocumentAIJob, processClaimedDocumentAI,
} from "@/lib/document-ai-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ripristino giornaliero dei job che non si sono conclusi durante il
// processamento immediato. La frequenza resta compatibile con Vercel Hobby.
// Non include documenti nel risultato o nei log.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const admin = getDocumentAIAdmin();
  if (!admin) return NextResponse.json({ error: "Server non configurato" }, { status: 503 });
  try {
    const jobs = [];
    for (let i = 0; i < 2; i++) {
      const claimed = await claimDocumentAIJob(admin);
      if (claimed) jobs.push(claimed);
    }
    // Le elaborazioni hanno un lease per prevenire doppioni:
    // in caso di timeout saranno riprese dal prossimo trigger/cron.
    const outcomes = await Promise.allSettled(
      jobs.map((job) => processClaimedDocumentAI(job, admin)),
    );
    return NextResponse.json({
      processed: jobs.length,
      completed: outcomes.filter((item) =>
        item.status === "fulfilled" && item.value.status === "completed").length,
      reviewRequired: outcomes.filter((item) =>
        item.status === "fulfilled" && item.value.status === "needs_review").length,
      failed: outcomes.filter((item) =>
        item.status === "rejected" ||
        (item.status === "fulfilled" && item.value.status === "failed")).length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("DocuMio AI recovery:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Ripristino momentaneamente non disponibile." },
      { status: 503 });
  }
}
