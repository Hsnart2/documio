/** Flussi organizzativi, NON interpretazioni vincolanti della normativa.
 * La data e la fonte di ogni obbligo vanno verificate dal professionista.
 */
export const STUDIO_TYPES = [
  {value:"commercialista",label:"Studio commercialista"},
  {value:"caf",label:"CAF / assistenza fiscale"},
  {value:"legale",label:"Studio legale"},
  {value:"multiservizi",label:"Studio multidisciplinare"},
] as const;
export type StudioType = typeof STUDIO_TYPES[number]["value"];

export const CASE_TYPES = [
  {value:"contabilita",label:"Contabilità aziendale",areas:["commercialista","multiservizi"]},
  {value:"iva",label:"IVA e registri",areas:["commercialista","multiservizi"]},
  {value:"redditi",label:"Dichiarazione redditi",areas:["commercialista","caf","multiservizi"]},
  {value:"f24",label:"Tributi e F24",areas:["commercialista","caf","multiservizi"]},
  {value:"730",label:"Modello 730",areas:["caf","multiservizi"]},
  {value:"isee",label:"DSU / ISEE",areas:["caf","multiservizi"]},
  {value:"successione",label:"Successioni",areas:["caf","legale","multiservizi"]},
  {value:"bonus",label:"Bonus e agevolazioni",areas:["caf","multiservizi"]},
  {value:"red",label:"Dichiarazione RED",areas:["caf","multiservizi"]},
  {value:"pensioni",label:"Pratiche pensionistiche",areas:["caf","multiservizi"]},
  {value:"contratto",label:"Revisione contratto",areas:["legale","multiservizi"]},
  {value:"contenzioso",label:"Contenzioso / causa",areas:["legale","multiservizi"]},
  {value:"consulenza",label:"Consulenza",areas:["commercialista","caf","legale","multiservizi"]},
  {value:"altro",label:"Altra pratica",areas:["commercialista","caf","legale","multiservizi"]},
] as const;
export type CaseType = typeof CASE_TYPES[number]["value"];

const COMMON = [
  "Verificare identità e titolo/delega a operare per il cliente",
  "Verificare documenti presenti e chiedere eventuali integrazioni",
  "Controllare dati, periodi e incongruenze con gli originali",
  "Sottoporre l'esito alla revisione del professionista",
] as const;

const SPECIFIC: Record<CaseType,readonly string[]> = {
  contabilita:[
    "Raccogliere fatture attive e passive e verificare i duplicati",
    "Confrontare movimenti bancari e fatture senza considerare saldato il non verificato",
    "Controllare competenza, IVA e registrazioni con un piano dei conti adeguato",
  ],
  iva:[
    "Verificare il periodo e i documenti contabili disponibili",
    "Controllare regime, imponibili, aliquote, note di credito e casi particolari",
    "Verificare gli importi con le scritture prima di qualsiasi liquidazione o invio",
  ],
  redditi:[
    "Raccogliere certificazioni, redditi e oneri dichiarati",
    "Verificare il periodo fiscale, la situazione e le condizioni del contribuente",
    "Controllare il modello e l'eventuale trasmissione tramite canale abilitato",
  ],
  f24:[
    "Raccogliere il modello e i documenti a supporto",
    "Controllare codice tributo, periodo, importi e soggetto intestatario",
    "Verificare scadenze e quietanze da fonti ufficiali e prove di pagamento",
  ],
  "730":[
    "Raccogliere certificazioni, redditi e giustificativi di spesa",
    "Verificare anagrafica, familiari e condizioni rilevanti",
    "Controllare dati, documenti e modello con l'operatore abilitato",
  ],
  isee:[
    "Raccogliere informazioni sul nucleo e dichiarazioni richieste",
    "Verificare redditi e patrimoni per il periodo di riferimento corretto",
    "Controllare coerenza dei dati DSU e documentazione prima dell'invio autorizzato",
  ],
  bonus:[
    "Individuare la prestazione richiesta e i requisiti dichiarati",
    "Consultare le condizioni e i termini sul sito ufficiale dell'ente",
    "Verificare documenti del nucleo, redditi ed eventuali incompatibilità",
  ],
  red:[
    "Verificare la richiesta RED e il periodo di riferimento",
    "Raccogliere le dichiarazioni reddituali e le certificazioni pertinenti",
    "Verificare le istruzioni INPS attuali e il soggetto abilitato all'invio",
  ],
  pensioni:[
    "Identificare la tipologia della domanda pensionistica",
    "Raccogliere estratto contributivo e documentazione professionale",
    "Verificare requisiti e finestre vigenti con INPS o patronato abilitato",
  ],
  successione:[
    "Identificare soggetti, beni, passività e documenti rilevanti",
    "Controllare titoli, eventuali disposizioni e situazione patrimoniale",
    "Verificare adempimenti e termini applicabili con un professionista abilitato",
  ],
  contratto:[
    "Individuare parti, durata, obblighi, costi e rinnovi",
    "Evidenziare clausole da verificare: recesso, penali e responsabilità",
    "Confrontare i passaggi con l'originale prima di formulare il parere",
  ],
  contenzioso:[
    "Organizzare atti, prove e cronologia dei fatti",
    "Verificare autorità competente, termini e notifiche su atti e fonti ufficiali",
    "Valutare con il legale strategie, rischi e atti da predisporre",
  ],
  consulenza:[
    "Definire chiaramente quesito e obiettivo del cliente",
    "Individuare documenti, fatti e fonti da verificare",
    "Rivedere e approvare per iscritto la risposta professionale",
  ],
  altro:[
    "Definire l'oggetto e il responsabile della pratica",
    "Elencare documenti e verifiche necessari",
    "Registrare i controlli e l'approvazione finale",
  ],
};

export function caseTypesFor(studioType: StudioType) {
  return CASE_TYPES.filter((type)=>type.areas.some((area)=>area===studioType));
}

export function checklistFor(caseType:CaseType):string[] {
  const unique = new Set([...COMMON.slice(0,2),...SPECIFIC[caseType],...COMMON.slice(2)]);
  return [...unique];
}

export function humanChecklistSuggestion(
  caseType:CaseType,
  tasks:Array<{title:string;is_done:boolean}>,
):{summary:string;actions:string[];limitations:string} {
  const label=CASE_TYPES.find((item)=>item.value===caseType)?.label??"Pratica";
  const missing=tasks.filter((task)=>!task.is_done).map((task)=>task.title);
  return {
    summary:missing.length
      ? `${label}: ${missing.length} verifiche organizzative risultano ancora aperte.`
      : `${label}: la checklist organizzativa è completa, ma non certifica l'adempimento.`,
    actions:missing.slice(0,4).length?missing.slice(0,4):["Eseguire revisione professionale sugli originali e verificare gli adempimenti applicabili."],
    limitations:"Suggerimenti organizzativi. Nessuna verifica di norme, giurisprudenza, scadenze legali o trasmissioni a enti è stata eseguita.",
  };
}
