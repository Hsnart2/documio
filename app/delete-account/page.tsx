export const metadata = {
  title: "Eliminazione account | DocuMio",
  description: "Come eliminare l’account DocuMio e i dati associati.",
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


export default function DeleteAccountPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26 }}>Eliminazione dell’account DocuMio</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19 luglio 2026</p>

      <div style={noteStyle}>
        DocuMio permette di eliminare direttamente l’account e i dati associati
        dall’interno dell’app.
      </div>

      <h2>Come eliminare l’account nell’app</h2>
      <ol>
        <li>accedi a DocuMio;</li>
        <li>apri <strong>Impostazioni</strong>;</li>
        <li>seleziona <strong>Cancella account</strong>;</li>
        <li>inserisci la password e conferma.</li>
      </ol>

      <h2>Dati eliminati</h2>
      <p>
        La procedura elimina l’account di autenticazione, documenti, allegati,
        pratiche, preferenze e file associati presenti nei sistemi attivi.
      </p>

      <h2>Richiesta senza accesso all’app</h2>
      <p>
        Chi non riesce più ad accedere può inviare una richiesta a
        <strong> [EMAIL ASSISTENZA]</strong> dall’indirizzo email associato
        all’account. Potranno essere richieste informazioni aggiuntive per verificare
        l’identità e prevenire cancellazioni fraudolente.
      </p>

      <h2>Tempi e dati eventualmente conservati</h2>
      <p>
        Le richieste vengono gestite senza ingiustificato ritardo. Eventuali dati
        possono essere conservati soltanto quando necessario per obblighi di legge,
        sicurezza, prevenzione frodi o tutela di diritti, come descritto nella
        Privacy Policy.
      </p>

      <p>
        Per maggiori informazioni consulta la <a href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}
