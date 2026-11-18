/**
 * The dates in the site's `sitemap.xml` (`scripts/sitemap-dates.mjs`): a page's date moves only when its indexed text
 * does, whatever else a build changed.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { datePages, fingerprint, indexedText, publishedDates, sitemapXml } from "../../scripts/sitemap-dates.mjs";

const page = (title, body, { script = "a-1f3c.js", description = "About it." } = {}) =>
  `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><link rel="stylesheet" href="/assets/s-${script}.css"></head>`
  + `<body><nav>Every page of the site</nav><main class="x"><h1>${title}</h1>${body}<script type="module" src="/assets/${script}"></script></main></body></html>`;

test("a page's indexed text is its title, description and main content, without markup, scripts or asset names", () => {
  assert.equal(indexedText(page("Motion", "<p>Move it   without\n React.</p><style>p { color: red }</style><!-- note -->")), "Motion\nAbout it.\nMotion Move it without React.");
  // Another build's asset names, markup and navigation are the same text.
  assert.equal(fingerprint(page("Motion", "<p>Move it.</p>")), fingerprint(page("Motion", '<p class="lede">Move it.</p>', { script: "b-99aa.js" }).replace("Every page", "Every other page")));
  // The text, the title and the description each change it.
  const base = fingerprint(page("Motion", "<p>Move it.</p>"));
  assert.notEqual(fingerprint(page("Motion", "<p>Move it now.</p>")), base);
  assert.notEqual(fingerprint(page("Motions", "<p>Move it.</p>")), base);
  assert.notEqual(fingerprint(page("Motion", "<p>Move it.</p>", { description: "About that." })), base);
  // A page without <main> is read from its body.
  assert.equal(indexedText("<html><head><title>T</title></head><body><p>Text</p></body></html>"), "T\n\nText");
});

test("a page keeps its date while its text is the same; a changed or new page gets today's", () => {
  const first = datePages([["/a", page("A", "one")], ["/b", page("B", "two")]], undefined, "2026-11-01");
  assert.deepEqual(Object.values(first).map(entry => entry.date), ["2026-11-01", "2026-11-01"]);
  const second = datePages([["/a", page("A", "one", { script: "z-0000.js" })], ["/b", page("B", "two, edited")], ["/c", page("C", "three")]], first, "2026-11-18");
  assert.deepEqual(Object.fromEntries(Object.entries(second).map(([url, entry]) => [url, entry.date])), { "/a": "2026-11-01", "/b": "2026-11-18", "/c": "2026-11-18" });
  assert.equal(second["/a"].hash, first["/a"].hash);
  // A record that cannot be trusted is not kept: a wrong shape, a date that is none, a date after today.
  for (const bad of [{ "/a": "2026-11-01" }, { "/a": { hash: first["/a"].hash, date: "yesterday" } }, { "/a": { hash: first["/a"].hash, date: "2027-01-01" } }, { "/a": { hash: first["/a"].hash } }]) {
    assert.equal(datePages([["/a", page("A", "one")]], bad, "2026-11-18")["/a"].date, "2026-11-18", JSON.stringify(bad));
  }
});

test("the sitemap carries the dates, and the published record is read back from a file", async () => {
  const dates = datePages([["https://underglass.dev", page("Home", "x")]], undefined, "2026-11-18");
  assert.equal(sitemapXml(["https://underglass.dev", "https://underglass.dev/examples"], dates),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://underglass.dev</loc><lastmod>2026-11-18</lastmod></url>\n'
    + "  <url><loc>https://underglass.dev/examples</loc></url>\n</urlset>\n");
  assert.ok(!sitemapXml(["https://underglass.dev"], undefined).includes("lastmod"));
  const folder = await mkdtemp(join(tmpdir(), "underglass-sitemap-"));
  try {
    await writeFile(join(folder, "dates.json"), JSON.stringify(dates));
    assert.deepEqual((await publishedDates(join(folder, "dates.json"))).dates, dates);
    assert.match((await publishedDates(join(folder, "missing.json"))).why, /ENOENT/);
    await writeFile(join(folder, "broken.json"), "[1, 2]");
    assert.equal((await publishedDates(join(folder, "broken.json"))).why, "not a record of dates");
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("the deployment uploads every script the site's build imports", async () => {
  // `.vercelignore` is an allowlist: a script the build imports but the list leaves out is missing on Vercel only.
  const { readFile } = await import("node:fs/promises");
  const allowed = new Set((await readFile(".vercelignore", "utf8")).split(/\r?\n/).filter(line => line.startsWith("!/scripts/")).map(line => line.slice("!/scripts/".length)));
  const wanted = new Set(), queue = ["assemble-site.mjs", "check-showcase-assets.mjs"];
  while (queue.length) {
    const name = queue.pop();
    if (wanted.has(name)) continue;
    wanted.add(name);
    for (const match of (await readFile(join("scripts", name), "utf8")).matchAll(/from\s+"\.\/([\w.-]+\.mjs)"/g)) queue.push(match[1]);
  }
  assert.deepEqual([...wanted].filter(name => !allowed.has(name)), [], "scripts missing from .vercelignore's allowlist");
});
