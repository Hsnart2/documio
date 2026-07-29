export const metadata = {
  title: "Sicurezza | DocuMio",
  description: "Panoramica delle misure di sicurezza e protezione dei dati di DocuMio.",
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
  marginBottom: 16,
} as const;

export default function SecurityPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26, marginBottom: 6 }}>Sicurezza e protezione dei dati</h1>
      <p><strong>Ultimo aggiornamento:</strong> 29 luglio 2026</p>

      <div style={cardStyle}>
        <h2>Accesso e autenticazione</h2>
        <p>
          DocuMio utilizza autenticazione individuale tramite Supabase Auth. Le sessioni
          sono associate al singolo account e le credenziali non vengono memorizzate in
          chiaro dall’applicazione.
        </p>
      </div>

      <div style={cardStyle}>
        <h2>Separazione dei dati</h2>
        <p>
          I dati applicativi sono associati all’identificativo dell’utente. Le regole di
          accesso del database sono progettate per impedire a un account di leggere o
          modificare documenti appartenenti ad altri utenti.
        </p>
      </div>

      <div style={cardStyle}>
        <h2>Archiviazione privata</h2>
        <p>
          Documenti e allegati sono conservati in aree private. Quando un file deve essere
          visualizzato viene generato un collegamento temporaneo con durata limitata.
        </p>
      </div>

      <div style={cardStyle}>
        <h2>Cifratura delle comunicazioni</h2>
        <p>
          Le comunicazioni tra browser, applicazione e fornitori tecnici avvengono tramite
          connessioni HTTPS/TLS. I fornitori infrastrutturali applicano inoltre le proprie
          misure di sicurezza fisica e logica.
        </p>
      </div>

      <div style={cardStyle}>
        <h2>Intelligenza artificiale</h2>
        <p>
          Le funzioni IA vengono eseguite solo quando richieste dall’utente. I risultati
          automatici possono contenere errori e devono essere verificati prima di assumere
          decisioni legali, fiscali, mediche, assicurative o finanziarie.
        </p>
      </div>

      <div style={cardStyle}>
        <h2>Responsabilità dell’utente</h2>
        <p>
          È importante usare una password unica, non condividere l’account, proteggere il
          dispositivo e conservare una copia indipendente dei documenti indispensabili.
        </p>
      </div>

      <div style={cardStyle}>
        <h2>Segnalazioni</h2>
        <p>
          Per segnalazioni di sicurezza o privacy è possibile scrivere a
          <strong> nextmindsoftware@pec.it</strong>. Non inviare password, codici di accesso
          o documenti sensibili non necessari alla segnalazione.
        </p>
      </div>

      <p style={{ marginTop: 32 }}>
        Consulta anche la <a href="/privacy">Privacy Policy</a>, la <a href="/cookie">Cookie Policy</a>
        e i <a href="/terms">Termini e condizioni</a>.
      </p>
    </main>
  );
}
