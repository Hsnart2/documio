import type { CaseType } from "@/lib/professional-workflows";

export type RequirementTemplate={code:string;label:string;mandatory:boolean};
const item=(code:string,label:string,mandatory=true):RequirementTemplate=>({code,label,mandatory});

/** Promemoria documentali generici; ogni obbligo effettivo richiede fonte,
 * periodo e verifica del soggetto abilitato. Non inviare moduli automaticamente.
 */
const DATA:Record<CaseType,RequirementTemplate[]>={
 "730":[
  item("identita","Documento di identità, codice fiscale e titolo a presentare la pratica"),
  item("cu","Certificazioni Uniche relative all'anno fiscale da dichiarare"),
  item("redditi","Altre certificazioni e documenti relativi ai redditi"),
  item("familiari","Dati e verifiche su familiari e soggetti fiscalmente rilevanti"),
  item("oneri","Documenti degli oneri deducibili o detraibili, se pertinenti"),
  item("immobili","Titoli immobiliari e documenti di locazione, se pertinenti",false),
  item("acconti","F24, acconti o altre quietanze pertinenti",false),
  item("delega","Delega e documentazione richiesta dal soggetto abilitato"),
 ],
 isee:[
  item("identita","Identità del dichiarante e dati del nucleo"),
  item("redditi","Certificazioni reddituali per il periodo ISEE applicabile"),
  item("patrimoni","Saldo e giacenza media di conti/rapporti patrimoniali per il periodo applicabile"),
  item("immobili","Patrimonio immobiliare e documenti pertinenti, se presenti",false),
  item("casa","Informazioni sull'abitazione ed eventuale contratto di locazione",false),
  item("nucleo","Eventuali situazioni particolari del nucleo da verificare",false),
  item("autodich","Verifica delle informazioni autodichiarate della DSU"),
 ],
 redditi:[
  item("identita","Identità e delega del contribuente"),
  item("redditi","Certificazioni dei redditi"),
  item("oneri","Documentazione dei costi e oneri rilevanti"),
  item("acconti","Acconti e versamenti effettuati",false),
  item("revision","Controllo professionale delle istruzioni per il periodo"),
 ],
 red:[
  item("richiesta","Comunicazione e tipologia RED richiesta"),
  item("redditi","Documentazione dei redditi pertinenti"),
  item("periodo","Verifica del periodo e dei soggetti interessati"),
  item("deleghe","Deleghe e autorizzazioni richieste dall'intermediario"),
 ],
 bonus:[
  item("domanda","Domanda e tipo di agevolazione richiesta"),
  item("requisiti","Requisiti e condizioni da verificare sul portale dell'ente"),
  item("documenti","Documentazione reddituale e familiare, se richiesta",false),
  item("delega","Titolo e delega dell'operatore, quando necessari"),
  item("esito","Prova del deposito o provvedimento, se disponibile",false),
 ],
 pensioni:[
  item("domanda","Tipologia della prestazione pensionistica richiesta"),
  item("contributi","Estratto conto contributivo e verifica delle posizioni"),
  item("periodi","Periodi lavorativi e contributivi da approfondire"),
  item("delega","Autorizzazione e delega al patronato o soggetto abilitato"),
  item("esito","Esito e comunicazioni dell'ente, se disponibili",false),
 ],
 successione:[
  item("decesso","Documentazione relativa al decesso e dati identificativi"),
  item("eredi","Documentazione degli aventi diritto ed eventuali deleghe"),
  item("beni","Titoli e documenti sui beni e sulle passività"),
  item("testamento","Eventuali disposizioni testamentarie",false),
  item("tributi","Tributi e versamenti pertinenti, se applicabili",false),
 ],
 contratto:[
  item("originale","Contratto originale completo e relativi allegati"),
  item("parti","Identificazione delle parti e verifica dei poteri"),
  item("versioni","Eventuali precedenti versioni o addendum",false),
  item("clausole","Revisione delle clausole di obbligo, recesso e penali"),
  item("approvazione","Revisione e approvazione finale dell'avvocato"),
 ],
 contenzioso:[
  item("mandato","Mandato, procura e documento di incarico"),
  item("fatti","Ricostruzione cronologica dei fatti e prove"),
  item("atti","Atti e documenti giudiziari disponibili"),
  item("notifiche","Notifiche e ricevute pertinenti, se presenti",false),
  item("udienze","Comunicazioni relative a udienze o depositi, se presenti",false),
  item("termini","Verifica manuale e professionale dei termini processuali"),
 ],
 contabilita:[
  item("fatture","Fatture emesse e ricevute del periodo"),
  item("estratti","Estratti conto e movimentazioni pertinenti"),
  item("paghe","Cedolini, F24 e contributi, se applicabili",false),
  item("quadratura","Quadratura delle scritture e revisione registri"),
 ],
 iva:[
  item("fatture","Fatture elettroniche e note di variazione"),
  item("registri","Registri IVA e corrispettivi pertinenti"),
  item("speciali","Controllo reverse charge e regimi speciali, se applicabili",false),
  item("liquidaz","Verifica del prospetto IVA secondo normativa applicabile"),
 ],
 f24:[
  item("modello","Modello F24 con codici tributo e periodo"),
  item("importi","Documenti a sostegno degli importi indicati"),
  item("quietanza","Quietanza o prova di versamento se disponibile",false),
 ],
 consulenza:[
  item("quesito","Descrizione del quesito e dei fatti rilevanti"),
  item("prove","Documentazione di supporto al quesito"),
  item("fonti","Normativa e fonti aggiornate da verificare"),
  item("revisione","Revisione finale della risposta professionale"),
 ],
 altro:[
  item("oggetto","Definizione dell'oggetto e dell'incarico"),
  item("documenti","Documenti pertinenti all'incarico"),
  item("revisione","Controllo del professionista prima della chiusura"),
 ],
};
export function requirementsFor(kind:CaseType):RequirementTemplate[]{
 return (DATA[kind]??DATA.altro).map(x=>({...x}));
}
