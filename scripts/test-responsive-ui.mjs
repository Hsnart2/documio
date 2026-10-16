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
  const entries = [...navigation.matchAll(/id: "(home|documents|practices|upload|finance|email)", href: "([^"]+)"/g)]
    .map((m) => [m[1], m[2]]);
  assert.deepEqual(entries, [
    ["home", "/"],
    ["documents", "/?view=documents#documio-library"],
    ["practices", "/?view=practices#documio-library"],
    ["upload", "/carica"],
    ["finance", "/controllo"],
    ["email", "/email"],
  ]);
  assert.equal(new Set(entries.map((entry) => entry[0])).size, 6);
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
  assert.match(layout, /import "\.\/documio-ui\.css";/);
});

test("Componenti JSX senza errori sintattici", () => {
  const paths = ["../app/AppShellNavigation.tsx","../app/page.tsx","../app/SmartHomeV2.tsx","../app/layout.tsx"];
  for (const path of paths) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    assert.equal(source.parseDiagnostics.length, 0, path);
  }
});
