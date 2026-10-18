import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const PROFESSIONAL_BUCKET="professional-documents";
export const MAX_PROFESSIONAL_FILE=20*1024*1024;
export const uuidValid=(v:unknown):v is string =>
 typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const mimeAllowed=(v:unknown):v is string =>
 typeof v==="string"&&["application/pdf","image/jpeg","image/png","application/xml"].includes(v);

export type ProfessionalSession={user:User;client:SupabaseClient;admin:SupabaseClient};
export async function authenticateProfessional(request:Request):Promise<ProfessionalSession|null>{
 const token=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
 if(!token||!url||!anon||!secret)return null;
 const client=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},
   auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)return null;
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 return {user,client,admin};
}
export async function hasClientPermission(
 client:SupabaseClient,clientId:string,write:boolean,
):Promise<boolean>{
 if(!uuidValid(clientId))return false;
 const {data,error}=await client.from("professional_clients")
  .select("id").eq("id",clientId).maybeSingle();
 if(error||!data)return false;
 if(!write)return true;
 const {data:can,error:canError}=await client.rpc("documio_can_edit_client",{p_client_id:clientId});
 return !canError&&can===true;
}
export function professionalReply(payload:unknown,status=200){
 return Response.json(payload,{status,headers:{"Cache-Control":"private, no-store","Vary":"Authorization"}});
}
export function validProfessionalBytes(bytes:Buffer,mime:string){
 if(bytes.byteLength===0||bytes.byteLength>MAX_PROFESSIONAL_FILE)return false;
 if(mime==="application/pdf")return bytes.subarray(0,5).toString()==="%PDF-";
 if(mime==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/png")return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==="application/xml"){
   const front=bytes.subarray(0,1000).toString("utf8").replace(/^\uFEFF/,"").trimStart();
   return (front.startsWith("<?xml")||front.startsWith("<FatturaElettronica")||
     front.startsWith("<p:FatturaElettronica"))&&!front.includes("<!DOCTYPE");
 }
 return false;
}
