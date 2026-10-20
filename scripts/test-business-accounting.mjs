import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}
function loadTS(path, dependencies={}) {
  const content=source(path);
  const {outputText,diagnostics}=ts.transpileModule(content,{
    reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  });
  assert.equal(diagnostics?.filter((x)=>x.category===ts.DiagnosticCategory.Error).length??0,0);
  const module={exports:{}};
  new Function("exports","module","require",outputText)(
    module.exports,module,(name)=>{
      if(Object.hasOwn(dependencies,name))return dependencies[name];
      throw new Error("Unexpected import: "+name);
    },
  );
  return module.exports;
}
const fc=loadTS("../lib/financial-control.ts");
const bi=loadTS("../lib/business-accounting.ts",{"./financial-control":fc});

test("Regole costi specifiche per CONAI, trasporti, stipendi e F24",()=>{
  const cases=[
    ["Contributo ambientale CONAI","conai"],
    ["Trasporti e spedizioni per cliente","trasporti"],
    ["Pagamento stipendi e salari","stipendi"],
    ["Modello F24 versamento ritenute","imposte"],
    ["Fattura per manutenzione impianto","manutenzioni"],
    ["Canone affitto magazzino","affitti_canoni"],
    ["Software in abbonamento","software"],
  ];
  for(const [description,category] of cases) {
    const suggestion=bi.suggestCategory("expense",description);
    assert.equal(suggestion.category,category,description);
    assert.equal(suggestion.reviewRequired,true);
  }
  assert.equal(bi.suggestCategory("expense","ABC Spa").category,"da_verificare");
  assert.equal(bi.suggestCategory("income","Vendita prodotti").category,"vendite");
  assert.equal(bi.suggestCategory("income","Prestazione servizi").category,"ricavi_servizi");
});
test("Riepilogo è lordo e non simula un bilancio fiscale",()=>{
  const summary=bi.grossInvoiceSummary([
    {direction:"income",amount:1200,currency:"EUR",cost_category:"vendite"},
    {direction:"expense",amount:550,currency:"EUR",cost_category:"trasporti"},
    {direction:"expense",amount:300,currency:"EUR",cost_category:"conai"},
    {direction:"expense",amount:999,currency:"USD",cost_category:"conai"},
  ]);
  assert.equal(summary.income,1200);
  assert.equal(summary.expense,850);
  assert.equal(summary.provisionalDifference,350);
  assert.deepEqual(summary.categorized,[["trasporti",550],["conai",300]]);
  assert.match(summary.disclaimer,/non un bilancio/);
});

const inv=(x={})=>({
  id:"invoice-1",user_id:"same-user",direction:"expense",source:"xml",
  invoice_number:"AB-17/26",issue_date:"2026-10-01",due_date:"2026-10-20",
  amount:250,currency:"EUR",counterparty:"Trasporti Verde Spa",
  document_id:null,vat_number:null,notes:null,...x,
});
const tx=(x={})=>({
  id:"txn-1",booking_date:"2026-10-17",amount:-250,currency:"EUR",
  counterparty:"Trasporti Verde Spa",description:"Bonifico fattura AB-17/26",
  source:"csv",account_label:"Conto azienda",...x,
});
test("Proposte di abbinamento solo se segno, valuta e importo sono coerenti",()=>{
  const result=bi.suggestReconciliations([inv()],[tx()],[]);
  assert.equal(result.length,1);
  assert.equal(result[0].invoiceId,"invoice-1");
  assert.equal(result[0].transactionId,"txn-1");
  assert.ok(result[0].reasons.includes("Numero fattura nella causale"));
  assert.deepEqual(bi.suggestReconciliations([inv()],[tx({amount:250})],[]),[]);
  assert.deepEqual(bi.suggestReconciliations([inv()],[tx({currency:"USD"})],[]),[]);
  assert.deepEqual(bi.suggestReconciliations([inv()],[tx()],[
    {id:"m",invoice_id:"invoice-1",transaction_id:"txn-1",allocated_amount:250},
  ]),[]);
});
test("Due movimenti simili richiedono revisione manuale",()=>{
  const proposals=bi.suggestReconciliations([inv()],[tx({id:"a"}),tx({id:"b"})],[]);
  assert.equal(proposals[0].requiresReview,true);
  // Nessun movimento viene confermato o registrato dalla funzione.
  assert.equal(proposals[0].transactionId,"a");
});

