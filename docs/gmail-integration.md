# Integrazione Gmail di DocuMio

Questa prima versione collega Gmail in modalità controllata:

- legge fino a 30 messaggi degli ultimi 14 giorni;
- classifica pagamenti, documenti, appuntamenti, pubblicità e altri messaggi;
- genera un riepilogo della posta;
- consente di archiviare o spostare nel cestino solo dopo conferma esplicita dell'utente;
- non elimina definitivamente alcun messaggio;
- cifra access token e refresh token con AES-256-GCM.

## Variabili Vercel richieste

- `GOOGLE_EMAIL_CLIENT_ID`
- `GOOGLE_EMAIL_CLIENT_SECRET`
- `GOOGLE_EMAIL_REDIRECT_URI` (es. `https://dominio.it/api/email/gmail/callback`)
- `EMAIL_TOKEN_ENCRYPTION_KEY` (32 byte casuali codificati base64)
- `EMAIL_OAUTH_STATE_SECRET` (segreto casuale lungo)
- `NEXT_PUBLIC_APP_URL`

Restano necessarie le variabili Supabase già usate da DocuMio.

## Google Cloud

1. Creare o selezionare il progetto DocuMio.
2. Abilitare Gmail API.
3. Configurare OAuth consent screen.
4. Creare credenziali OAuth Web.
5. Inserire esattamente il redirect URI configurato in Vercel.
6. Durante lo sviluppo mantenere l'app in test e aggiungere gli indirizzi autorizzati.

## Database

Applicare la migrazione:

`supabase/migrations/20260724_email_connections.sql`

## Endpoint

- `POST /api/email/gmail/connect`: restituisce l'URL Google per il consenso.
- `GET /api/email/gmail/callback`: salva i token cifrati.
- `GET /api/email/gmail/inbox`: legge e classifica la posta recente.
- `POST /api/email/gmail/action`: archivia o cestina con `confirmed: true`.

## Sicurezza della prima versione

L'interfaccia dovrà mostrare sempre l'elenco dei messaggi selezionati prima di chiamare l'endpoint di azione. La cancellazione definitiva non è implementata intenzionalmente.
