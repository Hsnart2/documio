import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;

const MAX_FILES_PER_REQUEST=8;
const MAX_LEGACY_FILE_BYTES=20*1024*1024;

function answer(payload:Record<string,unknown>,status=200){
  return NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store"}});
}

/** Aggiornamento metadata dei documenti preesistenti.
 * Scansione incrementale richiesta dal proprietario, senza cancellare file.
 */
export async function POST(request:Request){
  const token=request.headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!publishable||!token)return answer({error:"Accedi prima a DocuMio."},401);
  const body=await request.json().catch(()=>null) as {companyId?:unknown}|null;
  const companyId=body?.companyId??null;
  if(companyId!==null&&(typeof companyId!=="string"||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)))
    return answer({error:"Archivio non valido."},400);
  const db=createClient(url,publishable,{
    global:{headers:{Authorization:`Bearer ${token}`}},
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return answer({error:"Sessione non valida."},401);
  if(companyId){
    const {data:company,error}=await db.from("financial_companies")
      .select("id").eq("id",companyId).eq("user_id",user.id).maybeSingle();
    if(error||!company)return answer({error:"Azienda non autorizzata."},403);
  }
  const inScope=(query:any)=>companyId
    ?query.eq("company_id",companyId):query.is("company_id",null);
  const {data:rows,error:readError}=await inScope(
    db.from("documents").select("id,file_name,size,storage_path")
      .eq("user_id",user.id).is("file_sha256",null)
      .is("file_hash_checked_at",null))
    .order("uploaded_at",{ascending:true}).limit(MAX_FILES_PER_REQUEST);
  if(readError)return answer({error:"Scansione archivio non disponibile."},503);

  let scanned=0,foundDuplicates=0,skipped=0;
  for(const doc of rows??[]){
    let sha:string|null=null;
    try{
      if(!doc.storage_path?.startsWith(user.id+"/")||
        doc.size!=null&&Number(doc.size)>MAX_LEGACY_FILE_BYTES){
        skipped++;continue;
      }
      const {data:contents,error:downloadError}=await db.storage
        .from("documents").download(doc.storage_path);
      if(downloadError||!contents||contents.size===0||
        contents.size>MAX_LEGACY_FILE_BYTES){skipped++;continue;}
      const bytes=Buffer.from(await contents.arrayBuffer());
      sha=createHash("sha256").update(bytes).digest("hex");
      const existingQuery=db.from("documents").select("id")
        .eq("user_id",user.id).eq("file_sha256",sha)
        .neq("id",doc.id).limit(1);
      const {data:existing,error:matchError}=await inScope(existingQuery).maybeSingle();
      if(matchError){skipped++;continue;}
      const {error:updateError}=await db.from("documents")
        .update({
          file_sha256:sha,duplicate_of:existing?.id??null,
          file_hash_checked_at:new Date().toISOString(),
        }).eq("id",doc.id).eq("user_id",user.id).is("file_sha256",null);
      if(updateError){skipped++;continue;}
      scanned++;
      if(existing)foundDuplicates++;
    }catch{
      skipped++;
    }finally{
      // Non bloccare l'intero archivio se un vecchio file non è leggibile.
      if(!sha||skipped>0){
        await db.from("documents").update({file_hash_checked_at:new Date().toISOString()})
          .eq("id",doc.id).eq("user_id",user.id).is("file_sha256",null)
          .is("file_hash_checked_at",null);
      }
    }
  }
  const {count,error:countError}=await inScope(db.from("documents")
    .select("id",{head:true,count:"exact"})
    .eq("user_id",user.id).is("file_sha256",null).is("file_hash_checked_at",null));
  return answer({
    scanned,foundDuplicates,skipped,remaining:countError?null:count??0,
    batchSize:MAX_FILES_PER_REQUEST,
  });
}
