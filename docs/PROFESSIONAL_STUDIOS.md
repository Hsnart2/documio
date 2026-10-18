# DocuMio Professional — prima fase di studi professionali

## Implementazione (18 ottobre 2026)

DocuMio dispone di una nuova pagina `/professionisti` per creare studi,
organizzare anagrafiche clienti e fascicoli, utilizzare checklist orientate a
commercialisti, CAF, studi legali e realtà multidisciplinari e chiedere un
suggerimento AI strettamente limitato al fascicolo selezionato.

**La presenza del codice non attiva il modulo:** occorre applicare
`supabase/migrations/20261018_professional_studios.sql` al database del
progetto, dopo i test sul PostgreSQL temporaneo e un ambiente di prova.

### Ruoli

| Ruolo | Legge clienti e pratiche | Modifica dati e checklist | Valida pratica | Invita/revoca accessi |
|---|---|---|---|---|
| Owner (titolare) | Sì | Sì | Sì | Sì |
| Professionista | Sì | Sì | Sì | No |
| Collaboratore | Sì | Sì | No | No |
| Sola lettura | Sì | No | No | No |

L'autorizzazione è verificata dal database con `auth.uid()` e RLS.
Gli utenti non possono inserire direttamente righe in
`professional_studio_members`: possono aderire solo con invito valido,
hash SHA-256, scadenza di 7 giorni ed email **confermata e identica**
all'email invitata. Il link è generato nel browser e usa un fragment URL
(`#token`), che non viene trasmesso nell'HTTP Referer.

Il titolare può revocare un invito non usato o rimuovere un membro. L'accesso
ai dati dello studio viene ricalcolato nelle successive interrogazioni al DB.
La prova RLS simula accessi di diversi studi, utenti senza invito, visitatori
in sola lettura e ruoli che tentano di approvare pratiche senza autorizzazione.

### Integrità e archivio

- I clienti appartengono a uno studio; un fascicolo può riferirsi soltanto a
  un cliente dello **stesso** studio tramite FK composta.
- La checklist non può essere spostata in un fascicolo di altro studio.
- Le modifiche creano un evento tecnico di audit (azione, autore, data,
  riferimento record), senza duplicare testi e documenti.
- L'approvazione di una pratica è scritta come `reviewed_by` e
  `reviewed_at` soltanto se l'utente è titolare/professionista.
- Le eliminazioni degli account dei collaboratori non devono impedire la
  conservazione dei fascicoli dello studio: le referenze autore
  vengono rese nulle, conservando il lavoro e la data dell'azione.
- Documenti personali, archivi aziendali, fatture, file Storage e pratiche
  pregresse **non cambiano proprietà e non diventano condivisi**:
  l'accesso incrociato ai documenti necessita di una seconda migrazione e
  deleghe granulari testate; non va aggirato con service_role.

### Assistente AI

L'endpoint `/api/professionisti/assistente` autentica la sessione Supabase,
legge pratica e checklist con la RLS dell'utente e richiede un consenso
esplicito per ciascun invio al modello. **Non** invia direttamente nome,
email o P. IVA dall'anagrafica cliente. Invia invece il titolo,
la descrizione (che possono essere dati personali se l'utente li ha scritti),
la checklist e la domanda: la UI avverte prima del consenso.

Non dispone di consultazione aggiornata di norme o giurisprudenza.
Restituisce soltanto **azioni e verifiche proposte**, con il controllo umano
necessario, e non certifica adempimenti o documenti. L'AI non modifica record,
non genera invii e non effettua pagamenti. Se non configurata, l'endpoint
restituisce suggerimenti organizzativi deterministici.

### Prima di attivare in produzione

1. Verificare il commit della PR e i controlli GitHub:
   `npm run test:archive`, `npm run test:professionals`, il test su PostgreSQL
   effimero, `npm run build` e le suite finanziarie/aziendali.
2. Verificare l'identità di Supabase e Vercel, salvare backup e usare una
   preview/staging. La migrazione è additiva e transazionale.
3. Applicare SQL tramite gestione migrazioni e verificare advisers RLS.
4. Provare in ambiente separato: owner A, owner B, invitato viewer, collaboratore,
   professionista; test accesso negato cross-studio e tentativo di completare
   pratica da viewer/collaboratore.
5. Testare creazione cliente/caso, aggiornamento checklist, approvazione,
   revoca ruolo, mobile, apertura invito con la email sbagliata o non verificata.
6. Verificare privacy, DPA fornitori, trattamenti art. 9/10 se presenti,
   basi giuridiche e titolarità/responsabilità per dati dei clienti prima di
   invitare studi reali. Non avviare test con fascicoli sensibili veri.

### Limiti noti e sviluppi successivi

- Assenti condivisione di file originali a collaboratori, autorizzazione
  per singolo cliente, gestione conflitti e ricerca OCR specializzata.
- Non implementati invii o interrogazioni ufficiali Agenzia Entrate, INPS,
  CAF, PEC, PCT, PagoPA: richiedono accordi e soggetti abilitati.
- La contabilità completa (partita doppia e bilanci), i calcoli normativi
  datati e gli adempimenti telematici richiedono moduli dedicati e test
  professionali prima del rilascio.
- Il motore AI futuro deve recuperare fonti **ufficiali** versionate,
  mostrare data/URL/passaggio e dichiarare quando non esiste evidenza.

Questo rilascio costituisce una *base operativa protetta* e non un sostituto
dei professionisti abilitati.
