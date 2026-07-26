import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filePath = path.join(root, "app", "TodayActionCenter.tsx");
let source = await readFile(filePath, "utf8");

source = source.replace(
  "  paid_installments: number | null;\n};",
  "  paid_installments: number | null;\n  summary: string | null;\n};",
);

source = source.replace(
  'kind: "overdue" | "today" | "soon" | "receipt" | "payment";',
  'kind: "overdue" | "today" | "soon" | "receipt" | "payment" | "payment_detected";',
);

source = source.replace(
  '.select("id,title,category,storage_path,expiry_date,appointment_time,appointment_completed_at,payment_status,total_amount,paid_amount,remaining_amount,installment_count,installment_amount,first_installment_date,is_financing,paid_installments")',
  '.select("id,title,category,storage_path,expiry_date,appointment_time,appointment_completed_at,payment_status,total_amount,paid_amount,remaining_amount,installment_count,installment_amount,first_installment_date,is_financing,paid_installments,summary")',
);

const functionMarker = `function isAppointment(document: DocumentRow) {
  return ["Appuntamenti", "Visite mediche"].includes(document.category);
}`;
const functionReplacement = `${functionMarker}

function hasStrongPaymentEvidence(document: DocumentRow) {
  const text = \`${'${document.title} ${document.summary ?? ""}'}\`
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase();
  const positive = [
    "pagato con carta",
    "pagamento effettuato",
    "pagamento completato",
    "pagamento ricevuto",
    "transazione completata",
    "addebito effettuato",
    "saldo effettuato",
    "importo pagato",
    "risulta pagato",
  ].some((term) => text.includes(term));
  const negative = [
    "da pagare",
    "pagamento non riuscito",
    "pagamento rifiutato",
    "pagamento in sospeso",
    "mancato pagamento",
  ].some((term) => text.includes(term));
  return positive && !negative;
}`;
if (!source.includes("function hasStrongPaymentEvidence") && source.includes(functionMarker)) {
  source = source.replace(functionMarker, functionReplacement);
}

source = source.replace(
  "      const paid = status === \"Pagato\";",
  "      const paid = status === \"Pagato\";\n      const paymentDetected = !paid && payable && hasStrongPaymentEvidence(document);",
);

const receiptMarker = `      if (paid && payable && !proofByDocument.has(document.id)) {`;
const detectedBlock = `      if (paymentDetected) {
        result.push({
          id: \`payment-detected:\${document.id}\`,
          documentId: document.id,
          kind: "payment_detected",
          title: document.title,
          detail: "Nel documento ho trovato una conferma chiara di pagamento. Verifica e conferma con un tocco.",
          priority: 82,
          canMarkPaid: true,
        });
      }

${receiptMarker}`;
if (!source.includes("payment-detected:") && source.includes(receiptMarker)) {
  source = source.replace(receiptMarker, detectedBlock);
}

source = source.replace(
  '              : action.kind === "payment"\n                   ? WalletCards',
  '              : action.kind === "payment" || action.kind === "payment_detected"\n                   ? WalletCards',
);

source = source.replace(
  `{workingId === action.id ? <Loader2 size={16} /> : <Check size={16} />} Segna pagato`,
  `{workingId === action.id ? <Loader2 size={16} /> : <Check size={16} />} {action.kind === "payment_detected" ? "Conferma pagato" : "Segna pagato"}`,
);

source = source.replace(
  `                  <button type="button" onClick={() => void openDocument(action.documentId)}>
                    {action.kind === "receipt" ? <FileSearch size={16} /> : <ArrowRight size={16} />}
                    {action.kind === "receipt" ? "Controlla ricevuta" : "Apri"}
                  </button>`,
  `                  <button type="button" onClick={() => {
                    if (action.kind === "receipt") {
                      const row = documents.find((item) => item.id === action.documentId);
                      localStorage.setItem("documio-email-receipt-search", JSON.stringify({
                        documentId: action.documentId,
                        title: row?.title ?? action.title,
                        amount: row?.total_amount ?? row?.paid_amount ?? null,
                      }));
                      window.location.href = "/email?mode=receipt-search";
                      return;
                    }
                    void openDocument(action.documentId);
                  }}>
                    {action.kind === "receipt" ? <FileSearch size={16} /> : <ArrowRight size={16} />}
                    {action.kind === "receipt" ? "Cerca ricevuta in Gmail" : "Apri"}
                  </button>`,
);

await writeFile(filePath, source, "utf8");
console.log("Applied intelligent payment detection.");
