// Ricerca locale deterministica e veloce: non espone dati al modello e
// non puo' inventare documenti inesistenti.
export type SearchableDocument = {
  id: string;
  title: string | null;
  file_name: string | null;
  summary: string | null;
  category: string | null;
  keywords: string[] | null;
  expiry_date: string | null;
};
export type SearchableAttachment = {
  document_id: string;
  title: string | null;
  file_name: string | null;
  notes: string | null;
  attachment_type: string | null;
};

export function normalizeSearch(value: unknown): string {
  return String(value ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOP = new Set([
  "a","ad","al","alla","alle","con","che","cosa","del","della","di","e","ed",
  "ho","i","il","in","io","la","le","lo","mi","mia","mie","mio","nei",
  "nel","nella","per","quale","quali","su","tra","un","una","uno","vorrei",
  "dammi","fammi","cerca","cercami","trova","trovami","mostra","mostrami",
  "the","my","me","please","find","show","for","and","documents","documenti",
]);

const RELATED: Record<string,string[]> = {
  bollo: ["tassa automobilistica","aci","bollo auto"],
  multa: ["verbale","sanzione","infrazione"],
  assicurazione: ["polizza","rca","rc auto"],
  polizza: ["assicurazione"],
  bolletta: ["utenze","gas","luce","elettricita"],
  fattura: ["invoice","numero fattura"],
  ricevuta: ["quietanza","pagamento","scontrino"],
  contratto: ["accordo","locazione"],
  mutuo: ["prestito","finanziamento","rata"],
  auto: ["veicolo","automobile","targa"],
  casa: ["immobile","abitazione","rogito"],
  stipendio: ["busta paga","cedolino"],
  codice: ["codice fiscale"],
};

export function searchDocuments(
  question: string,
  documents: SearchableDocument[],
  attachments: SearchableAttachment[],
  maxResults = 150,
): string[] {
  const query = normalizeSearch(question).slice(0, 250);
  const terms = [...new Set(query.split(" ")
    .filter((part) => part.length >= 2 && !STOP.has(part)))].slice(0, 15);
  if (!terms.length) return [];
  const byDocument = new Map<string,string[]>();
  for (const attached of attachments) {
    const collection = byDocument.get(attached.document_id) ?? [];
    collection.push(normalizeSearch(
      [attached.title,attached.file_name,attached.notes,attached.attachment_type].join(" "),
    ));
    byDocument.set(attached.document_id, collection);
  }
  const ranked = documents.map((doc) => {
    const title = normalizeSearch(doc.title);
    const filename = normalizeSearch(doc.file_name);
    const category = normalizeSearch(doc.category);
    const summary = normalizeSearch(doc.summary);
    const keywords = normalizeSearch((doc.keywords ?? []).join(" "));
    const supplements = (byDocument.get(doc.id) ?? []).join(" ");
    const fields = [title,filename,category,summary,keywords,supplements];
    let score = 0;
    let uniqueHits = 0;
    let nonDateHits = 0;
    if (query.length >= 4 && title.includes(query)) score += 38;
    if (query.length >= 4 && filename.includes(query)) score += 25;
    for (const term of terms) {
      let best = 0;
      const related = [term,...(RELATED[term]??[])].map(normalizeSearch);
      for (let i=0;i<fields.length;i++) {
        if (related.some((word) => fields[i].includes(word))) {
          best = Math.max(best,[16,12,10,5,11,9][i]);
        }
      }
      if (best>0) {
        uniqueHits++;
        if (!/^(19|20)\d\d$/.test(term)) nonDateHits++;
      }
      score += best;
    }
    if (uniqueHits === terms.length) score += 15;
    // L'anno da solo non basta per far comparire documenti irrilevanti.
    if (terms.some((term) => !/^(19|20)\d\d$/.test(term)) && nonDateHits === 0)
      score = 0;
    const yearTerms = terms.filter((t)=>/^(19|20)\d\d$/.test(t));
    if (yearTerms.length &&
      !yearTerms.some((year)=>fields.some((field)=>field.includes(year)) ||
        String(doc.expiry_date||"").includes(year))) {
      score = 0;
    }
    return { id:doc.id, score, uniqueHits };
  });
  return ranked.filter((item) => item.score>0)
    .sort((a,b)=>b.score-a.score || b.uniqueHits-a.uniqueHits || a.id.localeCompare(b.id))
    .slice(0,Math.min(150,Math.max(1,maxResults)))
    .map((item)=>item.id);
}
