# DocuMio — Visione funzionale: ufficio amministrativo, fiscale, contabile e legale

Ultimo aggiornamento: 16 ottobre 2026. Documento di riferimento permanente del progetto.

## Obiettivo dell'utente

DocuMio deve diventare un assistente proattivo per **privati** e per **più aziende contemporaneamente**, in grado di organizzare e collegare documenti, fatture, movimenti bancari, contratti, cedolini, F24, scadenze e pratiche. Deve spiegare i dati, trovare subito il documento pertinente, suggerire correzioni e chiedere conferma per qualunque dato incerto.

**I risultati di un modello non sostituiscono, per effetti legali, i servizi riservati ai commercialisti, consulenti del lavoro, avvocati, CAF, professionisti autorizzati o agli organismi competenti.** L'obiettivo è una qualità di organizzazione, ricerca e preparazione superiore al lavoro manuale ripetitivo, con fonti e audit.

## Regole di prodotto non negoziabili

1. **Un archivio personale e N archivi aziendali** dello stesso utente. Ragione sociale, P. IVA, codice fiscale, attività e stato per ciascuna azienda. Ogni documenti/fattura/operazione/contratto/scadenza è attribuito a UN ambito, non può passare implicitamente ad un altro.
2. **Documento originale sempre conservato privatamente**, con hash, data, fonte, percorso, eventuali versioni e relazione verso registrazioni. Per documenti non supportati dall'OCR/AI si archivia comunque e si spiega il limite.
3. **Tre stati dei dati**: estratto/importato, ipotesi AI/regola e confermato da persona. Mai riscrivere informazioni validate dall'utente sulla sola base di OCR incerto. Al dubbio: coda «Da verificare», domanda motivata, campo originale.
4. **Contabilità distinta dalla banca**: fatture e registrazioni economiche non sono la stessa cosa dei movimenti di liquidità. Non sommare incassi e fatture come se fossero ricavi doppi. Conti, periodi, valute, IVA, paghe e rimanenze vanno distinti.
5. **Banche solo con consenso PSD2/Open Banking o estratti CSV**, nessuna richiesta password bancarie né disposizioni di bonifici. Ogni connessione aziendale richiede una delega e un ambito preciso.
6. **AI legale e fiscale con evidenza**: osservazione -> passaggio nel file/fonte istituzionale con data -> spiegazione -> azione richiesta -> grado di incertezza. Se la fonte manca, dichiararlo.
7. **Privacy e sicurezza**: Supabase Auth, RLS, segregazione per utente e azienda, segreti solo server, consenso al trattamento AI di documenti sensibili, retention e registro audit; evitare accessi interaziendali.
8. **Prestazioni mobile e desktop**: caricamento diretto Storage, AI dopo il salvataggio, coda recuperabile, navigazione chiara, gruppi e filtri per migliaia di file, anteprima rapida e layout responsivo.

## Stato delle funzioni

