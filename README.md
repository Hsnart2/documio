# DocuMio

**Un assistente documentale e amministrativo per privati, professionisti e aziende.**

DocuMio nasce come archivio di documenti e pratiche con ricerca intelligente e cresce verso un centro di controllo per scadenze, fatture, incassi, pagamenti, contratti e attività da svolgere.

## Funzionalità principali

- Accesso personale con Supabase, documenti e allegati privati, pratiche, note e scadenze.
- Analisi AI dei documenti e ricerca contestuale, con avvertenze sulle risposte non verificate.
- Collegamento Gmail facoltativo, importazione e classificazione delle comunicazioni autorizzate.
- Centro attività, automazioni e promemoria con email e notifiche push, configurabili dall'utente.
- Area `/controllo` (**nuova fase su branch dedicata**): fatture emesse/ricevute, CSV bancari, import FatturaPA XML, riconciliazione manuale, scadenze generiche e primo motore di analisi dei costi e degli incassi.
- Connettore Open Banking PSD2 **solo lettura**, disabilitato finché non vengono configurate credenziali provider e richiesto il consenso bancario dell'utente.

## Sviluppo locale

Prerequisito: Node.js 22.

```bash
npm ci
npm run test:finance
npm run dev
```

L'app è disponibile all'indirizzo `http://localhost:3000`. Per la build:

```bash
npm run build
```

La configurazione Supabase/Auth/Storage/AI/Gmail usa variabili ambiente definite nel progetto Vercel; le chiavi riservate **devono essere esclusivamente server-side**. La connessione al database e il funzionamento delle automazioni richiedono le migrazioni Supabase applicate.

## Centro di controllo: attivazione

Il codice del Centro di controllo da solo **non abilita** tabelle, accesso ai conti bancari o verifiche istituzionali. Per attivare il modulo occorre applicare `supabase/migrations/20261015_financial_control_center.sql`, verificare RLS e configurare il provider, quindi eseguire i controlli su una preview.

Leggi [docs/financial-control-center.md](docs/financial-control-center.md) per limiti, migrazione, variabili necessarie e test di privacy/sicurezza.

I servizi ACI e pagoPA in questa fase sono **link a fonti ufficiali**: non viene effettuata alcuna interrogazione automatica dei database di bolli o multe. La funzione AI offre supporto operativo e documentale ma non sostituisce i professionisti o gli adempimenti regolamentati.

## Documentazione

- [Checklist di lancio](docs/LAUNCH-CHECKLIST.md)
- [Centro di controllo](docs/financial-control-center.md)
- [Integrazione Gmail](docs/gmail-integration.md)
- [Sicurezza e processi GDPR](docs/legal/GDPR_OPERATIONS.md)
