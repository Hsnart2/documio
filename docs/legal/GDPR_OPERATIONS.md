# DocuMio — Presidio GDPR operativo

Versione 1.0 — 24 luglio 2026

Titolare: NEXTMIND SOFTWARE DI DE BELLIS DANIELE — P. IVA 14827340960 — REA MB-2809698 — Via Trento e Trieste 24, 20822 Seveso (MB) — PEC debellisdaniele91@pec.it.

Questo documento è interno e deve essere aggiornato quando cambiano funzioni, fornitori, categorie di dati o tempi di conservazione.

## 1. Registro sintetico dei trattamenti

| Trattamento | Interessati | Dati | Finalità | Base giuridica | Destinatari | Conservazione |
|---|---|---|---|---|---|---|
| Account e autenticazione | Utenti | email, ID, sessioni, log | accesso e sicurezza | contratto, legittimo interesse | Supabase, Vercel | vita account + log proporzionati |
| Archivio documentale | Utenti e soggetti presenti nei file | documenti, immagini, metadati | archiviazione e ricerca | contratto; autorizzazione dell’utente per dati di terzi | Supabase | fino a eliminazione/account |
| Analisi IA | Utenti e soggetti presenti nei file | contenuto file, prompt, output | estrazione e assistente | contratto; consenso esplicito per art. 9 | OpenAI; iLovePDF se usato | elaborazione + output salvati secondo funzione |
| Pratiche, scadenze e pagamenti | Utenti | metadati, importi, date | organizzazione e promemoria | contratto | Supabase, Resend se attivo | vita account |
| Abbonamenti | Utenti paganti | stato piano, transazioni, ricevute | pagamento e fatturazione | contratto, obbligo legale | Apple/Google/fornitore pagamenti | termini fiscali |
| Assistenza e sicurezza | Utenti | comunicazioni, log, IP | supporto, prevenzione abusi | contratto, legittimo interesse | fornitori tecnici, consulenti | necessario alla finalità |

## 2. Richieste degli interessati

Canale: PEC debellisdaniele91@pec.it.

1. Registrare data, richiedente, diritto esercitato e scadenza.
2. Verificare l’identità con metodo proporzionato senza raccogliere dati eccedenti.
3. Cercare dati in Auth, database, Storage, email operative, log e sistemi di pagamento.
4. Rispondere entro un mese, salvo proroga motivata nei casi previsti dal GDPR.
5. Conservare evidenza della richiesta e della risposta.
6. Per cancellazione, verificare prima obblighi fiscali, contenziosi o sicurezza.

## 3. Procedura data breach

1. Contenere immediatamente l’incidente, revocare credenziali e isolare la causa.
2. Registrare data/ora, sistemi, categorie di dati, utenti coinvolti e misure adottate.
3. Valutare probabilità e gravità del rischio per le persone.
4. Se il rischio non è improbabile, notificare il Garante senza ingiustificato ritardo e, ove possibile, entro 72 ore.
5. Se il rischio è elevato, informare gli interessati con linguaggio chiaro, salvo eccezioni di legge.
6. Conservare la documentazione anche quando non si effettua notifica.
7. Effettuare analisi delle cause e azioni correttive.

## 4. Fornitori e verifiche

Mantenere per ogni fornitore: servizio, ruolo privacy, DPA/condizioni, sede e trasferimenti, misure di sicurezza, sub-responsabili, procedura di cancellazione e data dell’ultima verifica.

Fornitori attuali da verificare periodicamente: Supabase, Vercel, OpenAI, Resend, iLovePDF, Apple, Google e futuro sistema di abbonamento.

## 5. Privacy by design

- dati e file accessibili soltanto al proprietario tramite RLS e Storage privato;
- URL firmati a breve durata;
- minimizzazione dei dati passati all’IA;
- cancellazione coordinata di file e record;
- nessuna chiave segreta nel client;
- log privi, ove possibile, del contenuto dei documenti;
- test periodico con due account distinti;
- revisione prima di introdurre analytics, marketing, condivisione con professionisti o nuove integrazioni.

## 6. Controlli prima del lancio

- revisione legale professionale di Privacy Policy e Termini;
- sottoscrizione/verifica dei DPA con i responsabili;
- registrazione affidabile della versione legale accettata;
- consenso separato per marketing;
- conferma esplicita per il caricamento di dati particolari;
- procedura di esportazione completa dei dati;
- verifica backup, restore e cancellazione;
- DPIA da valutare prima di trattamento su larga scala di documenti sanitari, giudiziari o altamente sensibili.
