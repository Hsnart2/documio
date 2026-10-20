import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
function load(path){
 const c=ts.transpileModule(read(path),{reportDiagnostics:true,
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 assert.equal(c.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);
 const m={exports:{}};
 new Function("module","exports","require",c.outputText)(
  m,m.exports,()=>{throw Error("unexpected import");});
 return m.exports;
}
const api=load("../lib/bank-allocations.ts");
const common={
 issue_date:"2026-08-01",due_date:"2026-09-30",currency:"EUR",
 direction:"income",counterparty:"Pizzapronta Srl"
};
const invoice=(id,amount,date="2026-09-30")=>({
 ...common,id,invoice_number:id,amount,due_date:date,
});
const tx=(body={})=>({
 id:"t1",booking_date:"2026-10-11",amount:150,currency:"EUR",
 counterparty:"Pizzapronta Srl",
 description:"ACCONTO FATTURE OTTOBRE",...body,
});
test("Acconto fatture generico: proposta FIFO solo stesso cliente, mai attribuzione immediata",()=>{
 const proposal=api.suggestTransferAllocations(tx(),[
  invoice("FAT100",100,"2026-09-10"),
  invoice("FAT200",90,"2026-09-30"),
  {...invoice("B33",50),counterparty:"Altro cliente Srl"},
 ],[]);
 assert.equal(proposal.isAdvance,true);
 assert.equal(proposal.confidence,"needs_review");
 assert.deepEqual(proposal.proposed.map(x=>[x.invoiceId,x.amount]),[
  ["FAT100",100],["FAT200",50]]);
 assert.equal(proposal.remainingAfterProposal,0);
 assert.ok(proposal.notice.includes("verifica"));
});
test("Bonifico unico su più fatture con quota già usata: rispetta residuo banca",()=>{
 const invoices=[invoice("FAT100",100),invoice("FAT200",90)];
 const existing=[{invoice_id:"FAT100",transaction_id:"t1",allocated_amount:20}];
 assert.equal(api.alreadyAllocated("t1",existing),20);
 assert.equal(api.invoiceRemaining(invoices[0],existing),80);
 const p=api.suggestTransferAllocations(tx(),invoices,existing);
 assert.equal(p.unallocated,130);
 assert.equal(p.proposed.reduce((sum,a)=>sum+a.amount,0),130);
});
test("Uscita verso fornitore su più fatture, mai confrontare con incassi",()=>{
 const supplier={...invoice("S1",80),direction:"expense",counterparty:"Trasporti Ancona Spa"};
 const incoming=invoice("C1",80);
 const p=api.suggestTransferAllocations(tx({amount:-100,
  counterparty:"Trasporti Ancona",description:"ACCONTO FATTURE"}),[incoming,supplier],[]);
 assert.equal(p.proposed.length,1);
 assert.equal(p.proposed[0].invoiceId,"S1");
 assert.equal(p.remainingAfterProposal,20);
});
test("Nessun nome né numero: acconto irrisolto, niente chiusure a caso",()=>{
 const p=api.suggestTransferAllocations(tx({
  counterparty:"",description:"Bonifico / Acconto generico senza mittente",amount:110,
 }),[invoice("FAT100",100),invoice("FAT200",90)],[]);
 assert.equal(p.confidence,"unresolved");
 assert.equal(p.proposed.length,0);
 assert.equal(p.unallocated,110);
});
test("Valuta diversa o segno opposto mai candidato",()=>{
 const invoices=[invoice("A1",100),{...invoice("B1",100),currency:"USD"}];
 const p=api.suggestTransferAllocations(tx({amount:-100}),invoices,[]);
 assert.equal(p.proposed.length,0);
});
test("Un acconto precedente all'emissione è segnalato come rischio",()=>{
 const i={...invoice("AB2026",50),
   issue_date:"2026-11-01",due_date:"2026-12-30"};
 const p=api.suggestTransferAllocations(tx({amount:50}),[i],[]);
 assert.ok(p.candidates[0].reasons.some(x=>x.includes("precedente")));
 assert.equal(p.confidence,"needs_review");
});
test("Integrazione bancaria è SOLO AIS, storico parametrico, mai credenziali bancarie",()=>{
 const route=read("../app/api/finance/banks/route.ts");
 assert.match(route,/access_scope:\["balances","transactions"\]/);
 assert.match(route,/max_historical_days:historyDays/);
 assert.match(route,/business_accounts_supported/);
 assert.match(route,/institution_name\.slice\(0,40\)/);
 assert.doesNotMatch(route,/\/payments\//);
 const page=read("../app/controllo/page.tsx");
 for(const name of ["MPS","BPER","BCC","Credem"])assert.ok(page.includes('"'+name+'"'));
 assert.match(page,/BankReconciliationPanel/);
});
test("Database blocca overbooking, conserva review acconti e audit",()=>{
 const sql=read("../supabase/migrations/20261020_debox_multi_invoice_bank_allocations.sql");
 assert.match(sql,/drop constraint if exists financial_matches_user_id_transaction_id_key/);
 assert.match(sql,/create unique index if not exists financial_matches_invoice_transaction_unique/);
 assert.match(sql,/total_on_bank\+new\.allocated_amount > abs\(tx\.amount\)/);
 assert.match(sql,/total_on_invoice\+new\.allocated_amount > inv\.amount/);
 assert.match(sql,/for update/);
 assert.match(sql,/financial_transaction_reviews_owner/);
 assert.match(sql,/financial_match_audit_owner/);
 assert.match(sql,/public\.documio_confirm_bank_allocations/);
});
test("UI e report non confermano automaticamente",()=>{
 const ui=read("../app/controllo/BankReconciliationPanel.tsx");
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/p_matching_method:"reviewed_suggestion"/);
 assert.match(ui,/documio_confirm_bank_allocations/);
 assert.match(ui,/classification/);
 const rep=read("../lib/company-yearend.ts");
 assert.match(rep,/acconti_e_movimenti_da_verificare_/);
 assert.match(rep,/attribuzioni_fatture_confermate_/);
 for(const file of [
  "../app/controllo/page.tsx","../app/controllo/BankReconciliationPanel.tsx",
  "../app/api/finance/banks/route.ts",
  "../app/api/finance/chiusura/route.ts",
  "../lib/bank-allocations.ts",
 ]){
  const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,
   file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,file);
 }
});
