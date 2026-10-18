import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
function load(file){
 const output=ts.transpileModule(read(file),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true,
 });
 assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);
 const module={exports:{}};
 new Function("module","exports","require",output.outputText)(
   module,module.exports,()=>{throw Error("unexpected import");});
 return module.exports;
}
const sources=load("../lib/professional-sources.ts");
test("Fonti ufficiali predefinite, niente URL di ricerca arbitrari",()=>{
 for(const kind of ["730","isee","contratto","contenzioso","iva","contabilita"]){
   const references=sources.sourcesFor(kind);
   assert.ok(references.length>=1,kind);
   for(const source of references){
     const url=new URL(source.url);
     assert.equal(url.protocol,"https:");
     assert.ok(["agenziaentrate.gov.it","infoprecompilata.agenziaentrate.gov.it",
       "www.inps.it","pst.giustizia.it","www.normattiva.it"].includes(url.hostname));
   }
 }
});
test("Originali non sono pubblici, ACL si applica a metadata e link",()=>{
 const sql=read("../supabase/migrations/20261018_professional_client_documents.sql");
 for(const table of ["professional_client_permissions","professional_documents",
  "professional_document_case_links","professional_document_reads","professional_upload_intents"]){
  assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
 }
 assert.match(sql,/professional_client_access\(client_id,false\)/);
 assert.match(sql,/professional_client_access\(client_id,true\)/);
 assert.match(sql,/professional_client_creator_acl/);
 assert.match(sql,/check\(storage_path like studio_id::text/);
 assert.match(sql,/create unique index professional_documents_sha_unique_idx/);
 assert.match(sql,/private bucket|PRIVATE bucket/i);
 assert.match(sql,/values\('professional-documents','professional-documents',false/);
});
test("API documenti: JWT, RLS, sha256, firma e link breve auditato",()=>{
 const upload=read("../app/api/professionisti/documenti/upload/route.ts");
 const open=read("../app/api/professionisti/documenti/open/route.ts");
 const server=read("../lib/professional-server.ts");
 assert.match(upload,/authenticateProfessional\(request\)/);
 assert.match(upload,/hasClientPermission\(client,clientId,true\)/);
 assert.match(upload,/createSignedUploadUrl/);
 assert.match(upload,/professional_upload_intents/);
 assert.match(upload,/createHash\("sha256"\)/);
 assert.match(upload,/validProfessionalBytes/);
 assert.match(upload,/professional_document_case_links/);
 assert.match(open,/createSignedUrl\(doc\.storage_path,45/);
 assert.match(open,/professional_document_reads/);
 assert.match(server,/auth\.getUser\(token\)/);
 assert.match(server,/\.from\("professional_clients"\)/);
});
test("Analisi AI usa file solo se collegati alla pratica; fonti con ID verificati",()=>{
 const route=read("../app/api/professionisti/assistente/route.ts");
 assert.match(route,/getVerifiedSources/);
 assert.match(route,/professional_document_case_links/);
 assert.match(route,/if\(linkError\|\|!links\|\|links\.length!==selectedDocs\.length\)/);
 assert.match(route,/if\(body\?\.consentToAi!==true\)/);
 assert.match(route,/verifiedSourceIds\.has\(id\)/);
 assert.match(route,/validProfessionalBytes/);
 assert.match(route,/\.eq\("client_id",caseRow\.client_id\)/);
});
test("Componenti nuovi e route TypeScript validi a livello sintattico",()=>{
 const paths=[
  "../lib/professional-sources.ts","../lib/professional-server.ts",
  "../app/api/professionisti/documenti/upload/route.ts",
  "../app/api/professionisti/documenti/open/route.ts",
  "../app/api/professionisti/assistente/route.ts",
  "../app/professionisti/ProfessionalDocumentsPanel.tsx",
  "../app/professionisti/page.tsx",
 ];
 for(const path of paths){
  const tree=ts.createSourceFile(path,read(path),ts.ScriptTarget.ES2022,true,
    path.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length,0,path);
 }
});
