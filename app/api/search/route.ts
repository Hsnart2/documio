import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  searchDocuments,
  type SearchableDocument,
  type SearchableAttachment,
} from "@/lib/document-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cerca SEMPRE nell'archivio dell'utente autenticato; il browser non puo'
// fornire record falsi o riferimenti appartenenti ad altri account.
export async function POST(request: Request) {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token = request.headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!token || !key || !url) {
    return NextResponse.json({ error:"Sessione mancante." }, { status:401 });
  }
  const body = await request.json().catch(()=>null) as
    {query?:unknown;companyId?:unknown} | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 2 || query.length > 250)
    return NextResponse.json({ error:"Inserisci da 2 a 250 caratteri." }, { status:400 });
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession:false, autoRefreshToken:false },
  });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user)
    return NextResponse.json({ error:"Accesso non autorizzato." }, { status:401 });

  const companyId = body?.companyId ?? null;
  if (companyId !== null && (typeof companyId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId))) {
    return NextResponse.json({error:"Archivio non valido."},{status:400});
  }
  if (companyId) {
    const {data:company,error:companyError} = await client.from("financial_companies")
      .select("id").eq("id",companyId).eq("user_id",user.id).maybeSingle();
    if (companyError || !company)
      return NextResponse.json({error:"Azienda non accessibile."},{status:403});
  }
  const inScope = (builder:any) => companyId
    ? builder.eq("company_id",companyId) : builder.is("company_id",null);
  
  const [documentsA, documentsB, attachmentsA, attachmentsB] = await Promise.all([
    inScope(client.from("documents")
      .select("id,title,file_name,summary,category,keywords,expiry_date")
      .eq("user_id",user.id)).order("uploaded_at",{ascending:false}).range(0,999),
    inScope(client.from("documents")
      .select("id,title,file_name,summary,category,keywords,expiry_date")
      .eq("user_id",user.id)).order("uploaded_at",{ascending:false}).range(1000,1999),
    client.from("document_attachments")
      .select("document_id,title,file_name,notes,attachment_type")
      .eq("user_id",user.id).order("uploaded_at",{ascending:false}).range(0,999),
    client.from("document_attachments")
      .select("document_id,title,file_name,notes,attachment_type")
      .eq("user_id",user.id).order("uploaded_at",{ascending:false}).range(1000,1999),
  ]);
  const issue = documentsA.error ?? documentsB.error ?? attachmentsA.error ?? attachmentsB.error;
  if (issue) {
    console.error("DocuMio archive search:", issue.message);
    return NextResponse.json({ error:"Ricerca temporaneamente non disponibile." }, {status:503});
  }
  const docs = [...(documentsA.data??[]),...(documentsB.data??[])] as SearchableDocument[];
  const files = [...(attachmentsA.data??[]),...(attachmentsB.data??[])] as SearchableAttachment[];
  const matchedIds = searchDocuments(query,docs,files,150);
  return NextResponse.json({
    documentIds:matchedIds, count:matchedIds.length,
    isPartial:docs.length>=2000 || files.length>=2000,
    source:"authenticated-archive",
  }, {headers:{"Cache-Control":"private, no-store"}});
}
