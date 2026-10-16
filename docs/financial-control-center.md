# DocuMio — Centro di controllo amministrativo e finanziario

**Stato:** implementazione fase iniziale, pronta per test in anteprima; **non è ancora una funzione operativa in produzione** fino alla migrazione SQL, alla verifica funzionale e alla pubblicazione.

## Obiettivo del prodotto

Da archivio documenti a **assistente operativo per privati, aziende e professionisti**: unire documenti, scadenze, fatture, estratti bancari, incassi, pagamenti e controlli proattivi.

La qualità chiave non è produrre risposte apparentemente sicure, ma collegare ogni risposta al documento e al movimento di origine, distinguere **dato verificato / ipotesi / non disponibile**, e indicare il passo successivo.

DocuMio **non sostituisce legalmente** avvocati, commercialisti, CAF o consulenti abilitati; può accelerare raccolta documentale, preparazione e verifica preliminare, affiancando i professionisti con log e autorizzazioni.

## Funzioni già implementate su questa branch

| Area | Funzione | Stato e limiti |
| --- | --- | --- |
| Fatture | Caricamento dati XML FatturaPA e registrazione manuale di fatture emesse/ricevute | Codice presente. Una nota di credito TD04/TD08 viene bloccata per evitarne l'errata contabilizzazione |
| Documenti | Precompilazione da documenti già in DocuMio, **solo dopo conferma** | Collegamento archivio → fattura con controllo proprietario nel database |
| Movimenti bancari | Import CSV con date e importi verificati, deduplicazione e supporto divisa esplicita | Da testare sui CSV esportati dalle singole banche |
| Open Banking | Flusso di consenso e lettura saldi/movimenti **in sola lettura** tramite GoCardless Bank Account Data | **Disabilitato** senza credenziali del provider, accordi applicabili e autorizzazione utente; nessun pagamento disposto |
| Riconciliazione | Suggerimento movimenti compatibili per importo, segno, valuta, controparte e data | Nessuna attribuzione automatica: utente deve confermare; supporta imputazione parziale |
| Scadenze | Fatture, bollo, multe, imposte, assicurazioni e contratti | Registrazione manuale e link a fonti ufficiali; non esiste interrogazione diretta dei database degli enti |
| Promemoria | Integrazione con servizio email/push DocuMio esistente | Raggiunge le milestone **30, 14, 7, 1, 0, -1, -7** giorni quando notifiche attive; non invia in assenza di preferenze/connettività |
| Ottimizzazione | Flusso netto ultimi 30 giorni, crediti/debiti non riconciliati, uscite rilevanti, trend e solleciti da verificare | Non equivale a utile, IVA, bilancio o consulenza fiscale |

## Attivazione tecnica

