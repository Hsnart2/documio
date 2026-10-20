import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
function load(path,mocks={}){
 const res=ts.transpileModule(read(path),{reportDiagnostics:true,
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 assert.equal(res.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length??0,0);
 const module={exports:{}};
 new Function("module","exports","require",res.outputText)(module,module.exports,(name)=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  throw Error("Unexpected dependency "+name);
 });
 return module.exports;
}
const ledger=load("../lib/year-end-ledger.ts");
const company=load("../lib/company-yearend.ts",{"./year-end-ledger":ledger});
test("Partitario corretto con apertura, scritture contabilizzate e bozze escluse",()=>{
 const accounts=[
  {id:"bank",code:"1010",name:"Banca",account_type:"asset"},
  {id:"equity",code:"3000",name:"Capitale",account_type:"equity"},
  {id:"sale",code:"4000",name:"Vendite",account_type:"revenue"},
  {id:"cost",code:"5000",name:"Materie prime",account_type:"expense"},
 ];
 const entries=[
  {id:"a",entry_date:"2025-12-31",description:"Capitale",status:"posted"},
  {id:"b",entry_date:"2026-02-01",description:"Vendite",status:"posted"},
  {id:"c",entry_date:"2026-03-01",description:"Costi",status:"posted"},
  {id:"d",entry_date:"2026-03-05",description:"Bozza",status:"draft"},
 ];
 const lines=[
  {id:"1",entry_id:"a",account_id:"bank",debit:100,credit:0},
  {id:"2",entry_id:"a",account_id:"equity",debit:0,credit:100},
  {id:"3",entry_id:"b",account_id:"bank",debit:250,credit:0},
  {id:"4",entry_id:"b",account_id:"sale",debit:0,credit:250},
  {id:"5",entry_id:"c",account_id:"cost",debit:80,credit:0},
  {id:"6",entry_id:"c",account_id:"bank",debit:0,credit:80},
  {id:"7",entry_id:"d",account_id:"bank",debit:999,credit:0},
  {id:"8",entry_id:"d",account_id:"sale",debit:0,credit:999},
 ];
 const report=ledger.annualLedger(2026,accounts,entries,lines);
 assert.equal(report.postedPeriod,2);
 assert.equal(report.draftsPeriod,1);
 assert.equal(report.historicalEntries,1);
 const bank=report.accounts.find(x=>x.id==="bank");
 assert.equal(bank.openingCents,10000);
 assert.equal(bank.endingCents,27000);
 assert.equal(report.periodDebitCents,33000);
 assert.equal(report.periodCreditCents,33000);
 assert.ok(ledger.ledgerCsv(report).includes("Partitario".toUpperCase()));
 assert.ok(ledger.trialBalanceCsv(report).includes("BILANCIO DI VERIFICA"));
 assert.equal(report.movements.filter(x=>x.accountId==="bank").at(-1).balanceCents,27000);
});
test("Scritture sbilanciate o incomplete bloccate",()=>{
 assert.throws(()=>ledger.annualLedger(2026,[{id:"b",code:"1010",name:"Banca",account_type:"asset"}],
  [{id:"x",entry_date:"2026-01-01",description:"Errore",status:"posted"}],
  [{id:"l",entry_id:"x",account_id:"b",debit:100,credit:0}]),/quadrata/i);
});
test("CSV neutralizza formule malevole senza cambiare importi",()=>{
 assert.match(ledger.csv([["=HYPERLINK(\"evil\")","Nome"]]),/'=HYPERLINK/);
 assert.match(ledger.csv([["  +SUM(1)"]]),/'  \+SUM/);
 assert.equal(ledger.euroCents(12345),"123,45");
 assert.ok(ledger.csv([["-125,50"]]).includes('"-125,50"'));
 assert.ok(ledger.csv([["-SUM(3)"]]).includes("'"+ "-SUM(3)"));
});
test("Dossier commerciale distingue fatture non riconciliate dai saldi bancari",()=>{
 const report=company.companyYearEnd(2026,[
  {id:"i",issue_date:"2026-02-10",invoice_number:"A1",direction:"income",
   counterparty:"Cliente XY",vat_number:null,amount:200,currency:"EUR",
   cost_category:null,category_status:"needs_review"},
 ],[
  {id:"t",booking_date:"2026-03-01",amount:150,currency:"EUR",account_label:"Conto principale",
   counterparty:"Cliente XY",description:"Bonifico",source:"csv"},
  {id:"z",booking_date:"2027-01-01",amount:50,currency:"EUR",account_label:"Conto principale",
   counterparty:"Cliente XY",description:"Saldo futuro",source:"csv"},
 ],[{id:"m",invoice_id:"i",transaction_id:"t",allocated_amount:150}],
 [{id:"s",account_label:"Conto principale",fiscal_year:2026,
   opening_balance:10,closing_balance:160,currency:"EUR",
   statement_document_id:null,provenance:"manual_from_statement"}]);
 assert.equal(report.totals.invoicedIncome,20000);
 assert.equal(report.totals.pendingReceivables,5000);
 assert.equal(report.importedInYear.length,1);
 assert.equal(report.banks[0].differenceCents,0);
 assert.equal(report.banks[0].status,"dichiarato_dall_utente");
 const files=company.companyYearEndFiles(report,"Azienda Prova");
 assert.deepEqual(Object.keys(files).length,8);
 assert.equal(report.totals.unallocatedMovements,0);
 assert.equal(report.attributedDetails.length,1);;
 assert.equal(report.counterparties.length,1);
 assert.equal(report.counterparties[0].unmatchedCents,5000);
 assert.match(files["partitario_clienti_fornitori_da_verificare_2026.csv"],/Cliente XY/);
 assert.match(files["LEGGIMI.txt"],/NON contiene|NON|non/g);
});
test("Nessun saldo al 31/12 inventato dai movimenti",()=>{
 const r=company.companyYearEnd(2025,[],[
  {id:"t",booking_date:"2025-01-01",amount:800,currency:"EUR",
   account_label:"Conto 1",counterparty:null,description:"Import",source:"csv"},
 ],[],[]);
 assert.equal(r.totals.bankClosingCents,null);
 assert.equal(r.banks[0].closingCents,null);
 assert.equal(r.banks[0].differenceCents,null);
});
test("Banca aziendale sempre limitata a userId e companyId",()=>{
 const api=read("../app/api/finance/banks/route.ts");
 assert.match(api,/validatedCompany\(access/);
 assert.match(api,/\.eq\("user_id",access\.userId\)/);
 assert.match(api,/\.eq\("company_id",company\.companyId\)/);
 assert.match(api,/company_id: companyId/);
 const year=read("../app/api/finance/chiusura/route.ts");
 assert.match(year,/auth\.getUser\(token\)/);
 assert.match(year,/\.eq\("company_id",companyId\)/);
 assert.match(year,/zipSync/);
 const pro=read("../app/api/professionisti/partitario/route.ts");
 assert.match(pro,/authenticateProfessional\(request\)/);
 assert.match(pro,/\.eq\("client_id",id\)/);
 assert.match(pro,/\.lte\("entry_date",year\+"-12-31"\)/);
});
test("Componenti e API TSX sintatticamente validi",()=>{
 for(const path of [
  "../app/controllo/CompanyYearEndPanel.tsx",
  "../app/controllo/page.tsx",
  "../app/professionisti/ProfessionalAccountingPanel.tsx",
  "../app/api/finance/chiusura/route.ts",
  "../app/api/professionisti/partitario/route.ts",
 ]){
  const ast=ts.createSourceFile(path,read(path),ts.ScriptTarget.ES2022,true,
   path.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,path);
 }
});
