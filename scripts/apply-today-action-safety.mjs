import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filePath = path.join(root, "app", "TodayActionCenter.tsx");
let source = await readFile(filePath, "utf8");

const marker = `function isAppointment(document: DocumentRow) {
  return ["Appuntamenti", "Visite mediche"].includes(document.category);
}`;

const replacement = `function isAppointment(document: DocumentRow) {
  return ["Appuntamenti", "Visite mediche"].includes(document.category);
}

function normalizedDocumentText(document: DocumentRow) {
  return \`${'${document.title} ${document.category}'}\`
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase();
}

function isInformationalDocument(document: DocumentRow) {
  const text = normalizedDocumentText(document);
  return [
    "comunicazione di avvenuto ricevimento",
    "comunicazione unica",
    "esito evasione protocollo",
    "certificato attribuzione partita iva",
    "ricevuta protocollo",
    "esito pratica",
    "conferma ricezione",
  ].some((term) => text.includes(term));
}

function isPayableDocument(document: DocumentRow) {
  if (isAppointment(document) || isInformationalDocument(document)) return false;
  const text = normalizedDocumentText(document);
  const hasFinancialData = Boolean(
    Number(document.total_amount) > 0 ||
      Number(document.remaining_amount) > 0 ||
      Number(document.installment_amount) > 0 ||
      Number(document.installment_count) > 0 ||
      document.is_financing,
  );
  const hasPaymentLanguage = [
    "fattura",
    "bolletta",
    "rata",
    "pagamento",
    "canone",
    "multa",
    "tari",
    "imu",
    "f24",
    "premio assicurativo",
  ].some((term) => text.includes(term));
  return hasFinancialData || hasPaymentLanguage;
}

function hasActionableDeadline(document: DocumentRow) {
  if (isInformationalDocument(document)) return false;
  if (isAppointment(document) || isPayableDocument(document)) return true;
  const text = normalizedDocumentText(document);
  return [
    "scadenza",
    "rinnovo",
    "assicurazione",
    "polizza",
    "contratto",
    "patente",
    "passaporto",
    "carta identita",
    "revisione",
  ].some((term) => text.includes(term));
}`;

if (!source.includes("function isInformationalDocument") && source.includes(marker)) {
  source = source.replace(marker, replacement);
}

source = source.replace(
  '      const status = document.payment_status ?? "Da pagare";',
  '      const status = document.payment_status ?? "";\n      const payable = isPayableDocument(document);\n      const actionableDeadline = hasActionableDeadline(document);',
);

source = source.replace(
  '      if (dueDate && !["Pagato", "Contestato"].includes(status) && !document.appointment_completed_at) {',
  '      if (dueDate && actionableDeadline && !["Pagato", "Contestato"].includes(status) && !document.appointment_completed_at) {',
);

source = source.replace(
  '            canMarkPaid: !appointment && !document.is_financing,',
  '            canMarkPaid: payable && !appointment && !document.is_financing,',
);

source = source.replace(
  '      if (paid && !proofByDocument.has(document.id)) {',
  '      if (paid && payable && !proofByDocument.has(document.id)) {',
);

await writeFile(filePath, source, "utf8");
console.log("Applied Today action safety rules.");
