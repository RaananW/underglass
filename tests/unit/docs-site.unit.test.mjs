/**
 * Unit tests for the documentation site (`examples/docs`): which `docs/` files it publishes, how
 * `examples/docs/pages.mjs` turns one into a Starlight page, and that the showcase's links to anatomy pages
 * name headings that exist. The built site's own links and anchors are checked by `scripts/assemble-site.mjs`
 * in `npm run build:site`. Reads files relative to the repository root, so run from the root with
 * `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { base, description, home, outputFile, repository, rewriteLinks, routes, sidebar, toPage, url } from "../../examples/docs/pages.mjs";

const components = await readdir("docs/ui-library/components");
const map = routes(components);

test("docs site publishes every listed page and every component page, each with a title", async () => {
  for (const [source] of [home, ...sidebar.flatMap(group => group.pages)]) assert.ok(map.has(source), source);
  for (const file of components.filter(name => name.endsWith(".md") && name !== "README.md")) {
    assert.equal(map.get(`ui-library/components/${file}`), `strata/components/${file.slice(0, -3)}`);
  }
  assert.equal(new Set(map.values()).size, map.size, "routes are unique");
  for (const source of map.keys()) assert.match(await readFile(`docs/${source}`, "utf8"), /^# \S/, `${source} starts with a # title`);
  assert.equal(outputFile(""), "index.md");
  assert.equal(outputFile("guide/concepts"), "guide/concepts.md");
  assert.equal(url(""), "/docs");
  assert.equal(base, "/docs/");
});

test("docs site rewrites relative links to site pages or GitHub, outside code", () => {
  const source = "guide/getting-started.md";
  const rewrite = markdown => rewriteLinks(markdown, source, map);
  assert.equal(rewrite("[Concepts](concepts.md)"), "[Concepts](/docs/guide/concepts)");
  assert.equal(rewrite("[API](../api.md#canvas-inside-a-layer)"), "[API](/docs/reference/api#canvas-inside-a-layer)");
  assert.equal(rewrite("[Docs](../README.md)"), "[Docs](/docs)");
  assert.equal(rewrite("[Knob](../ui-library/components/knob.md)"), "[Knob](/docs/strata/components/knob)");
  // Unpublished files and directories go to GitHub.
  assert.equal(rewrite("[Contract](../architecture.md#gpu-first-contract)"), `[Contract](${repository}/blob/main/docs/architecture.md#gpu-first-contract)`);
  assert.equal(rewrite("[Readme](../../README.md)"), `[Readme](${repository}/blob/main/README.md)`);
  assert.equal(rewrite("[Archive](../archive/)"), `[Archive](${repository}/tree/main/docs/archive/)`);
  // Absolute URLs, anchors and code are untouched.
  for (const text of ["[Site](https://underglass.dev/)", "[Top](#install)", "[Mail](mailto:a@b.c)", "`[x](concepts.md)`", "```md\n[x](concepts.md)\n```"]) {
    assert.equal(rewrite(text), text);
  }
  assert.throws(() => rewriteLinks("[Out](../../../x.md)", source, map), /leaves the repository/);
});

test("docs site page frontmatter comes from the title and first paragraph", () => {
  const page = toPage("# Title: with \"quotes\"\r\n\r\nSee [concepts](concepts.md) and `code`.\r\n\r\n## Next\r\n", "guide/motion.md", map);
  assert.equal(page, [
    "---",
    'title: "Title: with \\"quotes\\""',
    'description: "See concepts and code."',
    `editUrl: "${repository}/edit/main/docs/guide/motion.md"`,
    "---",
    "",
    "See [concepts](/docs/guide/concepts) and `code`.",
    "",
    "## Next",
    "",
  ].join("\n"));
  assert.throws(() => toPage("No title\n", "x.md", map), /must start with a # title/);
  // A leading byte order mark (U+FEFF) is dropped.
  assert.match(toPage(`${String.fromCharCode(0xfeff)}# API reference\n\nEvery export.\n`, "api.md", map),
    /^---\ntitle: "API reference"\ndescription: "Every export."\n/);
  assert.equal(description("\n## Heading\n\n- list\n\n```js\ncode\n```\n"), undefined);
  const long = description(`${"word ".repeat(60)}\n`);
  assert.ok(long.length <= 160 && long.endsWith("…"), long);
});

/** GitHub's heading anchor for the ASCII headings these pages use (the site's ids match it). */
const slug = heading => heading.trim().toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");

test("showcase anatomy links name headings that exist", async () => {
  const source = await readFile("examples/showcase/src/instrument.tsx", "utf8");
  const links = [...source.matchAll(/page="([\w-]+)(?:#([\w-]+))?"/g)];
  assert.ok(links.length > 20, "the catalogue links its anatomy pages");
  for (const [, page, anchor] of links) {
    const markdown = await readFile(`docs/ui-library/components/${page}.md`, "utf8");
    if (anchor) assert.ok([...markdown.matchAll(/^#{2,6} (.+)$/gm)].some(match => slug(match[1]) === anchor), `${page}#${anchor}`);
  }
});
