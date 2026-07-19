export const metadata = {
  title: "Privacy Policy | DocuMio",
  description: "Informativa sul trattamento dei dati personali di DocuMio.",
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


export default function PrivacyPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26, marginBottom: 6 }}>Privacy Policy</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19 luglio 2026</p>

      <div style={cardStyle}>
        <p><strong>Titolare del trattamento</strong></p>
        <p>
          [RAGIONE SOCIALE / NOME E COGNOME], con sede in [INDIRIZZO COMPLETO],
          codice fiscale/partita IVA [DATI], email privacy [EMAIL PRIVACY],
          PEC [PEC, SE DISPONIBILE] (di seguito, “Titolare”).
        </p>
      </div>

      <p style={{ ...noteStyle, marginTop: 22 }}>
        Questa informativa descrive come DocuMio tratta i dati personali degli
        utenti ai sensi del Regolamento (UE) 2016/679 (“GDPR”) e della normativa
        italiana applicabile.
      </p>

      <h2>1. Ambito di applicazione</h2>
      <p>
        La presente informativa riguarda l’applicazione e il servizio web DocuMio,
        che consentono di creare un account, caricare e organizzare documenti,
        gestire allegati e pratiche, ricevere promemoria e utilizzare funzioni di
        ricerca e analisi assistite dall’intelligenza artificiale.
      </p>

      <h2>2. Categorie di dati trattati</h2>
      <ul>
        <li>dati identificativi e di contatto, in particolare indirizzo email;</li>
        <li>dati di autenticazione e sicurezza dell’account;</li>
        <li>documenti, immagini, allegati e contenuti caricati volontariamente;</li>
        <li>metadati estratti dai documenti, quali titolo, categoria, importi, date e scadenze;</li>
        <li>dati relativi a pratiche, pagamenti, appuntamenti e preferenze;</li>
        <li>richieste inviate all’assistente e risultati generati dall’IA;</li>
        <li>dati tecnici essenziali, log di sicurezza e informazioni sul dispositivo/browser;</li>
        <li>eventuali comunicazioni inviate all’assistenza.</li>
      </ul>

      <h2>3. Dati particolari e documenti sensibili</h2>
      <p>
        I file caricati possono contenere dati particolari ai sensi dell’articolo 9
        GDPR, ad esempio informazioni sanitarie, nonché dati finanziari, familiari,
        fiscali o giudiziari. DocuMio non richiede tali dati come condizione generale
        di utilizzo, ma li tratta quando l’utente decide volontariamente di caricarli
        per usufruire del servizio.
      </p>
      <p>
        L’utente deve caricare esclusivamente dati propri o dati di terzi per i quali
        dispone di un’idonea base giuridica, autorizzazione o altro titolo legittimo.
      </p>

      <h2>4. Finalità e basi giuridiche</h2>
      <ul>
        <li>
          <strong>Erogazione del servizio e gestione dell’account:</strong> esecuzione
          del contratto o di misure precontrattuali richieste dall’utente.
        </li>
        <li>
          <strong>Archiviazione, ricerca, classificazione e gestione documentale:</strong>
          esecuzione del contratto.
        </li>
        <li>
          <strong>Analisi tramite IA richiesta dall’utente:</strong> esecuzione del
          contratto; per eventuali dati particolari, trattamento necessario per
          fornire la funzione espressamente richiesta dall’utente, ferma la necessità
          di un’idonea condizione ai sensi dell’articolo 9 GDPR.
        </li>
        <li>
          <strong>Promemoria e notifiche facoltative:</strong> esecuzione del servizio
          richiesto e, quando necessario, consenso dell’utente.
        </li>
        <li>
          <strong>Sicurezza, prevenzione abusi e difesa dei diritti:</strong> legittimo
          interesse del Titolare e adempimento di obblighi di legge.
        </li>
        <li>
          <strong>Comunicazioni commerciali future:</strong> esclusivamente previo
          consenso separato, revocabile in ogni momento.
        </li>
      </ul>

      <h2>5. Modalità del trattamento e sicurezza</h2>
      <p>
        I dati sono trattati con strumenti informatici secondo principi di liceità,
        correttezza, trasparenza, minimizzazione, integrità e riservatezza. Sono
        adottate misure tecniche e organizzative ragionevoli, tra cui autenticazione,
        controllo degli accessi, separazione dei dati per utente, collegamenti cifrati
        e archiviazione privata. Nessun sistema informatico può tuttavia garantire
        sicurezza assoluta.
      </p>

      <h2>6. Fornitori e destinatari</h2>
      <p>I dati possono essere trattati, nei limiti necessari, da fornitori tecnici quali:</p>
      <ul>
        <li><strong>Supabase</strong>, per autenticazione, database e archiviazione;</li>
        <li><strong>Vercel</strong>, per hosting e distribuzione dell’applicazione;</li>
        <li><strong>OpenAI</strong>, per le funzioni di analisi e assistenza basate sull’IA;</li>
        <li><strong>fornitori email</strong>, se e quando utilizzati per conferme, sicurezza e notifiche;</li>
        <li>consulenti e autorità pubbliche, quando previsto dalla legge.</li>
      </ul>
      <p>
        Tali soggetti operano, a seconda dei casi, come responsabili del trattamento,
        sub-responsabili o autonomi titolari. L’elenco aggiornato dei fornitori può
        essere richiesto all’indirizzo privacy indicato sopra.
      </p>

      <h2>7. Trasferimenti fuori dallo Spazio economico europeo</h2>
      <p>
        Alcuni fornitori possono trattare dati in Paesi esterni allo Spazio economico
        europeo. In tali casi il trasferimento avviene sulla base di una decisione di
        adeguatezza, delle Clausole Contrattuali Standard approvate dalla Commissione
        europea o di altro strumento previsto dal GDPR, con eventuali misure
        supplementari ove necessarie.
      </p>

      <h2>8. Conservazione</h2>
      <ul>
        <li>
          account e contenuti: fino alla cancellazione dell’account o alla cessazione
          del servizio, salvo obblighi di legge;
        </li>
        <li>
          dati eliminati dall’utente: rimossi dai sistemi attivi senza ingiustificato
          ritardo, compatibilmente con tempi tecnici e copie di sicurezza;
        </li>
        <li>
          log di sicurezza: per il tempo strettamente necessario alla prevenzione di
          frodi, abusi e incidenti;
        </li>
        <li>
          dati fiscali o di pagamento futuri: per i periodi imposti dalla normativa;
        </li>
        <li>
          richieste di assistenza: per il tempo necessario alla gestione e tutela dei
          diritti.
        </li>
      </ul>

      <h2>9. Cancellazione dell’account</h2>
      <p>
        L’utente può cancellare direttamente l’account dalle Impostazioni. La procedura
        elimina l’account e i dati associati presenti nei sistemi attivi, inclusi
        documenti, allegati, pratiche e preferenze, salvo dati che debbano essere
        conservati per obblighi normativi, sicurezza, prevenzione frodi o tutela
        giudiziaria. È inoltre disponibile la pagina <a href="/delete-account">Eliminazione account</a>.
      </p>

      <h2>10. Diritti dell’interessato</h2>
      <p>
        Nei casi previsti dagli articoli 15-22 GDPR, l’utente può chiedere accesso,
        rettifica, cancellazione, limitazione, portabilità, opposizione e revoca del
        consenso. La revoca non pregiudica la liceità del trattamento precedente.
        Le richieste possono essere inviate a [EMAIL PRIVACY].
      </p>
      <p>
        L’utente ha inoltre diritto di proporre reclamo al Garante per la protezione
        dei dati personali o all’autorità di controllo competente del proprio Stato.
      </p>

      <h2>11. Minori</h2>
      <p>
        DocuMio non è destinato a minori di 18 anni, salvo utilizzo sotto la
        responsabilità di un genitore o tutore e nel rispetto della normativa
        applicabile. Il Titolare può richiedere verifiche o cancellare account creati
        in violazione di questa regola.
      </p>

      <h2>12. Decisioni automatizzate</h2>
      <p>
        DocuMio utilizza sistemi automatici per classificare, riassumere e ricercare
        documenti. Tali risultati non producono di per sé effetti giuridici o
        analogamente significativi sull’utente. Le decisioni importanti devono essere
        sempre verificate da una persona.
      </p>

      <h2>13. Modifiche</h2>
      <p>
        La presente informativa può essere aggiornata per modifiche normative,
        tecniche o organizzative. Le variazioni sostanziali saranno comunicate
        tramite l’app, il sito o email, ove appropriato.
      </p>

      <h2>14. Contatti</h2>
      <p>
        Per domande o richieste privacy: <strong>[EMAIL PRIVACY]</strong>.
      </p>

      <p style={{ marginTop: 42, color: "#697386" }}>
        Prima della pubblicazione commerciale devono essere completati tutti i campi
        tra parentesi quadre e il testo deve essere verificato rispetto alla struttura
        societaria, ai contratti con i fornitori e ai flussi tecnici effettivi.
      </p>
    </main>
  );
}
