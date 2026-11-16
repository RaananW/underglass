/**
 * Unit tests for the parts of prerendering that run without a DOM: the hosts as HTML (`canvasHostsMarkup` in
 * `packages/core/src/hosts.ts`) and `compileStyle`'s colour check when the browser's CSS parser is absent. Hydration
 * itself is covered in the browser (`tests/browser/hydration.test.mjs`). Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { canvasHostsMarkup } from "../../packages/core/src/hosts.ts";
import { compileStyle } from "../../packages/core/src/compiler.ts";

test("the prerendered hosts are the output canvas, the ordinary host with the root container, and the overlay host", () => {
  assert.equal(typeof document, "undefined");
  const html = canvasHostsMarkup("<p>content</p>");
  assert.equal(html,
    '<canvas data-underglass-host="output" hidden style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none"></canvas>'
    + '<div data-underglass-host="ordinary" style="position:absolute;left:0;top:0;width:100%;height:100%">'
    + '<div class="app-container" style="position:relative;width:100%;height:100%"><p>content</p></div></div>'
    + '<div data-underglass-host="overlay"></div>');
  // With nothing to prerender, the container is there and empty.
  assert.match(canvasHostsMarkup(), /<div class="app-container"[^>]*><\/div><\/div>/);
});

test("without a CSS parser, compileStyle accepts colours and refuses what no colour holds", () => {
  assert.equal(typeof CSS, "undefined");
  for (const color of ["white", "#1e6ee6", "rgb(240, 30, 60)", "rgb(0 0 0 / 50%)", "oklch(70% 0.1 200)", "color-mix(in srgb, red 40%, blue)", "var(--panel)", "light-dark(white, black)"]) {
    assert.equal(compileStyle({}, { background: color, color }).backgroundColor, color);
  }
  for (const value of ["", " ", "url(https://example.com/x.png)", "linear-gradient(red, blue)", "image-set('a.png' 1x)", "red; position: fixed", "red } body { display: none", "red /* note */", "red !important", "</style>", "r\\65 d", "'red'"]) {
    assert.throws(() => compileStyle({}, { background: value }), /Invalid authored color: background/, value);
    assert.throws(() => compileStyle({}, { color: value }), /Invalid authored color: color/, value);
  }
});

test("with a CSS parser, compileStyle asks it", () => {
  const asked = [];
  globalThis.CSS = { supports(property, value) { asked.push([property, value]); return value !== "nonsense"; } };
  try {
    assert.equal(compileStyle({}, { background: "white", color: "black" }).color, "black");
    assert.throws(() => compileStyle({}, { color: "nonsense" }), /Invalid authored color: color/);
    assert.deepEqual(asked, [["background-color", "white"], ["color", "black"], ["color", "nonsense"]]);
  } finally { delete globalThis.CSS; }
});
