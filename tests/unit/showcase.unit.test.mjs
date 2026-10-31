/**
 * Unit tests for the public showcase: base path policy, routing and catalog search, the page metadata
 * `examples/showcase/seo.ts` writes, the GitHub Pages workflow file, and `scripts/check-showcase-assets.mjs`. Reads files relative to the repository root, so
 * run from the root with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { symlinkOrSkip } from "../helpers/symlink.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { showcaseBase } from "../../examples/showcase/site-policy.mjs";
import { route, searchExamples, examples, examplePath, exampleFromPath, pageMeta, site } from "../../examples/showcase/src/catalog.ts";
import { headTags, noscriptBody, sitemap, robots, notFoundPage, structuredData, defaultImage } from "../../examples/showcase/seo.ts";

test("showcase project base is deterministic and rejects unsafe URL shapes", () => {
  assert.equal(showcaseBase(), "/underglass/");
  for (const base of ["/", "/project-name/", "/nested/project/"]) assert.equal(showcaseBase(base), base);
  for (const base of ["https://host/", "//host/", "/underglass", "/../", "/x?y/", "/x#y/", ""]) {
    assert.throws(() => showcaseBase(base), /CANVAS_SHOWCASE_BASE/);
  }
});
test("showcase paths, old hash links and catalog filtering remain local and predictable", () => {
  for (const example of examples) {
    assert.equal(route(`#/${example.id}`), example.id);
    assert.equal(examplePath(example.id), `examples/${example.id}`);
    for (const base of ["/", "/underglass/"]) {
      for (const suffix of ["", "/", ".html"]) assert.equal(exampleFromPath(`${base}examples/${example.id}${suffix}`, base), example.id);
    }
  }
  assert.equal(route("#/missing"), "layers");
  for (const path of ["/", "/examples/missing", "/examples/motion/extra", "/underglass/examples/motion", "/other"]) assert.equal(exampleFromPath(path, "/"), undefined);
  assert.equal(exampleFromPath("/examples/motion", "/underglass/"), undefined);
  assert.deepEqual(searchExamples("layer", "Motion").map(example => example.id), ["motion"]);
  assert.equal(searchExamples("unfindable", "All").length, 0);
});
test("every page has its own title, description, canonical URL and structured data", () => {
  const pages = [undefined, ...examples.map(example => example.id)];
  const titles = new Set(pages.map(id => pageMeta(id).title));
  assert.equal(titles.size, pages.length);
  for (const id of pages) {
    const { title, description } = pageMeta(id), url = `${site.origin}/${id ? `examples/${id}` : ""}`;
    assert.ok(title.length <= 70 && description.length <= 200, `${id}: title or description too long`);
    const head = headTags(id, defaultImage);
    assert.equal((head.match(/<title>/g) ?? []).length, 1);
    assert.match(head, new RegExp(`<link rel="canonical" href="${url}">`));
    assert.match(head, new RegExp(`<meta property="og:url" content="${url}">`));
    assert.match(head, /<meta name="twitter:card" content="summary_large_image">/);
    // The JSON-LD parses back to the graph, and no data string can close its script element.
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(head)[1];
    assert.ok(!json.includes("<"));
    assert.deepEqual(JSON.parse(json), structuredData(id));
    // Without JavaScript the page still links to every example.
    const body = noscriptBody(id, "/underglass/");
    for (const example of examples) assert.ok(body.includes(`href="/underglass/examples/${example.id}"`));
  }
  // Attribute text is escaped.
  assert.ok(headTags("compare", defaultImage).includes("GPU or CSS?"));
  assert.ok(!/content="[^"]*[<>][^"]*"/.test(headTags(undefined, defaultImage)));
  const urls = [...sitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, [`${site.origin}/`, ...examples.map(example => `${site.origin}/examples/${example.id}`)]);
  assert.match(robots(), new RegExp(`Sitemap: ${site.origin}/sitemap.xml`));
  assert.match(notFoundPage("/"), /<meta name="robots" content="noindex">/);
});
test("Pages workflow deploys only main, uses immutable pins and confines deployment permissions", async () => {
  // Normalise CRLF so the multi-line regular expressions below also match on Windows checkouts.
  const workflow = (await readFile(".github/workflows/showcase-pages.yml", "utf8")).replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));
  assert.match(workflow, /on:\n  push:\n    branches: \[main\]\n/);
  assert.match(workflow, /\n  workflow_dispatch:/);
  assert.ok(!/\n  (pull_request|pull_request_target|schedule):/.test(workflow));
  for (const action of workflow.matchAll(/uses: (\S+)/g)) assert.match(action[1], /^[\w/-]+@[a-f0-9]{40}$/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /path: examples\/showcase\/dist/);
  assert.equal((workflow.match(/pages: write/g) ?? []).length, 1);
  assert.ok(workflow.indexOf("pages: write") > workflow.indexOf("  deploy:"));
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
});
test("public output guard fails before an unexpected artifact can be uploaded", async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-showcase-assets-unit-"));
  try {
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<html>Showcase</html>");
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/index-abc.css"), "body{}");
    // The pages and site files `seo.ts` writes, and the icons and social card from `public/`.
    await mkdir(join(root, "examples"));
    for (const name of ["404.html", "robots.txt", "sitemap.xml", "favicon.svg", "examples/motion.html"]) await writeFile(join(root, name), "text");
    await writeFile(join(root, "og.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await writeFile(join(root, "apple-touch-icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // Runs the checker as a child process on the fake build output and returns its status and stderr.
    const check = () => spawnSync(process.execPath, ["scripts/check-showcase-assets.mjs", root], { encoding: "utf8" });
    assert.equal(check().status, 0);
    if (await symlinkOrSkip(t, "index-abc.js", join(root, "assets/alias.js"))) {
      assert.match(check().stderr, /Public asset symlink refused/);
      await rm(join(root, "assets/alias.js"));
    }
    await writeFile(join(root, "assets/index-abc.js"), "PRIVATE KEY");
    assert.match(check().stderr, /Private or mapped public asset refused/);
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/preview-abc.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    assert.equal(check().status, 0);
    await writeFile(join(root, "assets/preview-abc.jpg"), "not an image");
    assert.match(check().stderr, /Public image is not a JPEG/);
    await rm(join(root, "assets/preview-abc.jpg"));
    await writeFile(join(root, "apple-touch-icon.png"), "not an image");
    assert.match(check().stderr, /Public image is not a PNG/);
    await writeFile(join(root, "apple-touch-icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await mkdir(join(root, "examples/nested"));
    assert.match(check().stderr, /Unexpected public directory/);
    await rm(join(root, "examples/nested"), { recursive: true });
    await writeFile(join(root, "examples/notes.txt"), "text");
    assert.match(check().stderr, /Unexpected public asset/);
    await rm(join(root, "examples/notes.txt"));
    assert.equal(check().status, 0);
    await writeFile(join(root, "assets/private.map"), "{}");
    const rejected = check();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unexpected public asset/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
