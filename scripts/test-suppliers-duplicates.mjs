import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const text=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
function load(path,modules={}) {
  const compiled=ts.transpileModule(text(path),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
    reportDiagnostics:true,
  });
  assert.equal((compiled.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  new Function("module","exports","require",compiled.outputText)(
    module,module.exports,(name)=>{
      if(Object.hasOwn(modules,name))return modules[name];
      throw Error("Unknown import: "+name);
    },
  );
  return module.exports;
}
const fc=load("../lib/financial-control.ts");
const b=load("../lib/business-accounting.ts",{"./financial-control":fc});
const fingerprint=load("../lib/document-fingerprint.ts");

const supplier={id:"supplier-1",legal_name:"Cartiera Rossi S.R.L.",
  vat_number:"01234567890",default_category:"materie_prime"};

test("Materie prime pizza: cartone, carta e inchiostri",()=>{
  for(const description of [
    "Fogli in cartone ondulato kraft",
    "Bobina carta kraft",
    "Inchiostri per scatole pizza",
    "Testliner per produzione",
  ]){
    const found=b.classifyInvoice("expense","Fornitore","12345678901",description,[]);
    assert.equal(found.cost_category,"materie_prime",description);
    assert.equal(found.category_source,"description");
    assert.equal(found.category_status,"suggested");
  }
});
test("Leasing, affitti, trasporto e manutenzione hanno destinazioni distinte",()=>{
  const cases=[
    ["Rata leasing macchinario","leasing"],
    ["Canone affitto capannone","affitti_canoni"],
    ["Servizio trasporto pallet","trasporti"],
    ["Intervento manutenzione fustellatrice","manutenzioni"],
    ["Smaltimento rifiuti cartacei","da_verificare"],
  ];
  for(const [description,category] of cases) {
    const found=b.classifyInvoice("expense","Fornitore",null,description,[]);
    assert.equal(found.cost_category,category,description);
  }
});
test("Categoria fornitore approvata si riusa senza conferma per ogni fattura",()=>{
  const selected=b.classifyInvoice("expense","Cartiera Rossi SRL","IT01234567890","",[supplier]);
  assert.equal(selected.cost_category,"materie_prime");
  assert.equal(selected.category_source,"supplier");
  assert.equal(selected.category_status,"confirmed");
  assert.equal(selected.supplier_id,supplier.id);
  const explicit=b.classifyInvoice("expense","Cartiera Rossi SRL","01234567890",
    "Rata leasing macchina", [supplier]);
  assert.equal(explicit.cost_category,"leasing");
  assert.equal(explicit.category_source,"description");
  assert.equal(explicit.supplier_id,supplier.id);
});
test("Fornitori omonimi con diversa P.IVA non vengono mescolati",()=>{
  assert.equal(b.normalizeVat("IT01234567890"),"01234567890");
  assert.equal(b.findSupplierRule([supplier],"Cartiera Rossi SRL","99999999999"),null);
  const found=b.findSupplierRule([supplier],"Cartiera Rossi S.R.L.",null);
  assert.equal(found?.id,supplier.id);
});
test("Voci miste rimangono da verificare, non generano un conto fittizio",()=>{
  const found=b.classifyInvoice("expense","Cartiera Rossi SRL","01234567890",
    "Cartone ondulato e trasporto merce",[supplier]);
  assert.equal(found.cost_category,"da_verificare");
  assert.equal(found.category_status,"needs_review");
  assert.match(found.classification_reason,/diverse/);
});
test("Il controllo file usa SHA256, non filename",async()=>{
  const one=await fingerprint.fileSha256(new Blob(["abc"]));
  const two=await fingerprint.fileSha256(new Blob(["abc"]));
  const other=await fingerprint.fileSha256(new Blob(["abcd"]));
  assert.equal(one,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(one,two);
  assert.notEqual(one,other);
});
test("Il rilevamento duplicati è segregato per utente e azienda",()=>{
  const source=text("../lib/document-fingerprint.ts");
  assert.match(source,/\.eq\("user_id",owner\)/);
  assert.match(source,/\.eq\("file_sha256",sha\)/);
  assert.match(source,/query\.eq\("company_id",companyId\):query\.is\("company_id",null\)/);
  const upload=text("../app/carica/page.tsx");
  const single=text("../app/page.tsx");
  assert.match(upload,/findFileDuplicate\(supabase,owner,entry\.companyId,hash\)/);
  assert.match(upload,/duplicate_of:existing\?\.id\?\?null/);
  assert.match(upload,/Carica copia|Salva comunque una copia/);
  assert.match(single,/file_sha256: sha/);
  assert.match(single,/duplicate_of: duplicateOf/);
  const scan=text("../app/api/documents/backfill-hashes/route.ts");
  assert.match(scan,/auth\.getUser\(token\)/);
  assert.match(scan,/financial_companies/);
  assert.match(scan,/MAX_FILES_PER_REQUEST=8/);
});
test("Una categoria per fornitore aggiorna anche lo storico senza toccare i dati economici",()=>{
  const supplierManager=text("../app/controllo/SupplierManager.tsx");
  const ddl=text("../supabase/migrations/20261016_document_sha_suppliers.sql");
  assert.match(supplierManager,/documio_apply_supplier_category/);
  assert.match(supplierManager,/p_include_manual:force/);
  assert.match(ddl,/financial_suppliers_owner/);
  assert.match(ddl,/foreign key \(supplier_id,user_id,company_id\)/);
  assert.match(ddl,/inv\.direction='expense'/);
  assert.match(ddl,/category_source not in \('manual','description'\)/);
  assert.match(ddl,/file_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
});
test("Interfacce TSX aggiornate senza errori di sintassi",()=>{
  for(const path of [
    "../app/controllo/SupplierManager.tsx",
    "../app/controllo/page.tsx",
    "../app/carica/page.tsx",
    "../app/page.tsx",
  ]) {
    const src=ts.createSourceFile(path,text(path),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
    assert.equal(src.parseDiagnostics.length,0,path);
  }
});
