import type { SupabaseClient } from "@supabase/supabase-js";

/** Il confronto è sull'intero file, non sul nome. */
export async function fileSha256(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return [...digest].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
export type FileDuplicate = {
  id:string;title:string;file_name:string;storage_path:string|null;
  file_sha256:string;company_id:string|null;
};

/** Il filtro per l'azienda è eseguito IN SUPABASE, non solo nel browser. */
export async function findFileDuplicate(
  supabase:SupabaseClient,owner:string,companyId:string|null,sha:string,
):Promise<FileDuplicate|null> {
  if(!/^[a-f0-9]{64}$/.test(sha))throw new Error("Impronta file non valida.");
  const query=supabase.from("documents")
    .select("id,title,file_name,storage_path,file_sha256,company_id")
    .eq("user_id",owner).eq("file_sha256",sha);
  const {data,error}=await (companyId
    ?query.eq("company_id",companyId):query.is("company_id",null))
    .order("uploaded_at",{ascending:true}).limit(1).maybeSingle();
  if(error)throw new Error("Non è stato possibile verificare i duplicati: "+error.message);
  return (data??null) as FileDuplicate|null;
}

export async function openExistingFile(
  supabase:SupabaseClient,original:FileDuplicate,
):Promise<void> {
  if(!original.storage_path)throw new Error("Il documento esistente non ha un file apribile.");
  const {data,error}=await supabase.storage.from("documents")
    .createSignedUrl(original.storage_path,120);
  if(error||!data?.signedUrl)throw new Error("Impossibile aprire il documento originale.");
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
}
