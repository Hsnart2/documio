import type { Metadata } from "next";
import { LegalDocument, Section } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy | DocuMio",
  description: "Informativa sul trattamento dei dati personali di DocuMio.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      subtitle="Informativa ai sensi degli articoli 12, 13 e 14 del Regolamento (UE) 2016/679 · Versione 1.0 · Ultimo aggiornamento: 24 luglio 2026"
    >
      <p>
        La presente informativa descrive il trattamento dei dati personali effettuato
        attraverso DocuMio, servizio web e futura applicazione mobile per archiviare,
        organizzare, ricercare e analizzare documenti, pratiche, allegati, pagamenti,
        appuntamenti e scadenze.
      </p>

      <Section title="1. Titolare del trattamento">
        <p>
          Il titolare è <strong>NEXTMIND SOFTWARE DI DE BELLIS DANIELE</strong>, impresa
          individuale, P. IVA 14827340960, REA MB-2809698, con sede in Via Trento e
          Trieste 24, 20822 Seveso (MB), Italia. Contatto privacy e richieste degli
          interessati: <a href="mailto:debellisdaniele91@pec.it">debellisdaniele91@pec.it</a>.
        </p>
        <p>
          Non è attualmente nominato un Responsabile della protezione dei dati (DPO),
          non ricorrendo allo stato i presupposti obbligatori. La valutazione sarà
          riesaminata in caso di variazione della scala o della natura dei trattamenti.
        </p>
      </Section>

      <Section title="2. Categorie di dati">
        <ul>
          <li>dati identificativi e di contatto, account e autenticazione;</li>
          <li>documenti, PDF, fotografie, allegati, note e pratiche caricati volontariamente;</li>
          <li>titoli, categorie, riassunti, parole chiave, date, importi e altri metadati estratti;</li>
          <li>dati economici, fiscali, contrattuali, assicurativi, familiari e professionali;</li>
          <li>dati relativi a pagamenti, rate, appuntamenti, promemoria e notifiche;</li>
          <li>richieste rivolte all’assistente e risposte generate;</li>
          <li>indirizzo IP, log tecnici e di sicurezza, dispositivo, sessioni e preferenze;</li>
          <li>eventuali categorie particolari di dati ai sensi dell’art. 9 GDPR, inclusi dati sanitari, quando l’utente decide di caricarli.</li>
        </ul>
        <p>
          L’utente deve caricare soltanto dati propri o dati di terzi che è autorizzato
          a trattare, evitando informazioni eccedenti o non necessarie.
        </p>
      </Section>

      <Section title="3. Finalità e basi giuridiche">
        <ul>
          <li><strong>Account ed erogazione del servizio:</strong> esecuzione del contratto e misure precontrattuali.</li>
          <li><strong>Archiviazione, ricerca, pratiche e promemoria:</strong> esecuzione delle funzioni richieste dall’utente.</li>
          <li><strong>Analisi tramite IA:</strong> esecuzione del servizio richiesto; i risultati devono essere verificati dall’utente.</li>
          <li><strong>Dati particolari:</strong> consenso esplicito dell’utente al trattamento strettamente necessario per analizzare il file che sceglie di caricare, revocabile per il futuro cancellando il contenuto e tramite richiesta al titolare.</li>
          <li><strong>Sicurezza, prevenzione di abusi e tutela dei diritti:</strong> obbligo legale e legittimo interesse del titolare.</li>
          <li><strong>Fatturazione e abbonamenti:</strong> esecuzione del contratto e obblighi fiscali e contabili.</li>
          <li><strong>Email operative e notifiche:</strong> esecuzione del servizio; le comunicazioni promozionali richiederanno consenso separato.</li>
        </ul>
      </Section>

      <Section title="4. Intelligenza artificiale e controllo umano">
        <p>
          I file selezionati possono essere trasmessi in forma cifrata a fornitori di
          servizi IA per estrarre informazioni, creare riepiloghi, proporre collegamenti
          e rispondere alle domande dell’utente. Gli output possono essere inesatti o
          incompleti e non sostituiscono commercialisti, avvocati, medici o altri
          professionisti qualificati.
        </p>
        <p>
          DocuMio non assume decisioni con effetti giuridici o analogamente significativi
          basate unicamente su trattamenti automatizzati.
        </p>
      </Section>

      <Section title="5. Fornitori e destinatari">
        <p>I dati possono essere trattati, nella misura necessaria, dai seguenti fornitori:</p>
        <ul>
          <li><strong>Supabase:</strong> autenticazione, database e Storage privato;</li>
          <li><strong>Vercel:</strong> hosting, distribuzione e log tecnici;</li>
          <li><strong>OpenAI:</strong> analisi IA e assistente documentale;</li>
          <li><strong>Resend:</strong> invio di email operative e notifiche, quando attive;</li>
          <li><strong>iLovePDF:</strong> compressione tecnica facoltativa dei PDF, quando configurata;</li>
          <li><strong>Apple, Google o altro prestatore di pagamento:</strong> acquisti, prove, rinnovi e rimborsi.</li>
        </ul>
        <p>
          Possono inoltre ricevere dati consulenti vincolati alla riservatezza e autorità
          pubbliche nei casi previsti dalla legge. I dati non vengono venduti.
        </p>
      </Section>

      <Section title="6. Trasferimenti internazionali">
        <p>
          Alcuni fornitori possono trattare dati fuori dallo Spazio Economico Europeo.
          Il trasferimento avviene mediante decisioni di adeguatezza, Data Privacy
          Framework UE-USA quando applicabile, Clausole Contrattuali Standard o altra
          garanzia prevista dagli articoli 44 e seguenti GDPR.
        </p>
      </Section>

      <Section title="7. Conservazione">
        <ul>
          <li>account, documenti, pratiche e allegati: fino alla cancellazione da parte dell’utente o alla chiusura dell’account;</li>
          <li>file temporanei per l’analisi: eliminati al termine dell’elaborazione, salvo tempi tecnici di recupero da errori;</li>
          <li>log di sicurezza: per un periodo proporzionato, normalmente non superiore a 12 mesi, salvo incidenti o controversie;</li>
          <li>dati fiscali e contabili: per il periodo imposto dalla legge;</li>
          <li>consensi e versioni legali: per il tempo necessario a dimostrare la conformità e gestire contestazioni.</li>
        </ul>
      </Section>

      <Section title="8. Sicurezza e biometria">
        <p>
          Sono adottati autenticazione, separazione dei dati per utente, Row Level
          Security, bucket privati, URL firmati a breve durata, cifratura in transito,
          controlli sugli accessi e cancellazione coordinata di record e file.
        </p>
        <p>
          Face ID, Touch ID e sistemi analoghi sono gestiti dal dispositivo tramite
          passkey o funzioni del sistema operativo: DocuMio non riceve né conserva
          immagini del volto o impronte digitali.
        </p>
      </Section>

      <Section title="9. Diritti dell’interessato">
        <p>
          L’utente può esercitare, quando applicabili, accesso, rettifica, cancellazione,
          limitazione, portabilità, opposizione e revoca del consenso. Può inoltre
          proporre reclamo al Garante per la protezione dei dati personali. Le richieste
          vanno inviate alla PEC del titolare; potranno essere chieste informazioni per
          verificare l’identità del richiedente.
        </p>
      </Section>

      <Section title="10. Cancellazione ed esportazione">
        <p>
          L’utente può eliminare documenti, allegati e account dalle funzioni disponibili.
          La cancellazione rimuove i dati dai sistemi attivi, salvo informazioni da
          conservare per legge, sicurezza o tutela di diritti. Prima della cancellazione
          è consigliato scaricare una copia dei documenti necessari.
        </p>
      </Section>

      <Section title="11. Minori">
        <p>
          DocuMio non è destinato autonomamente a minori di 18 anni. Un adulto può
          archiviare documenti familiari soltanto se ne ha titolo e nel rispetto della
          minimizzazione dei dati.
        </p>
      </Section>

      <Section title="12. Cookie e modifiche">
        <p>
          Per cookie, memoria locale e strumenti analoghi si rinvia alla Cookie Policy.
          Modifiche sostanziali a questa informativa saranno comunicate con mezzi adeguati
          e, quando necessario, sarà richiesta una nuova accettazione o un nuovo consenso.
        </p>
      </Section>
    </LegalDocument>
  );
}