test("Le nuove tabelle contabili impongono RLS, scope proprietario e controlli incrociati",()=>{
  const ddl=source("../supabase/migrations/20261016_multi_company_workspaces.sql");
  for(const table of ["financial_companies","financial_accounting_records","financial_contract_reviews"]){
    assert.match(ddl,new RegExp("alter table public\\."+table+" enable row level security"));
  }
  for(const object of ["financial_invoices","financial_transactions","financial_matches","financial_deadlines","documents","practices"]){
    assert.match(ddl,new RegExp("alter table public\\."+object+" add column if not exists company_id"));
  }
  assert.match(ddl,/references public.financial_companies\(id,user_id\)/);
  assert.match(ddl,/documio_match_workspace_guard/);
  assert.match(ddl,/documio_invoice_workspace_guard/);
  assert.match(ddl,/documio_document_practice_scope_guard/);
  assert.match(ddl,/financial_contract_reviews_own/);
});
test("Contratti con consenso, archivio verificato e risultato strutturato",()=>{
  const route=source("../app/api/contracts/review/route.ts");
  assert.match(route,/consentToAi!==true/);
  assert.match(route,/auth\.getUser\(token\)/);
  assert.match(route,/\.eq\("user_id",user.id\)/);
  assert.match(route,/financial_contract_reviews/);
  assert.match(route,/file_data:dataUrl/);
  assert.match(route,/non un parere legale/);
});
test("Le API con service role non mischiano archivi aziendali",()=>{
  const assistant=source("../app/api/assistant/route.ts");
  const search=source("../app/api/search/route.ts");
  const smartHome=source("../app/SmartHomeV2.tsx");
  const actions=source("../app/TodayActionCenter.tsx");
  const main=source("../app/page.tsx");
  assert.match(assistant,/financial_companies/);
  assert.match(assistant,/requestedCompany/);
  assert.match(assistant,/inWorkspace\(admin/);
  assert.match(assistant,/\.eq\("user_id", user.id\)/);
  assert.match(search,/financial_companies/);
  assert.match(search,/inScope\(client\.from\("documents"\)/);
  assert.match(smartHome,/companyId \}/);
  assert.match(actions,/\.is\("company_id",null\)/);
  assert.match(main,/companyId,\s*documents: relevantDocuments/);
});

test("Document Brain con service role controlla davvero l'azienda proprietaria",()=>{
  const brain=source("../app/api/document-brain/route.ts");
  assert.match(brain,/const requestedCompany = body\?\.companyId \?\? null/);
  assert.match(brain,/\.from\("financial_companies"\)/);
  assert.match(brain,/\.eq\("user_id",user\.id\)/);
  assert.match(brain,/inWorkspace\(admin/);
  assert.match(brain,/return NextResponse\.json\(\{ error: "Azienda non accessibile\." \}, \{ status: 403 \}\)/);
  const finance=source("../app/controllo/page.tsx");
  assert.match(finance,/workspaceConnections=connections\.filter\(c=>c\.company_id===companyId\)/);
  assert.match(finance,/const bankLoadVersion = useRef\(0\)/);
});

test("La navigazione e i selettori conservano l'azienda selezionata",()=>{
  const nav=source("../app/AppShellNavigation.tsx");
  const upload=source("../app/carica/page.tsx");
  const finance=source("../app/controllo/page.tsx");
  assert.match(nav,/workspaceHref\(item.href\)/);
  assert.match(nav,/documio:workspace/);
  assert.match(upload,/financial_document_type:entry.kind/);
  assert.match(upload,/company_id:entry.companyId/);
  assert.match(finance,/inScope|scope\(supabase\.from/);
  assert.match(finance,/window\.dispatchEvent\(new Event\("documio:workspace"\)\)/);
});

test("Moduli aziendali TSX con sintassi valida",()=>{
  const paths=[
    "../app/aziende/page.tsx","../app/controllo/page.tsx",
    "../app/carica/page.tsx","../app/page.tsx",
  ];
  for(const path of paths) {
    const tree=ts.createSourceFile(path,source(path),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
    assert.equal(tree.parseDiagnostics.length,0,path);
  }
});
