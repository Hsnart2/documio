import type { CaseType } from "@/lib/professional-workflows";

export type OfficialSource={
 id:string;title:string;url:string;kind:"guida"|"portale";
 caseTypes:readonly CaseType[];
};
export type VerifiedOfficialSource={
 id:string;title:string;url:string;kind:"guida"|"portale";
 verified:boolean;checkedAt:string|null;excerpt:string;
};
const catalog:readonly OfficialSource[]=[
 {
  id:"ade-fatture",title:"Agenzia Entrate — fatturazione e conservazione",
  url:"https://agenziaentrate.gov.it/portale/web/guest/aree-tematiche/fatturazione-elettronica/guida-fatturazione-elettronica/come-predisporre-inviare-ricevere-fe/come-si-conservano-fe",
  kind:"guida",caseTypes:["contabilita","iva","f24","consulenza"],
 },
 {
  id:"ade-precompilata",title:"Agenzia Entrate — dichiarazione precompilata 2026",
  url:"https://infoprecompilata.agenziaentrate.gov.it/portale/i-passi-da-seguire",
  kind:"guida",caseTypes:["730","redditi","consulenza"],
 },
 {
  id:"inps-isee",title:"INPS — portale unico ISEE e DSU",
  url:"https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.Portale-unico-ISEE.html",
  kind:"guida",caseTypes:["isee","consulenza"],
 },
 {
  id:"inps-red",title:"INPS — servizi ai pensionati e dichiarazione RED",
  url:"https://www.inps.it/it/it/previdenza/per-pensionati.html",
  kind:"guida",caseTypes:["red","consulenza"],
 },
 {
  id:"inps-pensione",title:"INPS — domande e servizi pensionistici",
  url:"https://www.inps.it/it/it/previdenza/domanda-di-pensione.html",
  kind:"guida",caseTypes:["pensioni","consulenza"],
 },
 {
  id:"pst-giustizia",title:"Ministero Giustizia — documentazione servizi telematici",
  url:"https://pst.giustizia.it/PST/it/documentation.page",
  kind:"guida",caseTypes:["contenzioso","contratto","successione"],
 },
 {
  id:"normattiva",title:"Normattiva — ricerca testi normativi vigenti",
  url:"https://www.normattiva.it/",
  kind:"portale",caseTypes:["contabilita","iva","redditi","f24","730","isee",
    "successione","contratto","contenzioso","consulenza","altro","bonus","red","pensioni"],
 },
] as const;

function cleanHtml(html:string):string{
 const body=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??
   html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html;
 return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
   .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi," ")
   .replace(/<[^>]*>/g," ")
   .replace(/&nbsp;|&#160;/gi," ")
   .replace(/&amp;/gi,"&")
   .replace(/&quot;/gi,'"')
   .replace(/&(?:#39|apos);/gi,"'")
   .replace(/\s+/g," ").trim().slice(0,7000);
}
const HOSTS=new Set([
 "agenziaentrate.gov.it","infoprecompilata.agenziaentrate.gov.it",
 "www.inps.it","pst.giustizia.it","www.normattiva.it",
]);
export function sourcesFor(kind:CaseType):OfficialSource[]{
 return catalog.filter(s=>s.caseTypes.includes(kind)).slice(0,4);
}
async function liveRead(source:OfficialSource):Promise<VerifiedOfficialSource>{
 const fallback={id:source.id,title:source.title,url:source.url,
   kind:source.kind,verified:false,checkedAt:null,excerpt:""};
 if(source.kind==="portale")return fallback;
 try{
   const url=new URL(source.url);
   if(url.protocol!=="https:"||!HOSTS.has(url.hostname))return fallback;
   const res=await fetch(source.url,{
     redirect:"error",cache:"no-store",
     headers:{Accept:"text/html"},
     signal:AbortSignal.timeout(4500),
   });
   if(!res.ok || !(res.headers.get("content-type")??"").includes("text/html"))
     return fallback;
   const size=Number(res.headers.get("content-length"));
   if(size>350000 && size!==0)return fallback;
   if(!res.body)return fallback;
   const chunks:Uint8Array[]=[];let total=0;
   const reader=res.body.getReader();
   try{
     while(total<130000){
       const {done,value}=await reader.read();
       if(done)break;
       if(value){chunks.push(value);total+=value.length;}
     }
   }finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(Math.min(total,130000));
   let at=0;for(const block of chunks){
     if(at===bytes.length)break;
     const part=block.subarray(0,bytes.length-at);bytes.set(part,at);at+=part.length;
   }
   const excerpt=cleanHtml(new TextDecoder("utf-8",{fatal:false}).decode(bytes));
   if(excerpt.length<160)return fallback;
   return {...fallback,verified:true,checkedAt:new Date().toISOString(),excerpt};
 }catch{return fallback;}
}
/** No free-text URLs, scraping of login portals or unverified citations. */
export async function getVerifiedSources(kind:CaseType):Promise<VerifiedOfficialSource[]>{
 return await Promise.all(sourcesFor(kind).map(liveRead));
}
