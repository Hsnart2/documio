import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const navigation = read("../app/AppShellNavigation.tsx");
const layout = read("../app/layout.tsx");
const home = read("../app/page.tsx");
const smartHome = read("../app/SmartHomeV2.tsx");
const styles = read("../app/documio-ui.css");

test("La navigazione contiene solo link a pagine reali dell'app", () => {
  const entries = [...navigation.matchAll(/id: "(home|documents|practices|upload|finance|email|companies|professionals)", href: "([^"]+)"/g)]
    .map((m) => [m[1], m[2]]);
  assert.deepEqual(entries, [
    ["home", "/"],
    ["documents", "/?view=documents#documio-library"],
    ["practices", "/?view=practices#documio-library"],
    ["upload", "/carica"],
    ["finance", "/controllo"],
    ["companies", "/aziende"],
    ["email", "/email"],
    ["professionals", "/professionisti"],
  ]);
  assert.equal(new Set(entries.map((entry) => entry[0])).size, 8);
  assert.match(navigation, /signedIn && supportedRoutes\.has\(pathname\)/);
  assert.match(navigation, /onAuthStateChange/);
  assert.match(navigation, /aria-current/);
  assert.match(navigation, /aria-label="Navigazione principale"/);
});

test("Archivio e pratiche sono raggiungibili e sincronizzati dal menu", () => {
  assert.match(home, /id="documio-library"/);
  assert.match(home, /documio:navigate/);
  assert.match(home, /documio:view/);
  assert.match(home, /aria-pressed=\{activeView === "documents"\}/);
  assert.match(home, /aria-pressed=\{activeView === "practices"\}/);
  assert.match(home, /className="dm-quick-actions"/);
  assert.match(home, /id="dm-main-content"/);
  assert.match(smartHome, /aria-pressed=\{activeCard === card\.key\}/);
  assert.match(smartHome, /id="dm-home-insights"/);
});

test("Il menu rispetta schermi desktop, tablet e safe area smartphone", () => {
  assert.match(styles, /min-width:\s*1160px/);
  assert.match(styles, /max-width:\s*1159px/);
  assert.match(styles, /max-width:\s*720px/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /:has\(\.modal-backdrop\)/);
  assert.match(styles, /advanced-email-automation/);
  assert.match(layout, /<AppShellNavigation \/>/);
  assert.match(navigation, /\/aziende/);
  assert.match(navigation, /\/professionisti/);
  assert.match(layout, /import "\.\/documio-ui\.css";/);
});

test("Componenti JSX senza errori sintattici", () => {
  const paths = ["../app/AppShellNavigation.tsx","../app/page.tsx","../app/SmartHomeV2.tsx","../app/layout.tsx"];
  for (const path of paths) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    assert.equal(source.parseDiagnostics.length, 0, path);
  }
});


test("Menu mobile compatto con accesso a Pratiche e Posta", () => {
  assert.match(navigation, /dm-mobile-more-trigger/);
  assert.match(navigation, /aria-expanded=\{moreOpen\}/);
  assert.match(navigation, /aria-controls="dm-mobile-more-panel"/);
  assert.match(navigation, /dm-mobile-more-sheet/);
  assert.match(navigation, /aria-modal="true"/);
  assert.match(navigation, /event\.key === "Escape"/);
  assert.match(navigation, /moreTriggerRef\.current\?\.focus\(\)/);
  assert.match(navigation, /\[links\[0\], links\[1\], links\[3\], links\[4\]\]/);
});

test("La home mostra prima il riepilogo e poi le scorciatoie", () => {
  assert.match(smartHome, /main\.insertBefore\(mount, quickActions \?\? hero\)/);
  assert.match(smartHome, /quickActions = main\.querySelector/);
  const polish = read("../app/documio-polish.css");
  assert.match(polish, /smart-home > #documio-today-action-root/);
  assert.match(polish, /smart-home-welcome/);
});

test("I documenti sono ordinabili e le azioni distruttive restano nel menu", () => {
  assert.match(home, /type DocumentSort = "recent" \| "oldest" \| "title" \| "expiry"/);
  assert.match(home, /sortedDocuments\.map\(\(doc\)/);
  assert.match(home, /className="dm-sort-control"/);
  assert.match(home, /className="dm-document-menu"/);
  assert.match(home, /<details className="dm-document-menu">/);
  assert.match(home, /void deleteDocument\(doc\.id\)/);
  const polish = read("../app/documio-polish.css");
  assert.match(polish, /dm-document-menu:not\(\[open\]\).*dm-document-menu-panel/);
  assert.match(polish, /dm-mobile-more-container/);
  assert.match(polish, /safe-area-inset-bottom/);
  assert.match(polish, /max-width: 359px/);
});

test("Accesso leggibile e Face ID conservato nella scheda corretta", () => {
  assert.match(home, /className="dm-auth-layout"/);
  assert.match(home, /className="dm-auth-panel"/);
  assert.match(home, /className="dm-auth-form"/);
  assert.match(home, /data-documio-login-actions/);
  assert.match(home, /type="submit" className="dm-auth-sign-in"/);
  const passkey = read("../app/PasskeyControls.tsx");
  assert.match(passkey, /data-documio-login-actions/);
  const polish = read("../app/documio-polish.css");
  assert.match(polish, /\.dm-auth-layout/);
  assert.match(polish, /\.dm-auth-fields input:focus/);
});

test("Salta al contenuto su archivio, caricamento, finanze e posta", () => {
  for (const path of [
    "../app/page.tsx",
    "../app/carica/page.tsx",
    "../app/controllo/page.tsx",
    "../app/email/page.tsx",
  ]) {
    assert.match(read(path), /id="dm-main-content"/, path);
  }
  assert.match(navigation, /href="#dm-main-content"/);
});

test("Tutte le nuove sezioni TSX sono sintatticamente valide", () => {
  for (const path of [
    "../app/AppShellNavigation.tsx",
    "../app/page.tsx",
    "../app/SmartHomeV2.tsx",
    "../app/PasskeyControls.tsx",
    "../app/carica/page.tsx",
    "../app/controllo/page.tsx",
    "../app/email/page.tsx",
  ]) {
    const parsed = ts.createSourceFile(path, read(path), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    assert.equal(parsed.parseDiagnostics.length, 0, path);
  }
});
