export const metadata = {
  title: "Privacy Policy | DocuMio",
  description: "Informativa sulla privacy di DocuMio.",
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.7 }}>
      <a href="/" style={{ fontWeight: 700 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 28 }}>Privacy Policy</h1>
      <p><strong>Ultimo aggiornamento:</strong> 17 luglio 2026</p>

      <h2>1. Titolare e finalità</h2>
      <p>
        DocuMio tratta i dati necessari per creare e gestire l’account, archiviare i documenti caricati,
        fornire ricerca e analisi assistite dall’intelligenza artificiale e inviare le notifiche scelte dall’utente.
      </p>

      <h2>2. Dati trattati</h2>
      <p>
        Possono essere trattati indirizzo email, dati tecnici di accesso, preferenze, documenti e allegati caricati,
        metadati estratti dai file e richieste inviate all’assistente.
      </p>

      <h2>3. Conservazione e sicurezza</h2>
      <p>
        I dati vengono conservati per il tempo necessario a fornire il servizio o finché l’account non viene eliminato,
        salvo eventuali obblighi di legge. L’accesso ai contenuti è limitato all’utente autenticato e ai fornitori tecnici
        indispensabili al funzionamento del servizio.
      </p>

      <h2>4. Fornitori tecnici</h2>
      <p>
        DocuMio può utilizzare servizi esterni per autenticazione, database, archiviazione, hosting e funzionalità di IA.
        I dati vengono condivisi solo nella misura necessaria all’erogazione delle rispettive funzioni.
      </p>

      <h2>5. Diritti dell’utente</h2>
      <p>
        L’utente può richiedere accesso, correzione, esportazione o cancellazione dei propri dati e può modificare in ogni
        momento le preferenze relative alle notifiche. La cancellazione dell’account è disponibile nelle Impostazioni.
      </p>

      <h2>6. Versione beta</h2>
      <p>
        DocuMio è in fase beta. Questa informativa potrà essere aggiornata prima del rilascio pubblico definitivo.
        Le modifiche rilevanti saranno comunicate nell’app o tramite email.
      </p>

      <p style={{ marginTop: 40, color: "#697386" }}>
        Nota: questo testo è una base informativa per la beta e deve essere verificato da un professionista prima del lancio commerciale.
      </p>
    </main>
  );
}