| Funzione | Stato tecnico al 16/10/2026 | Passaggi prima di affermare «completo» |
|---|---|---|
| Area personale e più aziende | Sviluppo branch: profili e ambiti con riferimenti/guardie RLS; interfaccia Crea azienda | Migrazione, test con due aziende e due utenti, gestione ruoli/deleghe |
| Archivio file e ricerca | Esistente; caricamento rapido e multiplo già in produzione; filtro per azienda in branch | Paginazione, ricerca OCR full text, versioni, hash e verifica di scala |
| Fatture elettroniche XML acquisti/vendite | Parsing e import esistenti; in branch archivio dell'XML originale, categorizzazione, IVA esplicita | XML firmati .p7m, note di credito, reverse charge, autofatture, validazione FatturaPA completa, corrispettivi/SDI con provider |
| Categorie di costo e ricavo | In branch regole e conferma manuale: acquisti, trasporti, manutenzioni, utenze, canoni, stipendi, INPS, CONAI, IVA, imposte, consulenze, assicurazioni, interessi, marketing, servizi e vendite | Piano dei conti dettagliato per settore, conti personalizzati, modello che legge righe/XML con motivi e incertezza |
| Estratti conto e riconciliazione | CSV e proposte guidate da importo/valuta/segno/controparte/numero fattura; conferma utente | Riconciliazione uno-a-molti e molti-a-uno, pagamenti aggregati, cash management, per impresa PSD2 con delega |
| F24 / ritenute / tributi | In branch registro provvisorio + documenti attribuiti all'azienda | Lettura campi tributo/sezione/periodo/importi da PDF, scadenzario normativo verificato, ravvedimento calcolato solo con regole ufficiali |
| Buste paga e stipendi | In branch etichette e registro protetto da RLS | OCR cedolini, costo aziendale per mensilità, contributi, trattenute, ferie/TFR, quadratura con banca/F24 e verifica consulente |
| CONAI e contributi ambientali | In branch categoria separata e registro | Contributo per materiale/peso e regime, documenti giustificativi, normativa/aliquota datata e verifica professionale |
| Contratti e atti | In branch analisi volontaria con passaggio testuale, rischi possibili, obblighi e checklist | Estrarre date e rinnovi sul calendario, confrontare versioni, giurisprudenza/norme attuali da fonti tracciate, revisione legale |
| Bilanci e controllo di gestione | In branch totali fatture lordi *esplicitamente non bilancio* | Piano dei conti partita doppia, competenza, scritture di assestamento, ratei, risconti, rimanenze, ammortamenti, stato patrimoniale/CE, prima nota, quadrature, rendiconto finanziario |
| Assistente CAF/privati | Esistente ricerca documentale e scadenze | 730, DSU/ISEE, bonus, documenti richiesti per pratica, assistente con fonte normativa e stato; invio solo tramite soggetto abilitato |
| Segreteria e automazioni | Gmail, notifiche, pratiche e cron già presenti | PEC, calendario, solleciti con approvazione, bozze lettere/contratti, verifiche scadenze automatiche autorizzate |
| Accessi aziendali | Primo livello: proprietà dell'utente | Ruoli titolare, amministrazione, collaboratori esterni, commercialista, log di chi legge/modifica, deleghe granulari |
| Sicurezza | RLS già esistente + nuove guardie tenant proposte | Staging e test IDOR/BOLA, revisione GDPR/DPA, retention, audit trail, test penetrazione e autorizzazioni API |
| Integrazione istituzionale | ACI/pagoPA soltanto link; provider bancario da attivare | Canali ufficiali Agenzia Entrate/INPS/SEND/ACI dove disponibili e autorizzati; nessuno scraping SPID/CIE |

## Esempi di comportamento desiderato

- **Fattura XML ricevuta:** conservare XML, verificare che il cessionario sia l'azienda selezionata, riconoscere fornitore, imponibile, IVA, totale, scadenza e righe. Suggerire trasporti/acquisti/manutenzione, chiedere conferma, proporre abbinamento con movimenti bancari della STESSA azienda e marcare come riconciliato soltanto dopo conferma.
- **Fattura emessa:** ricavo nella sezione fatture attive, controllo scaduto/da incassare, ricerca bonifico e proposta di sollecito solo previa verifica dell'effettivo incasso.
- **Cedolino:** conservarlo nell'archivio dell'azienda, estrarre periodo, lordo/netto e trattenute con citazione al documento; evitare di confondere netto al dipendente con costo lavoro completo, collegare F24 e bonifico solo se certa la corrispondenza.
- **F24:** identificare tributi, codice, importi, periodo, scadenze quando espliciti e verificati; nessun pagamento inventato.
- **Contratto:** individuare obblighi, rinnovi, penali, recesso, prezzo e clausole sospette; mostrare passaggi contrattuali originali brevi e controlli suggeriti, non un giudizio definitivo di validità.
- **Domanda «trovami il contratto con X»:** filtrare il workspace, trovare il file reale e proporre l'apertura dell'originale; mai fabbricare un documento.
- **«Fammi il bilancio dell'azienda A»**: se mancano piano dei conti, competenze o registrazioni dichiararlo, mostrare i conti provvisori e chiedere conferme. Non chiamare «bilancio» la sola differenza tra fatture attive e passive.

## Sequenza di sviluppo e collaudo

**Fase 1** — multi-azienda, preservazione originale fattura, registri preliminari, categorie proposte, CSV e contratti revisione assistita: in sviluppo PR #52. Passare da preview a produzione solo con DB verificato e test.
**Fase 2** — registro partita doppia e piano dei conti, regole contabilizzazione, quadrature, competenza, report CE/SP e import multipli.
**Fase 3** — IVA, paghe, F24 e CONAI dettagliati con regole normative versionate; convalida consulente.
**Fase 4** — deleghe aziendali, PSD2 per azienda, estrazione documento-full-text con ricerca ibrida e versionamento contratti.
**Fase 5** — CAF, pratiche legali, documenti ufficiali, integrazioni PEC/istituzionali e flussi ad approvazione.

**Criterio di rilascio:** test unitari e build, migrazione su database giusto, test RLS cross-user/cross-company, end-to-end upload/import PDF/XML/CSV/cedolino/F24/contratto, confronto saldi/transazioni e preview reale su mobile/PC. Conservare un piano di rollback.
