import { createHash,randomUUID } from "node:crypto";
import {
 authenticateProfessional,hasClientPermission,mimeAllowed,MAX_PROFESSIONAL_FILE,
 PROFESSIONAL_BUCKET,professionalReply,uuidValid,validProfessionalBytes,
} from "@/lib/professional-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const hashValid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);

export async function POST(request:Request){
 const auth=await authenticateProfessional(request);
 if(!auth)return professionalReply({error:"Sessione o archivio professionale non disponibili."},401);
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body||typeof body.action!=="string")return professionalReply({error:"Richiesta non valida."},400);
 const {user,client,admin}=auth;

 if(body.action==="start"){
   const clientId=body.clientId,caseId=body.caseId;
   const name=typeof body.name==="string"?body.name.trim().slice(0,200):"";
   const mime=body.mime,hash=body.sha256;
   const size=body.size;
   if(!uuidValid(clientId)||!uuidValid(caseId)||!mimeAllowed(mime)||
      !hashValid(hash)||name.length<1||typeof size!=="number"||!Number.isInteger(size)||
      Number(size)<1||Number(size)>MAX_PROFESSIONAL_FILE)
     return professionalReply({error:"File, pratica o dimensione non validi (massimo 20 MB)."},400);
   const suffix:Record<string,RegExp>={
     "application/pdf":/\.pdf$/i,"image/jpeg":/\.jpe?g$/i,
     "image/png":/\.png$/i,"application/xml":/\.xml$/i,
   };
   if(!suffix[mime].test(name))return professionalReply({error:"Estensione del file non coerente."},400);
   if(!await hasClientPermission(client,clientId,true))
     return professionalReply({error:"Nessun permesso di modifica sul cliente."},403);
   const {data:caseRow,error:caseError}=await client.from("professional_cases")
     .select("id,studio_id,client_id").eq("id",caseId).eq("client_id",clientId).maybeSingle();
   if(caseError||!caseRow)return professionalReply({error:"Pratica non disponibile per questo cliente."},404);
   const since=new Date(Date.now()-3600000).toISOString();
   const {count,error:countError}=await admin.from("professional_upload_intents")
     .select("id",{count:"exact",head:true}).eq("created_by",user.id).gte("created_at",since);
   if(countError)return professionalReply({error:"Controllo caricamenti non disponibile."},503);
   if((count??0)>=25)return professionalReply({error:"Troppi tentativi di caricamento nell'ultima ora."},429);
   const path=caseRow.studio_id+"/"+clientId+"/"+randomUUID()+"."+name.split(".").pop()!.toLowerCase();
   const {data:intent,error:intentError}=await admin.from("professional_upload_intents")
     .insert({studio_id:caseRow.studio_id,client_id:clientId,case_id:caseId,
       created_by:user.id,storage_path:path,original_name:name,
       content_type:mime,expected_size:size,expected_hash:hash})
     .select("id").single();
   if(intentError||!intent)return professionalReply({error:"Impossibile preparare il caricamento."},503);
   const {data:signed,error:signError}=await admin.storage.from(PROFESSIONAL_BUCKET)
     .createSignedUploadUrl(path);
   if(signError||!signed){
     await admin.from("professional_upload_intents").delete().eq("id",intent.id);
     return professionalReply({error:"Archivio privato non disponibile."},503);
   }
   return professionalReply({intentId:intent.id,path,token:signed.token,
     bucket:PROFESSIONAL_BUCKET,maxBytes:MAX_PROFESSIONAL_FILE});
 }
 if(body.action==="finish"){
   const intentId=body.intentId;
   if(!uuidValid(intentId))return professionalReply({error:"Caricamento sconosciuto."},400);
   const {data:intent,error:intentError}=await admin.from("professional_upload_intents")
     .select("id,created_by,studio_id,client_id,case_id,storage_path,content_type,expected_size,expected_hash,original_name,expires_at,consumed_at")
     .eq("id",intentId).eq("created_by",user.id).maybeSingle();
   if(intentError||!intent||intent.consumed_at||Date.parse(intent.expires_at)<Date.now())
     return professionalReply({error:"Caricamento scaduto, già completato o non autorizzato."},403);
   if(!await hasClientPermission(client,intent.client_id,true))
     return professionalReply({error:"Permesso sul cliente revocato."},403);
   const {data:practice,error:practiceError}=await client.from("professional_cases")
     .select("id").eq("id",intent.case_id).eq("client_id",intent.client_id)
     .eq("studio_id",intent.studio_id).maybeSingle();
   if(practiceError||!practice)return professionalReply({error:"Pratica non più disponibile."},403);
   const {data:file,error:downloadError}=await admin.storage.from(PROFESSIONAL_BUCKET)
     .download(intent.storage_path);
   if(downloadError||!file)return professionalReply({error:"Il file non risulta caricato."},404);
   const bytes=Buffer.from(await file.arrayBuffer());
   const calculated=createHash("sha256").update(bytes).digest("hex");
   if(bytes.length!==intent.expected_size||calculated!==intent.expected_hash||
      !validProfessionalBytes(bytes,intent.content_type)){
     await admin.storage.from(PROFESSIONAL_BUCKET).remove([intent.storage_path]);
     return professionalReply({error:"Il file salvato non corrisponde all'originale o non è supportato."},422);
   }
   // Database writes run through the user's JWT; RLS enforces the assigned
   // client even if this API is called with forged IDs.
   const {data:row,error:saveError}=await client.from("professional_documents")
     .insert({studio_id:intent.studio_id,client_id:intent.client_id,
       original_name:intent.original_name,content_type:intent.content_type,
       file_size:bytes.length,sha256:calculated,bucket_id:PROFESSIONAL_BUCKET,
       storage_path:intent.storage_path,uploaded_by:user.id})
     .select("id").single();
   if(saveError||!row)return professionalReply({
      error:"File caricato ma registrazione non completata. Contatta l'assistenza senza ripetere il file."
   },409);
   const {error:linkError}=await client.from("professional_document_case_links")
     .insert({studio_id:intent.studio_id,client_id:intent.client_id,
       case_id:intent.case_id,document_id:row.id,linked_by:user.id});
   await admin.from("professional_upload_intents").update({consumed_at:new Date().toISOString()})
     .eq("id",intent.id).is("consumed_at",null);
   return professionalReply({documentId:row.id,linked:!linkError,
     notice:linkError?"File archiviato: collega il documento alla pratica dalla scheda.":null});
 }
 return professionalReply({error:"Azione sconosciuta."},400);
}
