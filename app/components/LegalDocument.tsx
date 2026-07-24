import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f7fb",
        color: "#111827",
        padding: "32px 18px 64px",
      }}
    >
      <article
        style={{
          width: "min(920px, 100%)",
          margin: "0 auto",
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: "clamp(22px, 5vw, 54px)",
          boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
          lineHeight: 1.65,
        }}
      >
        <nav
          aria-label="Documenti legali"
          style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 30 }}
        >
          <Link href="/">DocuMio</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Termini e condizioni</Link>
          <Link href="/cookie">Cookie Policy</Link>
        </nav>

        <header style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 24 }}>
          <p style={{ margin: 0, color: "#4f46e5", fontWeight: 800 }}>
            DocuMio · NextMind Software
          </p>
          <h1
            style={{
              margin: "10px 0 12px",
              fontSize: "clamp(34px, 7vw, 58px)",
              lineHeight: 1.05,
            }}
          >
            {title}
          </h1>
          <p style={{ margin: 0, color: "#64748b" }}>{subtitle}</p>
        </header>

        <div className="legal-content" style={{ marginTop: 30 }}>
          {children}
        </div>

        <footer
          style={{
            borderTop: "1px solid #e5e7eb",
            marginTop: 42,
            paddingTop: 24,
            color: "#64748b",
            fontSize: 14,
          }}
        >
          <strong>NEXTMIND SOFTWARE DI DE BELLIS DANIELE</strong>
          <br />
          Impresa individuale · P. IVA 14827340960 · REA MB-2809698
          <br />
          Via Trento e Trieste 24, 20822 Seveso (MB), Italia
          <br />
          PEC: <a href="mailto:debellisdaniele91@pec.it">debellisdaniele91@pec.it</a>
        </footer>
      </article>
    </main>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: 24, lineHeight: 1.25, marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}
