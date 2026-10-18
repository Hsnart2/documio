import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read=(file)=>readFileSync(new URL(file,import.meta.url),"utf8");
function loadTS(path){
  const output=ts.transpileModule(read(path),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    reportDiagnostics:true,
  });
  assert.equal(output.diagnostics?.filter((d)=>d.category===ts.DiagnosticCategory.Error).length??0,0);
  const module={exports:{}};
  new Function("module","exports","require",output.outputText)(
    module,module.exports,()=>{throw Error("Import esterno inatteso");});
  return module.exports;
}
const workflows=loadTS("../lib/professional-workflows.ts");
const sql=read("../supabase/migrations/20261018_professional_studios.sql");

test("Flussi dedicati per commercialisti CAF avvocati",()=>{
  assert.ok(workflows.caseTypesFor("commercialista").some((c)=>c.value==="iva"));
  assert.ok(workflows.caseTypesFor("caf").some((c)=>c.value==="730"));
  assert.ok(workflows.caseTypesFor("caf").some((c)=>c.value==="isee"));
  assert.ok(workflows.caseTypesFor("legale").some((c)=>c.value==="contenzioso"));
  assert.ok(!workflows.caseTypesFor("legale").some((c)=>c.value==="iva"));
  assert.equal(workflows.caseTypesFor("multiservizi").length,workflows.CASE_TYPES.length);
  for(const k of workflows.CASE_TYPES){
    const list=workflows.checklistFor(k.value);
    assert.ok(list.length>=5,k.value);
    assert.equal(list.length,new Set(list).size,k.value);
    assert.ok(list.some((x)=>/revisione|professionista|approvazione|verificare/i.test(x)),k.value);
  }
});

test("Checklist completa non certifica conclusione fiscale o legale",()=>{
  const completed=workflows.checklistFor("730").map((title)=>({title,is_done:true}));
  const result=workflows.humanChecklistSuggestion("730",completed);
  assert.match(result.summary,/non certifica/);
  assert.match(result.limitations,/Nessuna verifica/);
  assert.ok(result.actions.length>0);
  const pending=workflows.humanChecklistSuggestion("contenzioso",[
    {title:"Ricostruire fatti",is_done:false},
    {title:"Verificare notifiche",is_done:true},
  ]);
  assert.match(pending.summary,/1 verifiche/);
  assert.deepEqual(pending.actions,["Ricostruire fatti"]);
});

test("Tutti gli archivi studio hanno RLS e non espongono la service key",()=>{
  for(const name of [
    "professional_studios","professional_studio_members","professional_clients",
    "professional_cases","professional_case_tasks","professional_studio_invites",
    "professional_activity",
  ])assert.match(sql,new RegExp("alter table public\\."+name+" enable row level security"));
  assert.match(sql,/revoke all on public\.professional_studios,public\.professional_studio_members/);
  assert.match(sql,/grant select on public\.professional_studio_members to authenticated/);
  assert.doesNotMatch(sql,/grant (insert|update|delete) on public\.professional_studio_members to authenticated/);
  assert.match(sql,/documio_internal\.professional_role/);
  assert.match(sql,/owner_user_id=\(select auth\.uid\(\)\)/);
});

test("Clienti e pratiche della stessa area con chiavi incrociate",()=>{
  assert.match(sql,/foreign key\(client_id,studio_id\) references public\.professional_clients\(id,studio_id\)/);
  assert.match(sql,/foreign key\(case_id,studio_id\) references public\.professional_cases\(id,studio_id\)/);
  assert.match(sql,/new\.studio_id is distinct from old\.studio_id/);
  assert.match(sql,/professional_audit/);
  assert.match(sql,/grant select on public\.professional_activity to authenticated/);
});

test("Invito solo email verificata, monouso, scadenza e revoca",()=>{
  assert.match(sql,/token_hash text not null unique/);
  assert.match(sql,/email_confirmed_at is not null/);
  assert.match(sql,/accepted_at is null/);
  assert.match(sql,/revoked_at is null and expires_at>now\(\)/);
  assert.match(sql,/for update;/);
  assert.match(sql,/on conflict\(studio_id,user_id\) do nothing/);
  const invite=read("../app/professionisti/invito/page.tsx");
  const studio=read("../app/professionisti/page.tsx");
  assert.match(invite,/window\.history\.replaceState/);
  assert.match(studio,/#token=/);
  assert.match(studio,/crypto\.getRandomValues/);
  assert.match(studio,/crypto\.subtle\.digest/);
});

test("Assistente richiede login, RLS, consenso e niente decisioni automatiche",()=>{
  const route=read("../app/api/professionisti/assistente/route.ts");
  assert.match(route,/auth\.getUser\(token\)/);
  assert.match(route,/\.from\("professional_cases"\)/);
  assert.match(route,/\.from\("professional_case_tasks"\)/);
  assert.match(route,/consentToAi!==true/);
  assert.match(route,/Testi liberi e originali vengono inviati SOLO dopo consenso esplicito/);
  assert.match(route,/Non inventare articoli, aliquote/);
  assert.doesNotMatch(route,/\.from\("professional_cases"\)\s*\.update/);
});

test("Interfaccia professionale valida e link raggiungibile dal menu",()=>{
  for(const file of ["../app/professionisti/page.tsx",
     "../app/professionisti/invito/page.tsx",
     "../app/api/professionisti/assistente/route.ts"]){
    const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,
      file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    assert.equal(ast.parseDiagnostics.length,0,file);
  }
  const nav=read("../app/AppShellNavigation.tsx");
  assert.match(nav,/id: "professionals", href: "\/professionisti"/);
  assert.match(nav,/href="\/professionisti"/);
  assert.match(read("../app/professionisti/professionisti.css"),/safe-area-inset-bottom/);
});
