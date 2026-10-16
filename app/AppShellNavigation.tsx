"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  FileText,
  FolderKanban,
  House,
  Landmark,
  Mail,
  Grid2X2,
  X,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type Destination = "home" | "documents" | "practices" | "upload" | "finance" | "email";

type MenuItem = {
  id: Destination;
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof House;
};

const links: MenuItem[] = [
  { id: "home", href: "/", label: "Panoramica", shortLabel: "Home", icon: House },
  { id: "documents", href: "/?view=documents#documio-library", label: "Documenti", shortLabel: "Archivio", icon: FileText },
  { id: "practices", href: "/?view=practices#documio-library", label: "Pratiche", shortLabel: "Pratiche", icon: FolderKanban },
  { id: "upload", href: "/carica", label: "Carica documenti", shortLabel: "Carica", icon: Plus },
  { id: "finance", href: "/controllo", label: "Controllo", shortLabel: "Finanze", icon: Landmark },
  { id: "email", href: "/email", label: "Posta", shortLabel: "Posta", icon: Mail },
];

const supportedRoutes = new Set(["/", "/controllo", "/carica", "/email"]);

function currentHomeTab(): Destination {
  if (typeof window === "undefined") return "home";
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "documents" || view === "practices" ? view : "home";
}

/** Navigazione condivisa: laterale su PC, comoda da raggiungere con il pollice su mobile. */
export default function AppShellNavigation() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [homeTab, setHomeTab] = useState<Destination>("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreWasOpen = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session?.user));
    }).catch(() => { if (active) setSignedIn(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session?.user));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const refresh = () => setHomeTab(currentHomeTab());
    refresh();
    window.addEventListener("popstate", refresh);
    window.addEventListener("documio:view", refresh);
    return () => {
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("documio:view", refresh);
    };
  }, [pathname]);

  // Chiudi il menu quando cambi schermata o premi Esc.
  useEffect(() => { setMoreOpen(false); }, [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);

  useEffect(() => {
    if (moreOpen) {
      moreWasOpen.current = true;
      document.querySelector<HTMLButtonElement>(".dm-mobile-more-close")?.focus();
    } else if (moreWasOpen.current) {
      moreWasOpen.current = false;
      moreTriggerRef.current?.focus();
    }
  }, [moreOpen]);

  const visible = signedIn && supportedRoutes.has(pathname);
  useEffect(() => {
    document.body.classList.toggle("dm-app-nav-visible", visible);
    return () => document.body.classList.remove("dm-app-nav-visible");
  }, [visible]);

  if (!visible) return null;

  const selected: Destination =
    pathname === "/" ? homeTab :
      pathname === "/carica" ? "upload" :
      pathname === "/controllo" ? "finance" : "email";

  function follow(event: MouseEvent<HTMLAnchorElement>, item: MenuItem) {
    // Mantieni la vista archivio/pratiche senza ricaricare la pagina.
    if (pathname !== "/" || !["home", "documents", "practices"].includes(item.id)) return;
    event.preventDefault();
    window.history.pushState(null, "", item.href);
    setHomeTab(item.id);
    window.dispatchEvent(new CustomEvent("documio:navigate", { detail: { view: item.id } }));
    if (item.id === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      requestAnimationFrame(() =>
        document.getElementById("documio-library")?.scrollIntoView({
          behavior: "smooth", block: "start",
        }),
      );
    }
  }

  function renderLink(item: MenuItem, compact: boolean) {
    const Icon = item.icon;
    const active = selected === item.id;
    return (
      <a
        key={item.id}
        href={item.href}
        className={[
          compact ? "dm-mobile-link" : "dm-side-link",
          active ? "is-active" : "",
          item.id === "upload" ? "is-upload" : "",
        ].filter(Boolean).join(" ")}
        aria-current={active ? "page" : undefined}
        aria-label={compact ? item.shortLabel : undefined}
        onClick={(event) => follow(event, item)}
      >
        <span className="dm-nav-icon"><Icon size={compact ? 21 : 19} strokeWidth={active ? 2.5 : 2} /></span>
        <span className="dm-nav-label">{compact ? item.shortLabel : item.label}</span>
        {!compact && active && <span className="dm-active-dot" aria-hidden="true" />}
      </a>
    );
  }

  return (
    <>
      <a href="#dm-main-content" className="dm-skip-link">Vai al contenuto</a>
      <aside className="dm-sidebar" aria-label="Menu di DocuMio">
        <a className="dm-sidebar-brand" href="/" onClick={(event) => follow(event, links[0])}>
          <span className="dm-sidebar-mark"><FileText size={23} /></span>
          <span><strong>DocuMio</strong><small>Il tuo spazio digitale</small></span>
        </a>
        <div className="dm-sidebar-divider" />
        <div className="dm-nav-group-label">LA TUA SCRIVANIA</div>
        <nav className="dm-desktop-links" aria-label="Navigazione principale">
          {links.slice(0, 3).map((link) => renderLink(link, false))}
        </nav>
        <div className="dm-nav-group-label dm-nav-group-second">STRUMENTI</div>
        <nav className="dm-desktop-links" aria-label="Strumenti">
          {links.slice(3).map((link) => renderLink(link, false))}
        </nav>
        <div className="dm-sidebar-spacer" />
        <a className="dm-sidebar-feature" href="/carica">
          <span className="dm-sidebar-feature-icon"><Sparkles size={18} /></span>
          <strong>Archivia più velocemente</strong>
          <small>Carica più documenti in un'unica volta.</small>
          <span className="dm-sidebar-feature-cta">Vai al caricamento <ArrowUpRight size={15}/></span>
        </a>
        <div className="dm-sidebar-private"><ShieldCheck size={16}/> Area privata e protetta</div>
      </aside>
      <nav className="dm-mobile-nav" aria-label="Navigazione principale">
        {[links[0], links[1], links[3], links[4]].map((link) => renderLink(link, true))}
        <button
          type="button"
          className={`dm-mobile-link dm-mobile-more-trigger ${moreOpen || selected === "practices" || selected === "email" ? "is-active" : ""}`}
          ref={moreTriggerRef}
          aria-label="Altre sezioni"
          aria-expanded={moreOpen}
          aria-controls="dm-mobile-more-panel"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className="dm-nav-icon">{moreOpen ? <X size={21} /> : <Grid2X2 size={21} />}</span>
          <span className="dm-nav-label">Altro</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="dm-mobile-more-container">
          <button
            type="button"
            className="dm-mobile-more-scrim"
            aria-label="Chiudi le altre sezioni"
            onClick={() => setMoreOpen(false)}
          />
          <section className="dm-mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="dm-mobile-more-title" id="dm-mobile-more-panel">
            <header>
              <div>
                <small>DOCUMIO</small>
                <h2 id="dm-mobile-more-title">Altre sezioni</h2>
              </div>
              <button type="button" className="dm-mobile-more-close" aria-label="Chiudi menu" onClick={() => setMoreOpen(false)}>
                <X size={20} />
              </button>
            </header>
            <nav aria-label="Altre sezioni di DocuMio">
              <a href={links[2].href} onClick={(event) => { setMoreOpen(false); follow(event, links[2]); }}>
                <span className="dm-more-sheet-icon"><FolderKanban size={21} /></span>
                <span><strong>Pratiche</strong><small>Documenti e attività collegate</small></span>
                <ArrowUpRight size={17} />
              </a>
              <a href={links[5].href} onClick={() => setMoreOpen(false)}>
                <span className="dm-more-sheet-icon"><Mail size={21} /></span>
                <span><strong>Posta intelligente</strong><small>Gestisci e organizza le email</small></span>
                <ArrowUpRight size={17} />
              </a>
            </nav>
            <p><ShieldCheck size={15} /> I tuoi documenti rimangono privati.</p>
          </section>
        </div>
      )}
    </>
  );
}