1. Su Supabase **del progetto DocuMio**, effettuare backup e applicare in ambiente di prova `supabase/migrations/20261015_financial_control_center.sql`; verificare tutti i vincoli e le policy RLS.
2. Verificare che `public.documents`, Supabase Auth, `automation_notifications`, cron reminders, push e relative policy siano già correttamente configurati.
3. Eseguire i test `npm run test:finance` e `npm run build`.
4. Pubblicare la branch in preview, effettuare login con due account diversi e controllare che nessun documento, movimento o abbinamento dell'uno sia visibile all'altro.
5. Per la connessione PSD2 autorizzata: ottenere credenziali **Bank Account Data** GoCardless e impostare come segreti server (mai nel browser):
   - `GOCARDLESS_BAS_SECRET_ID`
   - `GOCARDLESS_BAS_SECRET_KEY`
   - `DOCUMIO_APP_URL` (origine HTTPS dell'app, senza path/query; esempio `https://documio.vercel.app`). Se assente, usare `NEXT_PUBLIC_APP_URL` solo se punta allo stesso dominio utilizzato per il consenso.
6. Controllare compatibilità di contratto del provider, informativa privacy e diritti degli utenti, conservazione dati, modalità di revoca, aggiornamenti del consenso bancario e conformità normativa per l'attività concretamente svolta.
7. Collegare una **banca di prova** tramite consenso utente e verificare sincronizzazione, scadenza consenso, idempotenza import, duplicati e revoca prima di aprire a clienti reali.
8. Non portare in produzione le funzioni bancarie fino al completamento dei controlli precedenti. Non incorporare segreti di banche, token di autorizzazione o dati bancari in log o strumenti di analisi esterni.

**Importante:** un deployment Vercel READY indica che il codice ha completato la build, **non** che il database sia migrato, che il provider bancario sia collegato o che siano stati verificati processi legali/fiscali.

## Assunzioni e precauzioni

- In modalità manuale, le fatture aperte sono **non riconciliate**, non certamente insolute. A differenza di un conto economico, il saldo di cassa non indica profitto.
- Conti e movimenti hanno permessi e tabelle dedicati e sono consultabili dal proprietario; le chiamate verso Open Banking partono solo dal server e il consenso si effettua sul sito del provider/banca.
- Un movimento non può essere collegato a più fatture in questa versione (per prevenire imputazioni duplicate); incassi cumulativi di più fatture richiederanno un'evoluzione del modello.
- L'import XML non sostituisce un servizio di conservazione elettronica a norma. I file originali devono essere archiviati separatamente secondo gli obblighi applicabili.
- I collegamenti ACI / pagoPA sono collegamenti **alle fonti ufficiali**, non interrogazioni automatiche di ACI o consultazioni di multe e verbali.
- La sezione di consigli economici usa regole verificabili e non attribuisce automaticamente classificazioni fiscali o deducibilità.

## Test manuali minimi

- Importare due volte lo stesso CSV; nessun doppione.
- Importare due volte lo stesso XML; nessun doppione; importo e divisa coerenti.
- Verificare fattura emessa con movimento positivo, ricevuta con negativo, movimenti in valuta diversa e pagamenti parziali.
- Provare abbinamento oltre importo fattura: database deve rifiutare.
- Controllare che un documento di un altro account non possa essere collegato.
- Verificare che le funzioni normali di DocuMio (archivio, Gmail, pratiche, promemoria) non regrediscano.
- Verificare notifiche 14/7/1/0 giorni di fatture e scadenze su dati fittizi.
- Provare apertura ACI/pagoPA e inserimento scadenza di un bollo dopo verifica ufficiale.
- Con collegamento PSD2: autorizzazione banca, revoca dal provider, indisponibilità temporanea, import idempotente e dati su conti multipli.

## Fasi successive (non ancora realizzate)

1. **Import contabile verificabile:** connessione a gestionali fatturazione/SDI tramite partner autorizzati, note credito, allegati XML originali, riconciliazione molti-a-molti e bollette/avvisi PagoPA.
2. **Archivio documentale universale:** versioni, relazione tra atti, OCR controllato, ricerca semantica con citazioni, filtri per società/cliente/anno, permessi condivisi e registro accessi.
3. **Assistente fiscale/lavoro/legale:** check-list e simulazioni con normativa vigente, fonte e data, raccolta dati e generazione di bozze da convalidare da professionisti quando necessario.
4. **Analisi aziendale reale:** collegamento costi, ricavi, scorte, listini e margini di prodotti/commesse a dati contabili affidabili, scenari di liquidità e analisi di scostamenti e concentrazione fornitori.
5. **Integrazioni istituzionali:** studio di canali ufficiali/accordi per AdE, INPS, ACI, SEND/IO, pagoPA, notifiche e deleghe. Mai affidarsi a scraping dietro autenticazione/SPID.
6. **Operatività automatica controllata:** richieste, bozze email e attività programmate con registro e approvazione obbligatoria per pagamenti, invii fiscali, dichiarazioni o atti con valore giuridico.

Fonti tecniche ufficiali per l'integrazione: https://docs.gocardless.com/docs/bank-account-data/quickstart-guide ; https://aci.gov.it/servizi/bollo-auto/ ; https://www.pagopa.gov.it/
