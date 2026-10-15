import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Esegue le funzioni pure TypeScript senza connettersi a banche, Supabase o AI.
const source = readFileSync(new URL("../lib/financial-control.ts", import.meta.url), "utf8");
const result = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
const severe = (result.diagnostics ?? []).filter((d) =>
  d.category === ts.DiagnosticCategory.Error);
assert.equal(severe.length, 0, "Errore di sintassi nel parser finanziario");
const moduleShim = { exports: {} };
new Function("module", "exports", result.outputText)(moduleShim, moduleShim.exports);
const api = moduleShim.exports;

test("Date italiane e ISO non accettano giorni impossibili", () => {
  assert.equal(api.dateIso("15/10/2026"), "2026-10-15");
  assert.equal(api.dateIso("2026-1-5"), "2026-01-05");
  assert.equal(api.dateIso("31/02/2026"), null);
  assert.equal(api.dateIso("not-a-date"), null);
});

test("Valori monetari italiani ed esteri sono normalizzati ai centesimi", () => {
  assert.equal(api.decimal("€ 1.234,56"), 1234.56);
  assert.equal(api.decimal("-1,99"), -1.99);
  assert.equal(api.decimal("1,234.56"), 1234.56);
  assert.equal(api.decimal("??"), null);
});

test("CSV bancario italiano importa entrate e uscite, ignorando i saldi", () => {
  const csv = [
    "Data;Importo;Descrizione;Controparte;Saldo",
    '15/10/2026;"1.240,50";Incasso fattura 12;Cliente A;99999',
    '14/10/2026;"-250,00";Canone;Fornitore B;99800',
    "31/02/2026;4,50;Data non valida;X;0",
  ].join("\r\n");
  const result = api.parseBankCsv(csv);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rejected, 1);
  assert.equal(result.rows[0].booking_date, "2026-10-15");
  assert.equal(result.rows[0].amount, 1240.5);
  assert.equal(result.rows[1].amount, -250);
});

test("CSV con entrate/uscite separate e valuta esplicita", () => {
  const csv = [
    "Data,Entrate,Uscite,Descrizione,Divisa",
    "2026-10-13,100.00,0,Transfer,EUR",
    "2026-10-12,0,25.50,Monthly fee,EUR",
    "2026-10-12,0,17.00,Charge,USD",
  ].join("\n");
  const parsed = api.parseBankCsv(csv);
  assert.deepEqual(parsed.rows.map((r) => [r.amount, r.currency]), [
    [100,"EUR"],[-25.5,"EUR"],[-17,"USD"],
  ]);
});

test("La riconciliazione non tratta un pagamento non registrato come saldato", () => {
  const mock = { id: "i1", currency: "EUR", direction: "income", amount: 1250,
    due_date: "2026-10-15", issue_date:"2026-10-01", counterparty: "Rossi SRL" };
  const movement = { amount: 1250, currency:"EUR", description:"Fattura 10 Rossi",
    counterparty:"Rossi SRL", booking_date:"2026-10-15" };
  assert.ok(api.matchScore(mock, movement) >= 95);
  assert.equal(api.matchScore(mock, { ...movement, amount: -1250 }), -1);
  assert.equal(api.matchScore(mock, { ...movement, currency: "USD" }), -1);
  assert.equal(api.paidFor("i1", []), 0);
  assert.equal(api.paidFor("i1", [{invoice_id:"i1",allocated_amount:500}]), 500);
});
