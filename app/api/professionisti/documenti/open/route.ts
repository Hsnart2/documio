import {
 authenticateProfessional,PROFESSIONAL_BUCKET,professionalReply,uuidValid,
} from "@/lib/professional-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const auth=await authenticateProfessional(request);
 if(!auth)return professionalReply({error:"Accesso richiesto."},401);
 const documentId=new URL(request.url).searchParams.get("documentId");
 if(!uuidValid(documentId))return professionalReply({error:"Documento non valido."},400);
 const {data:doc,error}=await auth.client.from("professional_documents")
  .select("id,studio_id,client_id,storage_path,original_name,bucket_id,content_type")
  .eq("id",documentId).maybeSingle();
 if(error||!doc||doc.bucket_id!==PROFESSIONAL_BUCKET)
   return professionalReply({error:"Documento non accessibile."},404);
 const expectedPrefix=doc.studio_id+"/"+doc.client_id+"/";
 if(!doc.storage_path.startsWith(expectedPrefix))
   return professionalReply({error:"Archivio non coerente."},403);
 // Short-lived signed URLs: never send service-role keys or permanent object URLs.
 const {data:signed,error:issue}=await auth.admin.storage.from(PROFESSIONAL_BUCKET)
   .createSignedUrl(doc.storage_path,45,{download:doc.original_name});
 if(issue||!signed?.signedUrl)
   return professionalReply({error:"Originale non disponibile."},503);
 await auth.admin.from("professional_document_reads").insert({
  studio_id:doc.studio_id,client_id:doc.client_id,
  document_id:doc.id,actor_id:auth.user.id,
 });
 return professionalReply({url:signed.signedUrl,filename:doc.original_name,
  expiresInSeconds:45,source:"originale_privato"});
}
