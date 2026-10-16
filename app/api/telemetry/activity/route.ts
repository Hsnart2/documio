import { NextResponse } from "next/server";
import { authenticatedUser, privilegedClient } from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await authenticatedUser(request);
  if (!access) return NextResponse.json({ error: "Accesso richiesto." }, {
    status: 401, headers: { "Cache-Control": "no-store" },
  });
  const admin = privilegedClient();
  if (!admin) return NextResponse.json({ error: "Misurazione non configurata." }, {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
  // Una riga per account/giorno. Non conserviamo IP, testi, URL o documenti.
  const now = new Date().toISOString();
  const { error } = await admin.from("documio_owner_activity_daily").upsert({
    user_id: access.user.id,
    day: now.slice(0, 10),
    last_seen_at: now,
  }, { onConflict: "user_id,day" });
  if (error) return NextResponse.json({ error: "Rilevazione temporaneamente non disponibile." }, {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
  return NextResponse.json({ recorded: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
