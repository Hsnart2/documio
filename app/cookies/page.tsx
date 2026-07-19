export const metadata = {
  title: "Cookie Policy | DocuMio",
  description: "Informazioni su cookie e tecnologie locali utilizzate da DocuMio.",
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


export default function CookiesPage() {
  return (
    <main style={pageStyle}>
      <a href="/" style={{ fontWeight: 750 }}>← Torna a DocuMio</a>
      <h1 style={{ marginTop: 26 }}>Cookie Policy</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19 luglio 2026</p>

      <h2>1. Cosa sono cookie e tecnologie locali</h2>
      <p>
        Cookie, local storage e tecnologie analoghe permettono a un sito o a
        un’applicazione web di conservare o leggere informazioni sul dispositivo.
      </p>

      <h2>2. Tecnologie utilizzate da DocuMio</h2>
      <p>
        DocuMio utilizza tecnologie strettamente necessarie per autenticazione,
        sicurezza, mantenimento della sessione, lingua, preferenze, stato delle
        notifiche e funzionamento dell’interfaccia.
      </p>

      <h2>3. Cookie tecnici</h2>
      <p>
        I cookie tecnici e gli strumenti equivalenti sono necessari a fornire il
        servizio richiesto e non richiedono consenso quando utilizzati esclusivamente
        per tale finalità.
      </p>

      <h2>4. Analisi, pubblicità e profilazione</h2>
      <p>
        Alla data dell’ultimo aggiornamento DocuMio non dichiara l’uso di cookie
        pubblicitari o di profilazione. Qualora in futuro vengano introdotti
        strumenti analitici non strettamente necessari, pubblicitari o di
        profilazione, verrà richiesto il consenso preventivo mediante un apposito
        banner e saranno aggiornate questa policy e le relative preferenze.
      </p>

      <h2>5. Gestione tramite browser</h2>
      <p>
        L’utente può cancellare o bloccare cookie e dati locali dalle impostazioni
        del browser. La disabilitazione delle tecnologie necessarie può impedire
        login, salvataggio delle preferenze o corretto funzionamento dell’app.
      </p>

      <h2>6. Contatti</h2>
      <p>Per informazioni: <strong>[EMAIL PRIVACY]</strong>.</p>

      <p style={{ marginTop: 42, color: "#697386" }}>
        Verificare questa pagina ogni volta che vengono aggiunti strumenti di
        analytics, marketing, crash reporting o pubblicità.
      </p>
    </main>
  );
}
