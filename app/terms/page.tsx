export const metadata = {
  title: "Termini beta | DocuMio",
  description: "Termini di utilizzo della versione beta di DocuMio.",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.7 }}>
      <a href="/" style={{ fontWeight: 700 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 28 }}>Termini di utilizzo beta</h1>
      <p><strong>Ultimo aggiornamento:</strong> 17 luglio 2026</p>

      <h2>1. Servizio in fase beta</h2>
      <p>
        DocuMio è un servizio sperimentale. Funzioni, interfaccia e disponibilità possono cambiare e possono verificarsi
        errori, interruzioni o risultati incompleti.
      </p>

      <h2>2. Responsabilità dell’utente</h2>
      <p>
        L’utente è responsabile dei file caricati, deve disporre dei diritti necessari per trattarli e deve proteggere le
        proprie credenziali. Non è consentito usare il servizio per contenuti illeciti o per violare diritti di terzi.
      </p>

      <h2>3. Risultati dell’intelligenza artificiale</h2>
      <p>
        Analisi, classificazioni, riepiloghi e risposte generate dall’IA possono contenere errori. Devono essere verificati
        dall’utente e non costituiscono consulenza legale, fiscale, medica o finanziaria.
      </p>

      <h2>4. Documenti e copie di sicurezza</h2>
      <p>
        DocuMio non deve essere considerato l’unica copia dei documenti importanti. Durante la beta l’utente deve conservare
        una copia indipendente dei file originali.
      </p>

      <h2>5. Sospensione e cancellazione</h2>
      <p>
        L’utente può smettere di usare il servizio e cancellare l’account dalle Impostazioni. L’accesso può essere limitato
        in caso di abuso, rischio per la sicurezza o violazione di questi termini.
      </p>

      <h2>6. Limitazione di responsabilità</h2>
      <p>
        Nei limiti consentiti dalla legge, il servizio beta viene fornito senza garanzia di continuità o assenza di errori.
        DocuMio non risponde di decisioni prese esclusivamente sulla base di risultati automatici non verificati.
      </p>

      <p style={{ marginTop: 40, color: "#697386" }}>
        Nota: questi termini sono una bozza per la fase beta e devono essere revisionati da un professionista prima del lancio commerciale.
      </p>
    </main>
  );
}
