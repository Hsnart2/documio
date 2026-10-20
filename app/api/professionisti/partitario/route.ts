import { authenticateProfessional, professionalReply, uuidValid } from "@/lib/professional-server";
import {
 annualLedger,ledgerCsv,trialBalanceCsv,
 type LedgerAccount,type JournalEntry,type JournalLine,
} from "@/lib/year-end-ledger";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

type PageResult<T>={data:T[]|null;error:{message:string}|null};
async function readAll<T>(
 page:(from:number,to:number)=>Promise<PageResult<T>>,
 maxRows=25000,
):Promise<T[]>{
 const size=500,result:T[]=[];
 for(let from=0;from<maxRows;from+=size){
  const {data,error}=await page(from,from+size-1);
  if(error)throw Error("Dati contabili non disponibili");
  const rows=data??[];
  result.push(...rows);
  if(rows.length<size)return result;
 }
 throw Error("Troppi movimenti per questa esportazione: usare periodi più brevi");
}
export async function GET(request:Request){
 const auth=await authenticateProfessional(request);
 if(!auth)return professionalReply({error:"Accesso richiesto."},401);
 const args=new URL(request.url).searchParams;
 const id=args.get("clientId"),year=Number(args.get("year"));
 const format=args.get("format")??"json";
 if(!uuidValid(id)||!Number.isInteger(year)||year<2000||year>2100||
    !["json","partitario","verifica"].includes(format))
   return professionalReply({error:"Parametri di report non validi."},400);
 const {data:owner,error:ownerError}=await auth.client.from("professional_clients")
  .select("id,studio_id,display_name").eq("id",id).maybeSingle();
 if(ownerError||!owner)return professionalReply({error:"Cliente non accessibile."},404);
 try{
   const accounts=await readAll<LedgerAccount>(async(from,to)=>{
     const {data,error}=await auth.client.from("professional_ledger_accounts")
       .select("id,code,name,account_type").eq("client_id",id)
       .eq("studio_id",owner.studio_id).order("code").range(from,to);
     return {data:data as LedgerAccount[]|null,error};
   },1000);
   const entries=await readAll<JournalEntry>(async(from,to)=>{
     const {data,error}=await auth.client.from("professional_journal_entries")
       .select("id,entry_date,description,status")
       .eq("client_id",id).eq("studio_id",owner.studio_id)
       .lte("entry_date",year+"-12-31")
       .order("entry_date").order("id").range(from,to);
     return {data:data as JournalEntry[]|null,error};
   },25000);
   const posted=entries.filter(e=>e.status==="posted");
   const lines:JournalLine[]=[];
   for(let offset=0;offset<posted.length;offset+=100){
     const ids=posted.slice(offset,offset+100).map(e=>e.id);
     const parts=await readAll<JournalLine>(async(from,to)=>{
       const {data,error}=await auth.client.from("professional_journal_lines")
         .select("id,entry_id,account_id,debit,credit").eq("client_id",id)
         .eq("studio_id",owner.studio_id).in("entry_id",ids)
         .order("id").range(from,to);
       return {data:data as JournalLine[]|null,error};
     },10000);
     lines.push(...parts);
     if(lines.length>80000)throw Error("Troppi movimenti da esportare");
   }
   const report=annualLedger(year,accounts,entries,lines);
   const warning="Prospetto basato solo sulle scritture contabilizzate in DocuMio. "
     +"Senza apertura di esercizio, fatture registrate, assestamenti e riconciliazione "
     +"con gli estratti conto, i saldi NON rappresentano un bilancio civilistico certificato.";
   if(format==="json")return professionalReply({
     ...report,clientName:owner.display_name,warning,
     bankBalancesVerified:false,
   });
   const content=format==="partitario"?ledgerCsv(report):trialBalanceCsv(report);
   const filename=(format==="partitario"?"partitario":"bilancio-verifica")+"-"+year+".csv";
   return new Response(content,{
     status:200,headers:{
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":'attachment; filename="'+filename+'"',
      "Cache-Control":"private, no-store","Vary":"Authorization",
     },
   });
 }catch(e){
   console.error("Professional yearend report:",e instanceof Error?e.message:"failure");
   return professionalReply({error:"Report non disponibile: controllare completezza e quadratura delle scritture."},503);
 }
}
