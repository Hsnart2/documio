export const metadata = {
  title: "Informativa documenti | DocuMio",
  description: "Regole sul caricamento e trattamento dei documenti in DocuMio.",
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


export default function DocumentsPolicyPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26 }}>Informativa sui documenti caricati</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19 luglio 2026</p>

      <h2>1. Responsabilità dell’utente</h2>
      <p>
        L’utente è responsabile dei file caricati e deve assicurarsi di avere il
        diritto di conservarli e trattarli tramite DocuMio.
      </p>

      <h2>2. Documenti di terzi</h2>
      <p>
        Documenti contenenti dati di familiari, dipendenti, clienti o altri soggetti
        possono essere caricati soltanto quando esiste un’idonea base giuridica,
        autorizzazione o necessità legittima.
      </p>

      <h2>3. Categorie sensibili</h2>
      <p>
        Documenti sanitari, finanziari, fiscali, giudiziari o contenenti credenziali
        richiedono particolare cautela. È consigliato caricare esclusivamente le
        informazioni indispensabili ed evitare password, codici segreti, PIN e dati
        completi di carte di pagamento.
      </p>

      <h2>4. Copie originali</h2>
      <p>
        DocuMio non deve essere utilizzato come unica copia di documenti importanti.
        L’utente deve conservare gli originali o un backup indipendente.
      </p>

      <h2>5. Analisi automatica</h2>
      <p>
        I dati estratti automaticamente possono contenere errori. Titoli, importi,
        scadenze, categorie, appuntamenti e collegamenti devono essere controllati
        rispetto al file originale.
      </p>

      <h2>6. Eliminazione</h2>
      <p>
        L’utente può eliminare singoli documenti oppure cancellare l’intero account.
        La cancellazione definitiva rende i dati non più accessibili dai sistemi
        attivi, fatti salvi eventuali tempi tecnici o obblighi legali.
      </p>

      <h2>7. Contenuti vietati</h2>
      <p>
        È vietato caricare malware, materiale illecito, dati ottenuti abusivamente,
        contenuti che violano diritti di terzi o file destinati a commettere frodi.
      </p>
    </main>
  );
}
