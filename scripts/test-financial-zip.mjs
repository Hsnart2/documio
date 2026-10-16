import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { zipSync, strToU8 } from "fflate";

const require=createRequire(import.meta.url);
const text=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
function loadTypeScript(path) {
  const source=text(path);
  const code=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    reportDiagnostics:true,
  });
  assert.equal((code.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  new Function("module","exports","require",code.outputText)(module,module.exports,require);
  return module.exports;
}
const zipApi=loadTypeScript("../lib/financial-zip.ts");
const finance=loadTypeScript("../lib/financial-control.ts");
const makeZip=(data)=>new File([zipSync(Object.fromEntries(Object.entries(data)
  .map(([key,value])=>[key,typeof value==="string"?strToU8(value):value]))).buffer],
  "export-fatture.zip",{type:"application/zip"});

test("ZIP misto: XML dentro sottocartelle, .p7m e file non pertinenti",async()=>{
  const zip=makeZip({
    "acquisti/ricevuta.xml":"<FatturaElettronica>A</FatturaElettronica>",
    "emesse/vendita.XML":"<FatturaElettronica>B</FatturaElettronica>",
    "firmati/ricevuta.xml.p7m":new Uint8Array([1,2,3]),
    "README.txt":"Non è una fattura",
    "__MACOSX/._note.xml":"metadata",
  });
  const result=await zipApi.extractInvoiceXmlZip(zip);
  assert.equal(result.files.length,2);
  assert.deepEqual(result.files.map(f=>f.name).sort(),["ricevuta.xml","vendita.XML"]);
  assert.equal(result.totalXml,2);
  assert.equal(result.signedP7m,1);
  assert.equal(result.skipped,1);
  assert.equal(result.tooLarge,0);
  assert.equal(await result.files[1].text(),"<FatturaElettronica>B</FatturaElettronica>");
});

test("Rifiuta file falsi ZIP, eccessivi o con estensione non ammessa",async()=>{
  await assert.rejects(zipApi.extractInvoiceXmlZip(
    new File([strToU8("not a zip")],"a.zip")) , /ZIP non valido/i);
  await assert.rejects(zipApi.extractInvoiceXmlZip(
    new File([strToU8("not a zip")],"a.txt")) , /ZIP di fatture/i);
  await assert.rejects(zipApi.extractInvoiceXmlZip(
    new File([new Uint8Array(zipApi.MAX_ZIP_BYTES+1)],"a.zip")),/fino a 30 MB/);
});

test("ZIP evita decompressione di XML eccessivi e limita il numero file",async()=>{
  const large=makeZip({"oversize.xml":new Uint8Array(zipApi.MAX_XML_BYTES+1)});
  const result=await zipApi.extractInvoiceXmlZip(large);
  assert.equal(result.files.length,0);
  assert.equal(result.tooLarge,1);
  const objects={};
  for(let i=0;i<zipApi.MAX_ZIP_INVOICES+3;i++)
    objects["fatture/"+String(i).padStart(4,"0")+".xml"]="test";
  const many=await zipApi.extractInvoiceXmlZip(makeZip(objects));
  assert.equal(many.files.length,zipApi.MAX_ZIP_INVOICES);
  assert.equal(many.totalXml,zipApi.MAX_ZIP_INVOICES+3);
  assert.equal(many.limited,true);
  assert.equal(many.skipped,3);
});

function node(localName,textContent="",children=[]) {
  return {
    localName,textContent,children,
    getElementsByTagName(tag) {
      const walk=(current)=>current.children.flatMap(child=>[child,...walk(child)]);
      return walk(this).filter(child=>tag==="*"||child.localName===tag);
    },
  };
}
function fakeInvoice(sellerVat,buyerVat) {
  return node("FatturaElettronica","",[
    node("FatturaElettronicaHeader","",[
      node("CedentePrestatore","",[node("IdCodice",sellerVat)]),
      node("CessionarioCommittente","",[node("IdCodice",buyerVat)]),
    ]),
  ]);
}
test("Verso fattura dal proprietario: ricevuta/emessa e casi ambigui",()=>{
  const previous=globalThis.DOMParser;
  try {
    let data=fakeInvoice("01234567890","12345678901");
    globalThis.DOMParser=class {
      parseFromString() {
        return {documentElement:data,getElementsByTagName:(tag)=>data.getElementsByTagName(tag)};
      }
    };
    assert.equal(finance.detectFatturaPaDirection("xml","IT01234567890"),"income");
    assert.equal(finance.detectFatturaPaDirection("xml","12345678901"),"expense");
    assert.throws(()=>finance.detectFatturaPaDirection("xml","98765432100"),/stabilire/);
    data=fakeInvoice("01234567890","01234567890");
    assert.throws(()=>finance.detectFatturaPaDirection("xml","01234567890"),/stabilire/);
  } finally {
    if(previous===undefined)delete globalThis.DOMParser;
    else globalThis.DOMParser=previous;
  }
});

test("Importazione ZIP resta aziendale, conserva XML e non contabilizza automaticamente",()=>{
  const page=text("../app/controllo/page.tsx");
  assert.match(page,/detectFatturaPaDirection\(xml,currentCompany\.vat_number\)/);
  assert.match(page,/saveInvoiceXml\(invoice,direction,xml\)/);
  assert.match(page,/company_id:companyId/);
  assert.match(page,/onConflict:"user_id,import_key"/);
  assert.match(page,/storage\.from\("documents"\)\.upload/);
  assert.match(page,/zipProgress/);
  assert.match(page,/\.p7m/);
  const pack=JSON.parse(text("../package.json"));
  const lock=JSON.parse(text("../package-lock.json"));
  assert.equal(pack.dependencies.fflate,"0.8.3");
  assert.equal(lock.packages["node_modules/fflate"].version,"0.8.3");
});
