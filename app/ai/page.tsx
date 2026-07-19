export const metadata = {
  title: "Informativa IA | DocuMio",
  description: "Informazioni sulle funzionalità di intelligenza artificiale di DocuMio.",
};


const pageStyle = {
  maxWidth: 920,
  margin: "0 auto",
  padding: "44px 22px 90px",
  lineHeight: 1.72,
  color: "#172033",
} as const;

const cardStyle = {
  padding: "18px 20px",
  border: "1px solid #dfe5ee",
  borderRadius: 16,
  background: "#f8fafc",
} as const;

const noteStyle = {
  padding: "16px 18px",
  borderLeft: "4px solid #4f46e5",
  background: "#eef2ff",
  borderRadius: 10,
} as const;


export default function AiPolicyPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26 }}>Informativa sull’Intelligenza Artificiale</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19 luglio 2026</p>

      <h2>1. Funzioni interessate</h2>
      <p>
        DocuMio può utilizzare modelli di intelligenza artificiale per leggere file,
        estrarre informazioni, proporre titoli e categorie, individuare scadenze,
        creare riassunti, suggerire collegamenti e rispondere a domande sui documenti.
      </p>

      <h2>2. Dati trasmessi</h2>
      <p>
        Quando l’utente avvia una funzione IA, il file o le informazioni necessarie
        possono essere trasmessi al fornitore del modello per generare il risultato.
        DocuMio limita i dati trasmessi a quanto necessario per la richiesta.
      </p>

      <h2>3. Possibili errori</h2>
      <p>
        L’IA può interpretare male testi, cifre, date, nomi, scrittura a mano o
        contesto. Può inoltre produrre informazioni incomplete o errate. I risultati
        sono assistivi e devono essere verificati dall’utente.
      </p>

      <h2>4. Nessuna consulenza professionale</h2>
      <p>
        Le risposte non costituiscono consulenza medica, legale, fiscale,
        assicurativa, finanziaria o professionale. Per decisioni importanti occorre
        consultare un professionista qualificato e verificare il documento originale.
      </p>

      <h2>5. Nessuna decisione automatica con effetti giuridici</h2>
      <p>
        Le funzioni IA non sono progettate per prendere autonomamente decisioni che
        producano effetti giuridici o analogamente significativi sull’utente.
      </p>

      <h2>6. Dati particolari</h2>
      <p>
        Prima di utilizzare l’IA su documenti sanitari o particolarmente sensibili,
        l’utente deve valutare se il caricamento sia necessario e legittimo. Non
        devono essere caricati dati di terzi senza idoneo titolo.
      </p>

      <h2>7. Controllo dell’utente</h2>
      <p>
        L’utente decide quali file caricare e quando richiedere l’analisi. Può
        correggere o eliminare i dati salvati e cancellare definitivamente l’account.
      </p>

      <h2>8. Fornitore tecnologico</h2>
      <p>
        Le funzioni IA possono essere fornite tramite OpenAI o altri fornitori
        indicati nella Privacy Policy. Le condizioni tecniche possono cambiare e
        questa informativa sarà aggiornata di conseguenza.
      </p>
    </main>
  );
}
