/**
 * Unit tests for the Strata component stylesheet (`packages/ui/src/css/components.css`) against the markup
 * contracts in `docs/ui-library/components`: every `ug-` class an anatomy page uses is styled, every relief
 * primitive the pages name is one the conventions define, and the stylesheet keeps its cascade layer and its
 * preference rules. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const pagesDirectory = new URL("../../docs/ui-library/components/", import.meta.url);
const pages = readdirSync(pagesDirectory).filter(name => name.endsWith(".md")).map(name => ({ name, text: readFileSync(new URL(name, pagesDirectory), "utf8") }));
const markup = pages.flatMap(({ name, text }) => [...text.matchAll(/```html\n([\s\S]*?)```/g)].map(match => ({ name, html: match[1] })));
const primitives = ["raised", "well", "groove", "knob", "mark", "ring", "flat"];

test("every class in the anatomy pages' markup is styled", () => {
  const missing = [];
  for (const { name, html } of markup) {
    for (const [, list] of html.matchAll(/class="([^"]+)"/g)) {
      for (const name_ of list.split(/\s+/)) if (name_.startsWith("ug-") && !css.includes(`.${name_}`)) missing.push(`${name}: ${name_}`);
    }
  }
  assert.ok(markup.length >= 19, `markup blocks: ${markup.length}`);
  assert.deepEqual(missing, []);
});

test("the markup uses only the defined relief primitives", () => {
  for (const { name, html } of markup) {
    for (const [, face] of html.matchAll(/data-strata-face="([^"]+)"/g)) assert.ok(primitives.includes(face), `${name}: ${face}`);
  }
  const readme = pages.find(page => page.name === "README.md").text;
  for (const primitive of primitives) assert.ok(readme.includes(`| \`${primitive}\` |`), `README defines ${primitive}`);
});

test("the stylesheet is layered and honours every user preference", () => {
  assert.match(css, /@layer strata\.components \{/);
  for (const query of ["prefers-reduced-motion: reduce", "prefers-reduced-transparency: reduce", "forced-colors: active"]) assert.ok(css.includes(`@media (${query})`), query);
  // Focus is an outline in the accent colour at the focus width, never removed without a replacement.
  assert.match(css, /outline: var\(--strata-focus-width\) solid var\(--strata-colour-accent\)/);
  assert.match(css, /:where\(\[data-strata-mode="face"\]\) \[data-strata-face\]/);
});

// Strata is standalone-first (design language section 18): the framework-neutral layers import no framework, and
// each binding imports only its own.
test("Strata's neutral layers import no UI framework and each binding imports only its own", () => {
  // Files only: a layer may keep data in a subdirectory (tokens/characters).
  const sources = directory => readdirSync(new URL(`../../packages/ui/src/${directory}/`, import.meta.url), { withFileTypes: true }).filter(entry => entry.isFile()).map(({ name }) => ({ name: `${directory}/${name}`, text: readFileSync(new URL(`../../packages/ui/src/${directory}/${name}`, import.meta.url), "utf8") }));
  const imports = (text, pattern) => [...text.matchAll(/from "([^"]+)"/g)].map(match => match[1]).filter(name => pattern.test(name));
  for (const file of [...sources("tokens"), ...sources("dom"), ...sources("gpu"), ...sources("shared")]) {
    if (!file.name.endsWith(".ts")) continue;
    assert.deepEqual(imports(file.text, /^(react|react-dom|vue)(\/|$)/), [], file.name);
  }
  for (const file of sources("react")) assert.deepEqual(imports(file.text, /^vue(\/|$)/), [], file.name);
  for (const file of sources("vue")) assert.deepEqual(imports(file.text, /^(react|react-dom)(\/|$)/), [], file.name);
  for (const file of sources("astro")) assert.deepEqual(imports(file.text, /^(react|react-dom|vue)(\/|$)/), [], file.name);
  // The GPU helper speaks the scene format and takes the controller as a value: it never imports Underglass.
  for (const file of sources("gpu")) assert.deepEqual(imports(file.text, /^@underglass\//), [], file.name);
});

test("face mode applies to the scope element itself, so an enrolled panel drops its own CSS relief", () => {
  assert.ok(css.includes(`:where([data-strata-mode="face"])[data-strata-face], :where([data-strata-mode="face"]) [data-strata-face]`));
  assert.ok(css.includes(`:where([data-strata-mode="face"]) .ug-slider::-webkit-slider-thumb { box-shadow: none;`));
});

// Dialog and Drawer (dialog.md, drawer.md) are top-level panels at the modal level: fixed to the viewport, positioned
// without a transform (an enrolled panel's boundary never carries one), hidden by the attribute, over a scrim.
test("Dialog and Drawer are fixed panels at the modal level over a scrim, with no transform on their boundary", () => {
  const rulesFor = pattern => [...css.matchAll(/:where\(([^)]*)\)(\[[^\]]+\])?\s*\{([^}]*)\}/g)].filter(match => pattern.test(match[1])).map(match => match[3]);
  const overlay = rulesFor(/\.ug-(dialog|drawer|scrim)\b/).join("\n");
  assert.match(css, /:where\(\.ug-scrim\) \{[^}]*position: fixed;[^}]*inset: 0;/);
  assert.match(css, /:where\(\.ug-dialog, \.ug-drawer\) \{[^}]*--_h: var\(--strata-elevation-modal\);[^}]*position: fixed;/);
  assert.doesNotMatch(overlay, /transform:/, "the boundary is positioned with insets, not a transform");
  for (const side of ["start", "end", "top", "bottom"]) assert.ok(css.includes(`.ug-drawer--${side}`), `drawer side ${side}`);
  assert.ok(css.includes(":where(.ug-scrim, .ug-dialog, .ug-drawer)[hidden] { display: none; }"), "hidden hides them despite display: flex");
  // The scrim fades with a transition that reduced motion removes, and keeps its tint under forced colours.
  assert.match(css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)")), /:where\(\.ug-scrim\) \{ transition: none; \}/);
  assert.match(css.slice(css.indexOf("@media (forced-colors: active)")), /:where\(\.ug-scrim\) \{ forced-color-adjust: none; \}/);
});
