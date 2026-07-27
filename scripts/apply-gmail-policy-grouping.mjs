import { readFile, writeFile } from "node:fs/promises";

const routePath = new URL("../app/api/email/gmail/import/route.ts", import.meta.url);
let source = await readFile(routePath, "utf8");

const marker = "DOCUMIO_POLICY_GROUPING_V1";

if (!source.includes(marker)) {
  const helperAnchor = "async function refreshAccessToken(refreshToken: string) {";
  if (!source.includes(helperAnchor)) {
    throw new Error("Gmail import helper anchor not found.");
  }

  const helpers = `// ${marker}\ntype GmailCandidateDocument = {\n  id: string;\n  title?: string | null;\n  summary?: string | null;\n  keywords?: unknown;\n  category?: string | null;\n  totalAmount?: number | null;\n  installmentCount?: number | null;\n};\n\ntype InsuranceDocumentRow = GmailCandidateDocument & {\n  practice_id?: string | null;\n  file_name?: string | null;\n  storage_path?: string | null;\n  uploaded_at?: string | null;\n  expiry_date?: string | null;\n  paid_at?: string | null;\n  paid_amount?: number | null;\n  payment_method?: string | null;\n  total_amount?: number | null;\n  remaining_amount?: number | null;\n  last_payment_date?: string | null;\n};\n\nfunction textValue(value: unknown) {\n  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join(" ");\n  return String(value ?? "");\n}\n\nfunction insuranceDocumentText(document: Partial<GmailCandidateDocument> & { file_name?: string | null }) {\n  return [document.title, document.summary, textValue(document.keywords), document.category, document.file_name]\n    .filter(Boolean)\n    .join(" ");\n}\n\nfunction policyReferences(document: Partial<GmailCandidateDocument> & { file_name?: string | null }) {\n  const text = insuranceDocumentText(document);\n  const references = new Set<string>();\n  const expression = /(?:polizza|policy)(?:\\s+auto)?\\s*(?:n(?:umero)?[.°º:]?\\s*)?([0-9]{6,18})/gi;\n  for (const match of text.matchAll(expression)) {\n    const reference = String(match[1] ?? "").replace(/\\D/g, "");\n    if (reference.length >= 6) references.add(reference);\n  }\n  return [...references];\n}\n\nfunction isInsuranceDocument(document: Partial<GmailCandidateDocument> & { file_name?: string | null }) {\n  const text = insuranceDocumentText(document).toLowerCase();\n  return String(document.category ?? "").toLowerCase() === "assicurazioni" || /\\b(polizza|allianz|assicurazion)/i.test(text);\n}\n\nfunction policyMainScore(document: Partial<GmailCandidateDocument> & { file_name?: string | null }) {\n  const title = String(document.title ?? "").toLowerCase();\n  const text = insuranceDocumentText(document).toLowerCase();\n  let score = 0;\n  if (String(document.category ?? "").toLowerCase() === "assicurazioni") score += 10;\n  if (/^polizza\\b/.test(title)) score += 80;\n  if (/certificato di assicurazione|contratto di assicurazione|scheda di polizza|polizza auto/.test(text)) score += 55;\n  if (/decorrenza|scadenza|copertur|contraente|veicolo|premio/.test(text)) score += 15;\n  if (/quietanza|ricevuta|conferma pagamento/.test(title)) score -= 10;\n  if (/precontrattuale|\\bmup\\b|allegato|informativa|privacy|set informativo|fascicolo|condizioni|scegli il meglio|modulo unico/.test(title)) score -= 55;\n  return score;\n}\n\nfunction findExactPolicyCandidate(analysis: AnalysisResult, candidates: GmailCandidateDocument[]) {\n  const references = new Set(policyReferences(analysis));\n  if (!references.size) return null;\n  const matches = candidates\n    .filter((candidate) => isInsuranceDocument(candidate))\n    .filter((candidate) => policyReferences(candidate).some((reference) => references.has(reference)))\n    .sort((left, right) => policyMainScore(right) - policyMainScore(left));\n  const best = matches[0];\n  if (!best) return null;\n  if (policyMainScore(analysis) > policyMainScore(best) + 20) return null;\n  return best.id;\n}\n\nfunction attachmentTypeFromTitle(title: string | null | undefined) {\n  const value = String(title ?? "").toLowerCase();\n  if (/quietanza/.test(value)) return "Quietanza";\n  if (/ricevuta/.test(value)) return "Ricevuta";\n  if (/pagamento/.test(value)) return "Pagamento";\n  if (/sollecito/.test(value)) return "Sollecito";\n  return "Comunicazione";\n}\n\nasync function consolidateExistingInsuranceDocuments(\n  admin: ReturnType<typeof createClient>,\n  userId: string,\n) {\n  const { data, error } = await admin\n    .from("documents")\n    .select("id,practice_id,title,summary,keywords,category,file_name,storage_path,uploaded_at,expiry_date,paid_at,paid_amount,payment_method,total_amount,remaining_amount,last_payment_date")\n    .eq("user_id", userId)\n    .order("uploaded_at", { ascending: true, nullsFirst: false })\n    .limit(240);\n\n  if (error || !data?.length) return 0;\n\n  const groups = new Map<string, InsuranceDocumentRow[]>();\n  for (const row of data as InsuranceDocumentRow[]) {\n    if (!isInsuranceDocument(row)) continue;\n    const reference = policyReferences(row)[0];\n    if (!reference) continue;\n    groups.set(reference, [...(groups.get(reference) ?? []), row]);\n  }\n\n  let consolidated = 0;\n  for (const [reference, rows] of groups) {\n    const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());\n    if (uniqueRows.length < 2) continue;\n\n    const root = [...uniqueRows].sort((left, right) => {\n      const scoreDifference = policyMainScore(right) - policyMainScore(left);\n      if (scoreDifference) return scoreDifference;\n      return String(left.uploaded_at ?? "").localeCompare(String(right.uploaded_at ?? ""));\n    })[0];\n\n    for (const child of uniqueRows) {\n      if (child.id === root.id || !child.storage_path || !child.file_name) continue;\n\n      const { data: existingAttachment, error: existingAttachmentError } = await admin\n        .from("document_attachments")\n        .select("id,document_id")\n        .eq("user_id", userId)\n        .eq("storage_path", child.storage_path)\n        .maybeSingle();\n      if (existingAttachmentError) continue;\n\n      if (existingAttachment) {\n        const { error: moveExistingError } = await admin\n          .from("document_attachments")\n          .update({ document_id: root.id })\n          .eq("id", existingAttachment.id)\n          .eq("user_id", userId);\n        if (moveExistingError) continue;\n      } else {\n        const { error: insertAttachmentError } = await admin\n          .from("document_attachments")\n          .insert({\n            user_id: userId,\n            document_id: root.id,\n            title: child.title || child.file_name,\n            attachment_type: attachmentTypeFromTitle(child.title),\n            file_name: child.file_name,\n            storage_path: child.storage_path,\n            payment_date: child.paid_at ?? child.last_payment_date ?? null,\n            amount: child.paid_amount ?? null,\n            payment_method: child.payment_method ?? null,\n            notes: \`Documento collegato automaticamente alla polizza n.\${reference}.\`,\n          });\n        if (insertAttachmentError) continue;\n      }\n\n      const { error: moveChildrenError } = await admin\n        .from("document_attachments")\n        .update({ document_id: root.id })\n        .eq("user_id", userId)\n        .eq("document_id", child.id);\n      if (moveChildrenError) continue;\n\n      if (!root.practice_id && child.practice_id) {\n        await admin\n          .from("documents")\n          .update({ practice_id: child.practice_id })\n          .eq("id", root.id)\n          .eq("user_id", userId);\n        root.practice_id = child.practice_id;\n      }\n\n      const rootUpdates: Record<string, unknown> = {};\n      if (!root.expiry_date && child.expiry_date) rootUpdates.expiry_date = child.expiry_date;\n      if (root.total_amount == null && child.total_amount != null) rootUpdates.total_amount = child.total_amount;\n      if (root.remaining_amount == null && child.remaining_amount != null) rootUpdates.remaining_amount = child.remaining_amount;\n      if (Object.keys(rootUpdates).length) {\n        await admin.from("documents").update(rootUpdates).eq("id", root.id).eq("user_id", userId);\n        Object.assign(root, rootUpdates);\n      }\n\n      const { error: deleteChildError } = await admin\n        .from("documents")\n        .delete()\n        .eq("id", child.id)\n        .eq("user_id", userId);\n      if (!deleteChildError) consolidated += 1;\n    }\n  }\n\n  return consolidated;\n}\n\n`;

  source = source.replace(helperAnchor, helpers + helperAnchor);

  const candidateAnchor = `    const { data: candidateRows } = await admin\n      .from("documents")`;
  if (!source.includes(candidateAnchor)) {
    throw new Error("Candidate document query anchor not found.");
  }
  source = source.replace(
    candidateAnchor,
    `    let regroupedDocuments = await consolidateExistingInsuranceDocuments(admin, user.id);\n\n${candidateAnchor}`,
  );

  source = source.replace(
    "    const candidateDocuments = (candidateRows ?? []).map((item) => ({",
    "    let candidateDocuments: GmailCandidateDocument[] = (candidateRows ?? []).map((item) => ({",
  );

  const canLinkBlock = `        const canLink =\n          analysis.isAttachment === true &&\n          Boolean(analysis.suggestedDocumentId) &&\n          Number(analysis.matchConfidence ?? 0) >= 85;`;
  if (!source.includes(canLinkBlock)) {
    throw new Error("Gmail attachment linking block not found.");
  }
  source = source.replace(
    canLinkBlock,
    `        const exactPolicyDocumentId = findExactPolicyCandidate(analysis, candidateDocuments);\n        const linkedDocumentId = exactPolicyDocumentId ?? analysis.suggestedDocumentId ?? null;\n        const canLink =\n          Boolean(linkedDocumentId) &&\n          (Boolean(exactPolicyDocumentId) ||\n            (analysis.isAttachment === true && Number(analysis.matchConfidence ?? 0) >= 85));`,
  );

  source = source.replace(
    "              document_id: analysis.suggestedDocumentId,",
    "              document_id: linkedDocumentId,",
  );

  const insertAnchor = `        const { error: insertDocumentError } = await admin.from("documents").insert({`;
  if (!source.includes(insertAnchor)) {
    throw new Error("Standalone Gmail document insert anchor not found.");
  }
  source = source.replace(
    insertAnchor,
    `        const { data: insertedDocument, error: insertDocumentError } = await admin\n          .from("documents")\n          .insert({`,
  );

  const insertEndAnchor = `          payment_progress_confirmed: isStandaloneReceipt,\n        });`;
  if (!source.includes(insertEndAnchor)) {
    throw new Error("Standalone Gmail document insert ending not found.");
  }
  source = source.replace(
    insertEndAnchor,
    `          payment_progress_confirmed: isStandaloneReceipt,\n        })\n          .select("id")\n          .single();`,
  );

  const successAnchor = `        importedDocuments += 1;`;
  if (!source.includes(successAnchor)) {
    throw new Error("Gmail document success anchor not found.");
  }
  source = source.replace(
    successAnchor,
    `        if (insertedDocument?.id) {\n          candidateDocuments = [\n            {\n              id: insertedDocument.id,\n              title: analysis.title || subject || originalName,\n              summary: analysis.summary || \`Documento importato automaticamente dall'email “\${subject}”.\`,\n              keywords: commonKeywords,\n              category: analysis.category || "Altro",\n              totalAmount,\n              installmentCount: analysis.installmentCount ?? null,\n            },\n            ...candidateDocuments,\n          ].slice(0, 60);\n        }\n        importedDocuments += 1;`,
  );

  const returnAnchor = `    return NextResponse.json({\n      importedDocuments,`;
  if (!source.includes(returnAnchor)) {
    throw new Error("Gmail import response anchor not found.");
  }
  source = source.replace(
    returnAnchor,
    `    regroupedDocuments += await consolidateExistingInsuranceDocuments(admin, user.id);\n\n    return NextResponse.json({\n      importedDocuments,\n      regroupedDocuments,`,
  );
}

await writeFile(routePath, source);
console.log("Applied Gmail policy grouping and attachment consolidation.");
