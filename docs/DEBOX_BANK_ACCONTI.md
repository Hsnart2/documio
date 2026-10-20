# DEBOX — banche aziendali, acconti, riconciliazione e pacchetto commercialista

## Banche richieste

- Banca MPS (Monte dei Paschi di Siena)
- BPER Banca
- BCC (identificare la **banca di credito cooperativo esatta**, spesso un provider del gruppo Iccrea o Cassa Centrale)
- Credem (Credito Emiliano)

Nessun ID di istituto è inventato o impostato a mano: i tasti di
ricerca mostrano **solo banche effettivamente restituite dal provider AIS**
per l'Italia. La presenza nell'elenco **non garantisce** l'accesso al singolo
conto corporate. L'utente autorizzato deve verificare i permessi aziendali
presso ogni banca e accordare il consenso tramite l'interfaccia ufficiale.

## Importante: disponibilità GoCardless Bank Account Data

In ottobre 2026 la vecchia integrazione GoCardless Bank Account Data è
presente in DocuMio, ma l'account DocuMio **non dispone** delle variabili
di collegamento `GOCARDLESS_BAS_SECRET_ID` e
`GOCARDLESS_BAS_SECRET_KEY`: fino a quando non saranno configurate,
il pulsante di collegamento diretto resta disattivato.

Da luglio 2025 il prodotto *Bank Account Data standalone* non accetta
generalmente nuovi clienti; gli account già autorizzati possono continuare.
GoCardless può valutare accessi contrattuali idonei, senza automatismi.
Verificare le condizioni correnti con il fornitore prima di iniziare.

Fonti da verificare:
- https://docs.gocardless.com/docs/bank-account-data/quickstart-guide
- https://gocardless.com/legal/bank-account-data
- https://github.com/actualbudget/docs/blob/master/docs/advanced/bank-sync/gocardless.md
- https://www.saltedge.com/products/account_information/coverage/it
- https://docs.saltedge.com/partners/v1/

Se non è disponibile GoCardless, occorre concordare **un altro fornitore
AIS autorizzato**, ad esempio Salt Edge Partners, e sviluppare/inserire
il relativo adapter prima di poter connettere banche reali. La pagina
di copertura Salt Edge elenca numerosi istituti italiani, ma occorre
verificare per contratto e istituto MPS, BPER, Credem e BCC specifica,
conti business, costi, durata del consenso e storico accessibile.

### Attivazione con account AIS esistente

1. Aprire il portale developer GoCardless Bank Account Data, generare
   le credenziali API (NON copiarle in chat o repository).
2. In Vercel > progetto `documio` > Settings > Environment Variables,
   salvare **come secrets di production** `GOCARDLESS_BAS_SECRET_ID`,
   `GOCARDLESS_BAS_SECRET_KEY`. `NEXT_PUBLIC_APP_URL` deve essere
   l'origine HTTPS corretta (`https://documio.vercel.app`).
3. Ridistribuire la build affinché legga le nuove variabili.
4. In DocuMio > Controllo > selezionare l'azienda DEBOX >
   **Banche e movimenti** > **Scegli una banca italiana**.
   Filtrare MPS, BPER, BCC o Credem e scegliere il nome mostrato dal provider.
5. Fare clic su **Autorizza presso la banca**; accedere al sito della banca
   con un utente titolato per i conti **aziendali**, approvare esclusivamente
   lettura conti/movimenti/saldi (AIS), terminare il reindirizzamento.
6. Ripetere per ogni banca/conto. Premere **Sincronizza** e controllare
   date, intervallo storico, stato del consenso e conto/valuta.
7. Se un'istituzione non è disponibile, esportare CSV dall'home banking,
   impostare in DocuMio il nome univoco di ogni conto e importare il file.
   Non condividere password, OTP o codici di autorizzazione con DocuMio.

**Non esiste in questa integrazione un endpoint per effettuare bonifici o
disporre pagamenti.** Non usare accessi “Payment Initiation” (PIS).

### Copertura storica e qualità dati

Un provider AIS non garantisce tutto l'anno precedente. Lo storico può
essere limitato da banca, contratto e consenso. Ogni saldo PSD2 riportato
dalla banca ha una *data di riferimento*: non retrodatare un saldo corrente
al 31 dicembre. Il saldo ufficiale di chiusura si inserisce dal relativo
estratto conto e, se disponibile, si allega l'originale all'archivio DEBOX.
La somma dei bonifici non può ricostruire un saldo se non si conoscono
apertura, copertura e completezza dei movimenti.

## Regole DEBOX: “acconto fatture” e incassi/pagamenti aggregati

Un movimento positivo è candidato **solo** per fatture emesse, uno negativo
**solo** per fatture ricevute, a valuta coerente. DocuMio propone controparti
in base a nominativo e causale e, quando plausibile, suggerisce fatture
aperte per scadenza. Non chiude fatture senza conferma utente.

Esempio: cliente Alfa bonifica €15.000, causale “ACCONTO FATTURE”.
Ha tre fatture da €8.000, €5.000 e €6.000. Il programma mostra una
proposta di €8.000 + €5.000 + €2.000, con residuo €4.000 sulla terza,
**soltanto dopo conferma**. Senza controparte attendibile l'acconto
rimane **non attribuito**. Anche fatture pagate in due o più bonifici
vengono gestite. L'utente può modificare/importi e revocare attribuzioni;
l'audit conserva azione, data, utente, fattura e quota.

I bonifici non per fattura (giroconti, stipendi, finanziamenti, F24, canoni)
non devono essere attribuiti artificialmente a fatture solo per far
quadrare il prospetto. Vanno classificati e contabilizzati separatamente.

### Report di fine esercizio

DocuMio > Controllo > azienda DEBOX > Banche e movimenti >
**Dossier di fine anno** > ZIP per commercialista. Il file contiene
prospetti CSV per fatture, clienti/fornitori, scadenzario non riconciliato,
movimenti bancari, saldi 31/12 dichiarati dall'utente, attribuzioni
confermate, acconti/movimenti da attribuire e LEGGIMI sui limiti.

DocuMio Professional > Contabilità cliente fornisce il *partitario
Dare/Avere* e il *bilancio di verifica* **solo** sulle scritture realmente
contabilizzate. Questi dati **non** equivalgono a bilancio civilistico,
registri IVA certificati, LIPE, assestamenti, ammortamenti e rimanenze.
Il commercialista deve ancora controllare i documenti originali,
la completezza della contabilità, poste di apertura, competenze,
inventario, leasing, imposte, partite transitorie e la riconciliazione
di tutti i conti prima della chiusura.

## Test obbligatori prima dell'utilizzo reale

- Test PostgreSQL usa-e-getta con fatture e bonifici fittizi
  (multi-fattura, split e acconti, limiti banca/fattura, uscite negative).
- Nessuna visibilità di un utente sulle società di un altro.
- Nessuna chiusura senza conferma, inclusi gli acconti generici.
- Revoca manuale con audit.
- Duplicati CSV e PSD2 non sovrascrivono lo storico.
- Collegamento reale solo con consenso del titolare DEBOX, 
  prima con conto non sensibile o storico prova e verifica contrattuale.
- Conservazione a norma, GDPR, permessi ai collaboratori e audit
  richiedono revisione professionale/legale prima del servizio commerciale.
