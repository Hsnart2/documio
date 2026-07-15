# Documio — prototipo iniziale

Una web app installabile pensata per organizzare e trovare documenti personali e aziendali.

## Cosa funziona già

- Dashboard responsive per computer e telefono
- Categorie documenti
- Ricerca immediata
- Caricamento PDF o fotografia
- Classificazione base automatica
- Salvataggio locale nel browser
- Analisi AI facoltativa tramite OpenAI API
- Base Supabase e schema di sicurezza inclusi

> In questa prima versione il file vero non viene ancora caricato online: viene salvata localmente la scheda del documento. È una scelta intenzionale per testare subito l’esperienza senza configurazioni complesse.

## Avvio

1. Installa Node.js.
2. Apri questa cartella in Visual Studio Code.
3. Apri il terminale e lancia:

```bash
npm install
npm run dev
```

4. Apri `http://localhost:3000`.

## Attivare l’AI

Copia `.env.example` in `.env.local` e inserisci:

```env
OPENAI_API_KEY=la_tua_chiave
```

Poi riavvia `npm run dev`.

La prima integrazione AI classifica il documento usando nome file e nota dell’utente. Nella fase successiva collegheremo la lettura effettiva del PDF e delle immagini.

## Collegare Supabase

1. Crea un progetto Supabase.
2. Copia URL e chiave anonima in `.env.local`.
3. Esegui `supabase/schema.sql` nell’editor SQL di Supabase.
4. Crea un bucket privato chiamato `documents`.

## Prossimo passo consigliato

Aggiungere autenticazione, caricamento privato dei file su Supabase Storage e lettura reale dei PDF tramite OpenAI.
