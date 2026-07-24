import type { Metadata } from "next";
import { LegalDocument, Section } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Cookie Policy | DocuMio",
  description: "Informativa su cookie e strumenti tecnici utilizzati da DocuMio.",
};

export default function CookiePage() {
  return (
    <LegalDocument
      title="Cookie Policy"
      subtitle="Versione 1.0 · Ultimo aggiornamento: 24 luglio 2026"
    >
      <p>
        Questa pagina descrive l’uso di cookie, memoria locale e tecnologie analoghe nel
        servizio DocuMio. Alla data di questa versione, DocuMio utilizza strumenti tecnici
        necessari al funzionamento, alla sicurezza e alle preferenze dell’utente e non
        utilizza cookie pubblicitari o di profilazione propri.
      </p>

      <Section title="1. Cosa sono cookie e strumenti analoghi">
        <p>
          I cookie sono piccoli file memorizzati dal browser. Tecnologie analoghe includono
          local storage, session storage, token di autenticazione, identificatori tecnici e
          dati salvati dall’applicazione sul dispositivo.
        </p>
      </Section>

      <Section title="2. Strumenti tecnici utilizzati">
        <ul>
          <li><strong>Autenticazione e sessione:</strong> mantengono l’accesso e proteggono l’account;</li>
          <li><strong>Sicurezza:</strong> supportano controlli degli accessi, prevenzione di abusi e integrità della sessione;</li>
          <li><strong>Preferenze:</strong> memorizzano lingua, email ricordata, impostazioni delle notifiche e stato dell’interfaccia;</li>
          <li><strong>Passkey e Face ID:</strong> conservano sul dispositivo l’indicazione che l’accesso rapido è stato attivato; i dati biometrici restano nel sistema operativo;</li>
          <li><strong>Funzionamento dell’app:</strong> consentono di ricordare notifiche lette e scelte strettamente necessarie.</li>
        </ul>
      </Section>

      <Section title="3. Base giuridica">
        <p>
          Gli strumenti strettamente necessari sono utilizzati per fornire il servizio
          richiesto e non richiedono consenso preventivo. L’utente riceve comunque questa
          informativa. Eventuali strumenti analytics non strettamente necessari,
          profilazione o pubblicità saranno attivati soltanto dopo consenso valido e dopo
          aggiornamento della presente Policy e dell’interfaccia di scelta.
        </p>
      </Section>

      <Section title="4. Durata indicativa">
        <ul>
          <li>token e cookie di sessione: per la durata della sessione o secondo la scadenza di sicurezza impostata dal fornitore di autenticazione;</li>
          <li>preferenza lingua ed email ricordata: fino alla cancellazione da parte dell’utente o dei dati del sito;</li>
          <li>preferenze notifiche e stato locale: fino alla modifica, disattivazione o cancellazione dei dati del browser;</li>
          <li>indicatori passkey/Face ID: fino alla disattivazione della funzione o cancellazione dei dati locali.</li>
        </ul>
      </Section>

      <Section title="5. Terze parti">
        <p>
          Supabase e Vercel possono utilizzare identificatori tecnici o log strettamente
          necessari per autenticazione, sicurezza, hosting e distribuzione. I relativi
          trattamenti sono descritti nella Privacy Policy. I servizi esterni non necessari
          non vengono caricati per finalità pubblicitarie senza il consenso dell’utente.
        </p>
      </Section>

      <Section title="6. Come gestire i dati locali">
        <p>
          L’utente può cancellare cookie e dati del sito dalle impostazioni del browser o
          del sistema operativo. La rimozione di dati tecnici può comportare disconnessione,
          perdita delle preferenze o necessità di riattivare Face ID/passkey.
        </p>
      </Section>

      <Section title="7. Aggiornamenti">
        <p>
          Se verranno introdotti analytics, strumenti di marketing o altre tecnologie non
          tecniche, DocuMio aggiornerà questa Policy e mostrerà un pannello che consenta di
          accettare, rifiutare e modificare le preferenze con la stessa facilità.
        </p>
      </Section>
    </LegalDocument>
  );
}
