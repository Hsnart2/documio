import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
function loadTS(p){
 const x=ts.transpileModule(read(p),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true,
 });
 assert.equal(x.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);
 const mod={exports:{}};
 new Function("exports","module","require",x.outputText)(mod.exports,mod,
   ()=>{throw Error("unexpected import")});
 return mod.exports;
}
const rules=loadTS("../lib/professional-requirements.ts");
test("CAF e studi legali hanno checklist documenti non certificative",()=>{
 for(const type of ["730","isee","red","bonus","pensioni","successione","contenzioso","contratto"]){
  const list=rules.requirementsFor(type);
  assert.ok(list.length>=3,type);
  assert.equal(new Set(list.map(x=>x.code)).size,list.length);
  assert.ok(list.every(x=>x.label.length>=3));
 }
});
test("Contabilità in partita doppia con quadratura e blocco scritture",()=>{
 const sql=read("../supabase/migrations/20261018_professional_accounting_caf_legal.sql");
 for(const table of [
  "professional_ledger_accounts","professional_journal_entries",
  "professional_journal_lines","professional_vat_items",
  "professional_case_requirements","professional_legal_events",
 ]){
  assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
 }
 assert.match(sql,/total_d<>total_c/);
 assert.match(sql,/num_lines<2/);
 assert.match(sql,/old\.status='posted'/);
 assert.match(sql,/for update;/);
 assert.match(sql,/security_invoker=true/);
 assert.match(sql,/documio_internal\.professional_client_access\(client_id/);
 assert.match(sql,/documio_create_journal/);
});
test("Verifica professionista, originali coerenti e niente invii automatici",()=>{
 const ddl=read("../supabase/migrations/20261018_professional_accounting_caf_legal.sql");
 assert.match(ddl,/professional_role\(new\.studio_id\) not in \('owner','professional'\)/);
 assert.match(ddl,/foreign key\(document_id,case_id\) references public\.professional_document_case_links/);
 assert.match(ddl,/check\(\(status in \('provided','verified'\) and document_id is not null\)/);
 assert.match(ddl,/create table public\.professional_legal_events/);
 const draft=read("../app/api/professionisti/bozze/route.ts");
 assert.match(draft,/consentToAi!==true/);
 assert.match(draft,/auth\.client\.from\("professional_cases"\)/);
 assert.match(draft,/documio_can_edit_client/);
 assert.match(draft,/sent:false/);
 assert.match(draft,/allowable\.has\(x\)/);
});
test("Contabilità CAF e pratiche legali UI sintatticamente corrette",()=>{
 const files=[
  "../app/professionisti/page.tsx",
  "../app/professionisti/ProfessionalAccountingPanel.tsx",
  "../app/professionisti/ProfessionalPracticePanel.tsx",
  "../app/api/professionisti/bozze/route.ts",
  "../lib/professional-requirements.ts",
  "../lib/professional-workflows.ts",
 ];
 for(const path of files){
  const ast=ts.createSourceFile(path,read(path),ts.ScriptTarget.ES2022,true,
    path.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,path);
 }
});
