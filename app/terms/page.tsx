import type { Metadata } from "next";
import { LegalDocument, Section } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Termini e condizioni | DocuMio",
  description: "Termini e condizioni di utilizzo di DocuMio.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Termini e condizioni"
      subtitle="Versione 1.0 · Ultimo aggiornamento: 24 luglio 2026"
    >
      <p>
        I presenti Termini regolano l’accesso e l’utilizzo di DocuMio, servizio di
        organizzazione, archiviazione, ricerca e analisi assistita di documenti personali
        e professionali.
      </p>

      <Section title="1. Fornitore del servizio">
        <p>
          Il servizio è fornito da <strong>NEXTMIND SOFTWARE DI DE BELLIS DANIELE</strong>,
          impresa individuale, P. IVA 14827340960, REA MB-2809698, con sede in Via Trento
          e Trieste 24, 20822 Seveso (MB), Italia. PEC:
          <a href="mailto:debellisdaniele91@pec.it"> debellisdaniele91@pec.it</a>.
        </p>
      </Section>

      <Section title="2. Accettazione e requisiti">
        <p>
          Creando un account, l’utente dichiara di avere almeno 18 anni, capacità di
          agire e di aver letto e accettato i presenti Termini e la Privacy Policy.
          L’utente è responsabile dell’esattezza dei dati forniti, della sicurezza delle
          proprie credenziali e delle attività effettuate tramite l’account.
        </p>
      </Section>

      <Section title="3. Funzioni di DocuMio">
        <p>
          DocuMio consente, a seconda del piano disponibile, di caricare e organizzare
          documenti, creare pratiche, associare allegati, gestire scadenze, appuntamenti,
          pagamenti e rate, ricevere promemoria e interrogare l’archivio tramite funzioni
          di intelligenza artificiale.
        </p>
      </Section>

      <Section title="4. Prova gratuita e abbonamenti">
        <p>
          Durata della prova, prezzo, periodicità, funzioni incluse, limiti e data del
          primo addebito sono mostrati chiaramente prima dell’attivazione. Salvo diversa
          indicazione, al termine della prova l’abbonamento si rinnova automaticamente
          secondo il piano scelto fino alla disdetta.
        </p>
        <p>
          Gli acquisti effettuati tramite App Store o Google Play sono gestiti dal
          relativo store e soggetti anche alle sue condizioni. L’utente può annullare
          dalle impostazioni dello store o dal canale indicato al momento dell’acquisto.
          L’annullamento impedisce il rinnovo successivo ma non interrompe il periodo già
          pagato o la prova già iniziata, salvo diversa previsione obbligatoria.
        </p>
        <p>
          Prezzi e imposte possono variare per nuovi periodi contrattuali previa
          comunicazione adeguata. Nessun addebito viene effettuato senza un ordine o una
          conferma tramite il sistema di pagamento applicabile.
        </p>
      </Section>

      <Section title="5. Diritto di recesso e rimborsi">
        <p>
          Restano fermi i diritti inderogabili del consumatore. Per contenuti o servizi
          digitali la disciplina del recesso può variare in base all’esecuzione immediata,
          al consenso espresso e al canale d’acquisto. Per acquisti tramite Apple o Google,
          richieste e rimborsi sono gestiti secondo le procedure dello store. Eventuali
          condizioni più favorevoli mostrate durante l’acquisto prevalgono.
        </p>
      </Section>

      <Section title="6. Licenza d’uso">
        <p>
          NextMind Software concede una licenza personale, limitata, non esclusiva, non
          trasferibile e revocabile per utilizzare DocuMio secondo questi Termini. Non è
          consentito copiare, rivendere, decompilare, aggirare misure di sicurezza,
          effettuare scraping massivo o utilizzare il servizio per realizzare prodotti
          concorrenti, salvo quanto inderogabilmente consentito dalla legge.
        </p>
      </Section>

      <Section title="7. Contenuti dell’utente">
        <p>
          L’utente conserva i diritti sui contenuti caricati e concede al fornitore e ai
          responsabili tecnici soltanto le facoltà necessarie a conservarli, elaborarli,
          analizzarli, trasmetterli e mostrarli per erogare il servizio.
        </p>
        <p>
          L’utente garantisce di essere autorizzato a caricare i contenuti e di non
          violare privacy, proprietà intellettuale, segreto professionale o altri diritti.
          È vietato caricare materiale illecito, malware o dati acquisiti abusivamente.
        </p>
      </Section>

      <Section title="8. Dati sanitari e dati di terzi">
        <p>
          L’utente decide autonomamente se caricare documenti contenenti dati sanitari o
          altre categorie particolari. Con il caricamento conferma di essere autorizzato
          e richiede il trattamento necessario alla funzione scelta. Per dati di terzi,
          l’utente resta responsabile della relativa base giuridica e degli obblighi di
          informazione applicabili.
        </p>
      </Section>

      <Section title="9. Intelligenza artificiale">
        <p>
          Classificazioni, riepiloghi, estrazioni, collegamenti, importi, scadenze e
          risposte generate automaticamente possono essere inesatti, incompleti o non
          aggiornati. L’utente deve verificare ogni risultato e il documento originale.
        </p>
        <p>
          DocuMio non fornisce consulenza legale, fiscale, contabile, medica, assicurativa
          o finanziaria e non sostituisce professionisti qualificati.
        </p>
      </Section>

      <Section title="10. Obblighi e utilizzi vietati">
        <ul>
          <li>non compromettere sicurezza, disponibilità o prestazioni del servizio;</li>
          <li>non tentare accessi non autorizzati ad account, dati o infrastrutture;</li>
          <li>non aggirare limiti di piano, controlli o sistemi di pagamento;</li>
          <li>non utilizzare DocuMio per attività illecite, fraudolente o lesive;</li>
          <li>non condividere l’account in modo incompatibile con il piano acquistato.</li>
        </ul>
      </Section>

      <Section title="11. Disponibilità, backup e modifiche">
        <p>
          Il servizio può essere temporaneamente indisponibile per manutenzione, guasti,
          aggiornamenti, sicurezza, forza maggiore o problemi di fornitori terzi.
          L’utente deve conservare una copia indipendente dei documenti indispensabili.
        </p>
        <p>
          Funzioni e interfaccia possono evolvere. Modifiche contrattuali sostanziali
          saranno comunicate con congruo preavviso, salvo urgenze di sicurezza o obblighi
          di legge. Se richiesto, l’uso successivo sarà subordinato all’accettazione della
          nuova versione.
        </p>
      </Section>

      <Section title="12. Sospensione e cessazione">
        <p>
          L’accesso può essere sospeso in caso di violazione dei Termini, rischio per la
          sicurezza, mancato pagamento, abuso o richiesta dell’autorità. Ove possibile,
          sarà fornita comunicazione e possibilità di regolarizzare.
        </p>
        <p>
          L’utente può cancellare l’account dalle Impostazioni. Prima della cancellazione
          deve scaricare i contenuti che intende conservare. Gli effetti sui dati sono
          descritti nella Privacy Policy.
        </p>
      </Section>

      <Section title="13. Proprietà intellettuale">
        <p>
          Software, marchi, interfaccia, testi, grafica, database e componenti di DocuMio
          appartengono a NextMind Software o ai rispettivi licenzianti e sono protetti
          dalla normativa applicabile. Nessun diritto viene trasferito oltre alla licenza
          d’uso espressamente concessa.
        </p>
      </Section>

      <Section title="14. Responsabilità">
        <p>
          Restano impregiudicati i diritti inderogabili dei consumatori e le responsabilità
          che non possono essere escluse per legge. Nei limiti consentiti, il fornitore non
          risponde di danni causati da dati errati inseriti dall’utente, risultati IA non
          verificati, uso improprio, perdita di credenziali, mancata conservazione di copie
          autonome o servizi di terzi fuori dal proprio ragionevole controllo.
        </p>
      </Section>

      <Section title="15. Legge applicabile e controversie">
        <p>
          I Termini sono regolati dalla legge italiana. Per l’utente consumatore resta
          competente il giudice del luogo di residenza o domicilio e restano applicabili
          tutte le tutele inderogabili europee e nazionali. Prima di agire, le parti sono
          invitate a tentare una soluzione bonaria contattando la PEC del fornitore.
        </p>
      </Section>

      <Section title="16. Clausole finali">
        <p>
          L’eventuale invalidità di una clausola non pregiudica le altre. Il mancato
          esercizio di un diritto non costituisce rinuncia. Privacy Policy e Cookie Policy
          sono richiamate per gli aspetti di rispettiva competenza.
        </p>
      </Section>
    </LegalDocument>
  );
}
