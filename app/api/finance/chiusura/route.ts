import { createClient } from "@supabase/supabase-js";
import { zipSync, strToU8 } from "fflate";
import {
 companyYearEnd,companyYearEndFiles,
 type CompanyInvoice,type CompanyMatch,type CompanyMovement,type BankStatement,type CompanyReview,
} from "@/lib/company-yearend";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const uuid=(v:unknown):v is string=>typeof v==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const json=(obj:unknown,status=200)=>Response.json(obj,{
 status,headers:{"Cache-Control":"private, no-store","Vary":"Authorization"},
});
type Page<T>={data:T[]|null;error:{message:string}|null};
async function all<T>(fetchPage:(from:number,to:number)=>Promise<Page<T>>,maximum=30000):Promise<T[]>{
 const rows:T[]=[];
 for(let start=0;start<maximum;start+=500){
  const {data,error}=await fetchPage(start,start+499);
  if(error)throw Error("Archivio contabile non disponibile.");
  const slice=data??[];rows.push(...slice);
  if(slice.length<500)return rows;
 }
 throw Error("Archivio troppo grande per un solo pacchetto.");
}
export async function GET(request:Request){
 const token=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
 const host=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!token||!host||!anon)return json({error:"Accedi a DocuMio."},401);
 const arg=new URL(request.url).searchParams;
 const companyId=arg.get("companyId"),year=Number(arg.get("year"));
 const format=arg.get("format")??"json";
 if(!uuid(companyId)||!Number.isInteger(year)||year<2000||year>2100||
  !["json","zip"].includes(format))return json({error:"Parametri non validi."},400);
 const client=createClient(host,anon,{
  global:{headers:{Authorization:"Bearer "+token}},
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return json({error:"Sessione non valida."},401);
 const {data:company,error}=await client.from("financial_companies")
  .select("id,legal_name").eq("id",companyId).eq("user_id",user.id).maybeSingle();
 if(error||!company)return json({error:"Azienda non accessibile."},404);
 const end=year+"-12-31";
 try{
  const [invoices,movements,matches,statements,reviews]=await Promise.all([
   all<CompanyInvoice>(async(from,to)=>{
    const r=await client.from("financial_invoices")
     .select("id,invoice_number,issue_date,direction,counterparty,vat_number,amount,currency,cost_category,category_status")
     .eq("user_id",user.id).eq("company_id",companyId).lte("issue_date",end)
     .order("issue_date").order("id").range(from,to);
    return {data:r.data as CompanyInvoice[]|null,error:r.error};
   }),
   all<CompanyMovement>(async(from,to)=>{
    const r=await client.from("financial_transactions")
     .select("id,booking_date,amount,currency,account_label,counterparty,description,source")
     .eq("user_id",user.id).eq("company_id",companyId).lte("booking_date",end)
     .order("booking_date").order("id").range(from,to);
    return {data:r.data as CompanyMovement[]|null,error:r.error};
   }),
   all<CompanyMatch>(async(from,to)=>{
    const r=await client.from("financial_matches")
     .select("id,invoice_id,transaction_id,allocated_amount,confirmed_at,matching_method")
     .eq("user_id",user.id).eq("company_id",companyId)
     .order("id").range(from,to);
    return {data:r.data as CompanyMatch[]|null,error:r.error};
   }),
   all<BankStatement>(async(from,to)=>{
    const r=await client.from("financial_bank_yearend_balances")
     .select("id,account_label,fiscal_year,opening_balance,closing_balance,currency,statement_document_id,provenance")
     .eq("user_id",user.id).eq("company_id",companyId).eq("fiscal_year",year)
     .order("account_label").range(from,to);
    return {data:r.data as BankStatement[]|null,error:r.error};
   },1000),
   all<CompanyReview>(async(from,to)=>{
    const r=await client.from("financial_transaction_reviews")
      .select("transaction_id,classification,note")
      .eq("user_id",user.id).eq("company_id",companyId)
      .order("transaction_id").range(from,to);
    return {data:r.data as CompanyReview[]|null,error:r.error};
   }),
  ]);
  const report=companyYearEnd(year,invoices,movements,matches,statements,reviews);
  if(format==="json")return json({
   companyName:company.legal_name,year,totals:report.totals,
   banks:report.banks,warnings:report.warnings,
   invoiceYearCount:report.yearlyInvoices.length,
   openInvoiceCount:report.open.length,
   movementYearCount:report.importedInYear.length,
   unallocatedMovements:report.totals.unallocatedMovements,
   advancesToVerify:report.totals.advancesToVerify,
  });
  const files=companyYearEndFiles(report,company.legal_name);
  const zipped=zipSync(Object.fromEntries(Object.entries(files)
    .map(([name,content])=>[name,strToU8(content)])),{level:6});
  return new Response(new Uint8Array(zipped),{
   status:200,headers:{
    "Content-Type":"application/zip",
    "Content-Disposition":'attachment; filename="documio-commercialista-'+year+'.zip"',
    "Cache-Control":"private, no-store","Vary":"Authorization",
   },
  });
 }catch(problem){
  console.error("Company yearend export",problem instanceof Error?problem.message:"unknown");
  return json({error:"Pacchetto non disponibile: verificare i dati e la loro completezza."},503);
 }
}
