"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  FileText,
  FolderKanban,
  House,
  Landmark,
  Mail,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type Destination = "home" | "documents" | "practices" | "upload" | "finance" | "email" | "companies";

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
  { id: "companies", href: "/aziende", label: "Le mie aziende", shortLabel: "Aziende", icon: Building2 },
  { id: "email", href: "/email", label: "Posta", shortLabel: "Posta", icon: Mail },
];

const supportedRoutes = new Set(["/", "/controllo", "/carica", "/email", "/aziende"]);

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

  const visible = signedIn && supportedRoutes.has(pathname);
  useEffect(() => {
    document.body.classList.toggle("dm-app-nav-visible", visible);
    return () => document.body.classList.remove("dm-app-nav-visible");
  }, [visible]);

  if (!visible) return null;

  const selected: Destination =
    pathname === "/" ? homeTab :
      pathname === "/carica" ? "upload" :
      pathname === "/controllo" ? "finance" :
      pathname === "/aziende" ? "companies" : "email";

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
        {[links[0],links[1],links[3],links[4],links[5]].map((link)=>renderLink(link,true))}
      </nav>
    </>
  );
}
