# DocuMio — checklist di lancio

Aggiornata al 29 luglio 2026.

## Bloccanti prima dell'apertura al pubblico

- [x] Privacy Policy pubblica
- [x] Termini e condizioni pubblici
- [x] Cookie Policy pubblica
- [x] Pagina Sicurezza pubblica
- [x] Eliminazione account disponibile nell'app
- [x] Consenso richiesto in registrazione
- [x] Versione e data dei documenti legali salvate nei metadati Auth
- [ ] Eseguire `supabase/legal_consents.sql` nel SQL Editor di Supabase
- [ ] Verificare invio email di conferma registrazione
- [ ] Verificare recupero password da produzione
- [ ] Verificare cancellazione completa di un account di prova
- [ ] Verificare upload, lettura e cancellazione di PDF e immagini da un account nuovo
- [ ] Verificare che un secondo account non possa vedere i dati del primo
- [ ] Sostituire o confermare l'indirizzo email ordinario di assistenza pubblica

## Test rapido da telefono

1. Registrazione con una nuova email.
2. Conferma dell'email.
3. Accesso e uscita.
4. Recupero password.
5. Caricamento file piccolo e file tra 4 e 20 MB.
6. Ricerca documento con IA.
7. Creazione pratica e collegamento documento.
8. Eliminazione documento e allegato.
9. Eliminazione account.
10. Apertura di `/privacy`, `/terms`, `/cookie` e `/security`.

## Infrastruttura

- [ ] Controllare in Vercel che tutte le variabili di produzione siano presenti.
- [ ] Controllare in Supabase che RLS sia attivo sulle tabelle utente.
- [ ] Controllare che i bucket documentali siano privati.
- [ ] Controllare dominio e URL di redirect in Supabase Auth.
- [ ] Configurare un indirizzo di assistenza monitorato.
- [ ] Attivare monitoraggio errori prima della campagna pubblicitaria.

## Pubblicazione store

La web app può essere lanciata prima della versione nativa. Per Google Play e App Store serviranno inoltre:

- icona e schermate promozionali;
- descrizione breve e completa;
- URL Privacy Policy;
- URL eliminazione account;
- compilazione delle schede sicurezza dati/privacy degli store;
- account sviluppatore e build firmata.

## Controllo legale finale

Le pagine costituiscono una base operativa coerente con il funzionamento attuale di DocuMio. Prima di attivare pagamenti o campagne su larga scala è raccomandata una revisione da parte di un professionista privacy/digital legal sui flussi effettivi e sui contratti con i fornitori.
