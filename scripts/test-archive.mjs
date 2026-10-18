import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function loadTS(path, mocks={}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 },
    reportDiagnostics:true,
  });
  const errors = (output.diagnostics ?? []).filter((d)=>
    d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,`TypeScript: ${path}`);
  const module={exports:{}};
  const resolve=(name)=>{
    if (Object.hasOwn(mocks,name)) return mocks[name];
    throw new Error("Modulo esterno inatteso: "+name);
  };
  new Function("module","exports","require","Buffer",output.outputText)(
    module,module.exports,resolve,Buffer);
  return module.exports;
}

const search = loadTS("../lib/document-search.ts");
const ai = loadTS("../lib/document-ai-worker.ts", {
  "@supabase/supabase-js": { createClient: ()=>({}) },
  "@/lib/owner-metering": { recordOpenAIUsage: async () => {} },
});
const docs = [
  {id:"bollo",title:"Bollo auto Lombardia 2026",file_name:"Bollo.pdf",category:"Veicoli",
    summary:"Tassa automobilistica",keywords:["ACI"],expiry_date:"2026-10-31"},
  {id:"medico",title:"Visita cardiologica",file_name:"visita.pdf",category:"Visite mediche",
    summary:"Appuntamento medico",keywords:[],expiry_date:"2026-11-01"},
  {id:"fattura",title:"Fattura energia 2026",file_name:"fattura.xml",category:"Bollette",
    summary:"Consumo elettrico",keywords:["fornitore"],expiry_date:"2026-10-20"},
];
const attachments = [
  {document_id:"fattura",title:"Ricevuta bonifico",file_name:"pagamento.pdf",
    notes:"quietanza ottobre",attachment_type:"Ricevuta"},
];
test("Ricerca trova il bollo con sinonimi e mai documenti inventati",()=>{
  assert.equal(search.searchDocuments("quando scade bollo auto",docs,attachments)[0],"bollo");
  assert.deepEqual(search.searchDocuments("nome cliente inesistente",docs,attachments),[]);
});
test("Ricerca include allegati in collegamento corretto",()=>{
  assert.equal(search.searchDocuments("quietanza ottobre",docs,attachments)[0],"fattura");
});
test("Ricerca normalizza accenti, evita query vuote e applica filtro anno",()=>{
  assert.equal(search.normalizeSearch("Énergia, Città!"),"energia citta");
  assert.deepEqual(search.searchDocuments("e la di",docs,attachments),[]);
  assert.deepEqual(search.searchDocuments("bollo auto 2025",docs,attachments),[]);
  assert.deepEqual(search.searchDocuments("fattura 2026",docs,attachments),["fattura"]);
});
test("Lavoratore AI accetta solo file con estensione e firma compatibili",()=>{
  const pdf=Buffer.from("%PDF-1.7\ncontent");
  const jpg=Buffer.from([255,216,255,10]);
  const png=Buffer.from([137,80,78,71,13,10,26,10,1]);
  assert.equal(ai.recognizeFile(pdf,"archivio.pdf"),"application/pdf");
  assert.equal(ai.recognizeFile(pdf,"documento.jpg"),null);
  assert.equal(ai.recognizeFile(jpg,"foto.jpeg"),"image/jpeg");
  assert.equal(ai.recognizeFile(png,"scan.png"),"image/png");
});
test("Date estratte vengono accettate solo se reali",()=>{
  assert.equal(ai.validDate("2026-10-15"),"2026-10-15");
  assert.equal(ai.validDate("2026-02-31"),null);
  assert.equal(ai.validDate("2026-13-01"),null);
  assert.equal(ai.validDate("niente"),null);
});
test("La coda e l'API richiedono proprietario, RLS e consenso esplicito",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261015_fast_document_ingest.sql",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/api/document-ai/trigger/route.ts",import.meta.url),"utf8");
  assert.match(sql,/row level security/);
  assert.match(sql,/for update of job skip locked/);
  assert.match(sql,/security definer/);
  assert.match(sql,/auth\.role\(\) <> 'service_role'/);
  assert.match(route,/auth\.getUser\(jwt\)/);
  assert.match(route,/\.eq\("user_id",user\.id\)/);
});
