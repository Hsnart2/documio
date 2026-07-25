# Notifiche Web Push DocuMio

DocuMio resta una web app, ma con manifest, Service Worker e Web Push può essere installato sulla schermata Home e ricevere notifiche anche quando è chiuso.

## 1. Migrazione Supabase

Eseguire nel SQL Editor:

`supabase/migrations/20260725_web_push_notifications.sql`

La migrazione crea:

- `push_subscriptions`: un record per ciascun dispositivo autorizzato;
- `push_deliveries`: coda privata delle consegne;
- `automation_notifications.push_sent_at`: protezione dai duplicati.

## 2. Generare le chiavi VAPID

Sul progetto locale:

```bash
npm run vapid:generate
```

Il comando stampa tre variabili. La chiave privata non deve essere salvata nel repository.

## 3. Variabili Vercel

Aggiungere in Production, Preview e Development:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`, per esempio `mailto:nome@dominio.it`

Dopo il salvataggio eseguire un nuovo deploy.

## 4. Attivazione sul dispositivo

Dalle Impostazioni di DocuMio premere **Attiva notifiche push**.

Su iPhone/iPad la web app deve prima essere aggiunta alla schermata Home da Safari e aperta dalla nuova icona. Il permesso notifiche viene richiesto soltanto dopo il tocco sul pulsante.

## Sicurezza

Il servizio push del browser riceve un segnale vuoto. Titolo, testo, documento e collegamenti vengono recuperati direttamente da DocuMio tramite una chiave derivata dalla sottoscrizione del dispositivo. I documenti non vengono inviati ai servizi push.
