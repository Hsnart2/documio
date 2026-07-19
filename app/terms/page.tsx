export const metadata = {
  title: "Termini e Condizioni | DocuMio",
  description: "Termini e condizioni di utilizzo di DocuMio.",
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


export default function TermsPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26, marginBottom: 6 }}>Termini e Condizioni di utilizzo</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19 luglio 2026</p>

      <div style={cardStyle}>
        <p><strong>Fornitore del servizio</strong></p>
        <p>
          [RAGIONE SOCIALE / NOME E COGNOME], con sede in [INDIRIZZO COMPLETO],
          P. IVA/C.F. [DATI], email [EMAIL ASSISTENZA], PEC [PEC].
        </p>
      </div>

      <h2>1. Oggetto</h2>
      <p>
        I presenti Termini regolano l’accesso e l’utilizzo di DocuMio, servizio
        destinato all’organizzazione, archiviazione, ricerca e analisi assistita di
        documenti personali o professionali.
      </p>

      <h2>2. Accettazione</h2>
      <p>
        Creando un account, l’utente dichiara di aver letto e accettato i presenti
        Termini, la Privacy Policy, la Cookie Policy e l’Informativa IA. Chi non
        accetta tali documenti non deve utilizzare il servizio.
      </p>

      <h2>3. Requisiti dell’utente</h2>
      <p>
        L’utente deve avere almeno 18 anni e la capacità di concludere un contratto.
        È responsabile dell’esattezza dei dati forniti, della riservatezza delle
        credenziali e delle attività svolte tramite il proprio account.
      </p>

      <h2>4. Versione gratuita, prova e piani futuri</h2>
      <p>
        DocuMio può essere reso disponibile gratuitamente, in beta, in prova o con
        piani a pagamento. Durata, limiti, prezzi e funzioni applicabili saranno
        mostrati prima dell’adesione. L’introduzione futura di un piano a pagamento
        non comporterà addebiti senza il consenso espresso dell’utente.
      </p>
      <p>
        Prima dell’attivazione di abbonamenti verranno indicati prezzo, periodicità,
        rinnovo, modalità di disdetta, imposte applicabili ed eventuale diritto di
        recesso. Per acquisti effettuati tramite store si applicano anche le
        condizioni di Apple o Google.
      </p>

      <h2>5. Licenza d’uso</h2>
      <p>
        Il fornitore concede una licenza personale, limitata, revocabile, non
        esclusiva e non trasferibile per utilizzare DocuMio secondo i presenti
        Termini. Non è consentito copiare, rivendere, decompilare, aggirare misure di
        sicurezza o utilizzare il servizio per creare prodotti concorrenti, salvo
        quanto inderogabilmente consentito dalla legge.
      </p>

      <h2>6. Contenuti dell’utente</h2>
      <p>
        L’utente mantiene i diritti sui documenti e contenuti caricati. Concede al
        fornitore e ai suoi responsabili tecnici esclusivamente i diritti necessari
        per archiviare, elaborare, analizzare, trasmettere e mostrare tali contenuti
        al fine di erogare il servizio.
      </p>
      <p>
        L’utente garantisce di avere il diritto di caricare i contenuti e di non
        violare privacy, proprietà intellettuale o altri diritti di terzi.
      </p>

      <h2>7. Utilizzi vietati</h2>
      <ul>
        <li>attività illecite, fraudolente o dannose;</li>
        <li>caricamento di malware o contenuti che violano diritti di terzi;</li>
        <li>accesso non autorizzato ad account, dati o sistemi;</li>
        <li>uso massivo o automatizzato non autorizzato;</li>
        <li>tentativi di eludere limiti, controlli o misure di sicurezza;</li>
        <li>uso del servizio come unico archivio di documenti indispensabili.</li>
      </ul>

      <h2>8. Funzioni di intelligenza artificiale</h2>
      <p>
        Classificazioni, riepiloghi, estrazioni, collegamenti e risposte generate
        automaticamente possono essere inesatti, incompleti o non aggiornati.
        L’utente deve verificare ogni risultato prima di utilizzarlo.
      </p>
      <p>
        DocuMio non fornisce consulenza legale, fiscale, medica, assicurativa o
        finanziaria e non sostituisce professionisti qualificati.
      </p>

      <h2>9. Backup e disponibilità</h2>
      <p>
        L’utente deve conservare una copia indipendente dei documenti importanti.
        Nonostante siano adottate misure ragionevoli, il servizio può essere
        temporaneamente indisponibile per manutenzione, guasti, aggiornamenti,
        eventi di forza maggiore o problemi di fornitori terzi.
      </p>

      <h2>10. Modifiche al servizio</h2>
      <p>
        Funzioni, limiti e interfaccia possono essere aggiornati, sostituiti o
        rimossi. Durante la beta possono verificarsi errori e modifiche frequenti.
        Le variazioni contrattuali rilevanti saranno comunicate con congruo preavviso,
        salvo urgenze di sicurezza o obblighi di legge.
      </p>

      <h2>11. Sospensione e chiusura</h2>
      <p>
        L’accesso può essere sospeso in caso di violazione dei Termini, rischio per
        la sicurezza, abuso o richiesta dell’autorità. L’utente può cessare l’uso e
        cancellare l’account dalle Impostazioni.
      </p>

      <h2>12. Effetti della cancellazione</h2>
      <p>
        La cancellazione comporta la perdita dell’accesso ai contenuti e la rimozione
        dei dati associati, salvo eventuali obblighi legali di conservazione. Prima
        di cancellare l’account l’utente deve scaricare ciò che intende conservare.
      </p>

      <h2>13. Proprietà intellettuale</h2>
      <p>
        Software, marchio, interfaccia, testi, grafica e componenti di DocuMio sono
        protetti dalla normativa applicabile e appartengono al fornitore o ai
        rispettivi licenzianti.
      </p>

      <h2>14. Garanzie e responsabilità</h2>
      <p>
        Nei limiti consentiti dalla legge, il servizio è fornito “così com’è” e
        secondo disponibilità. Restano impregiudicati i diritti inderogabili dei
        consumatori. Il fornitore non risponde di errori derivanti da dati inseriti
        dall’utente, risultati IA non verificati, uso improprio o mancata
        conservazione di copie autonome.
      </p>
      <p>
        Nessuna clausola esclude responsabilità che non possa essere esclusa per
        legge, inclusa quella per dolo o colpa grave ove applicabile.
      </p>

      <h2>15. Servizi di terzi</h2>
      <p>
        DocuMio utilizza infrastrutture e servizi di terzi. Il loro funzionamento può
        essere soggetto a condizioni e limitazioni indipendenti dal fornitore.
      </p>

      <h2>16. Assistenza</h2>
      <p>
        Le richieste possono essere inviate a <strong>[EMAIL ASSISTENZA]</strong>.
        Durante la beta non è garantito un tempo minimo di risposta, salvo diverso
        accordo scritto.
      </p>

      <h2>17. Legge applicabile e controversie</h2>
      <p>
        I Termini sono regolati dalla legge italiana. Per gli utenti consumatori
        resta competente il giudice del luogo di residenza o domicilio del
        consumatore e restano applicabili le tutele inderogabili previste dalla
        normativa europea e nazionale.
      </p>

      <h2>18. Clausole finali</h2>
      <p>
        L’eventuale invalidità di una clausola non pregiudica le altre. Il mancato
        esercizio di un diritto non costituisce rinuncia. I titoli hanno funzione
        descrittiva.
      </p>

      <p style={{ marginTop: 42, color: "#697386" }}>
        Completare tutti i campi tra parentesi quadre e sottoporre il documento a
        revisione professionale prima dell’avvio di abbonamenti o del lancio
        commerciale.
      </p>
    </main>
  );
}
