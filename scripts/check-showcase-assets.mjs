/**
 * Guards the built showcase before it is published: only the pages, site files and assets that `allowed`
 * lists, no symlinks, real JPEGs and PNGs, and no local paths, private keys or source-map references in
 * text assets.
 *
 * Runs at the end of the showcase workspace `build` script (so `npm run build:showcase`, the Pages
 * workflow `.github/workflows/showcase-pages.yml` and the Vercel build), and from `showcase-validation.mjs`
 * and `tests/unit/showcase.unit.test.mjs`. Input: an optional output directory argument, default `dist`
 * relative to the working directory. Writes nothing; prints the asset count, and a failed assertion exits
 * non-zero and so fails the build.
 */
import assert from "node:assert/strict";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertPhysicalPath } from "./release-policy.mjs";

const directory = resolve(process.argv[2] ?? "dist");
await assertPhysicalPath(directory);
/**
 * Every public path: the home, 404 and example pages and the site files that `examples/showcase/seo.ts`
 * writes, the icons and social card from `examples/showcase/public/`, and Vite's hashed JS/CSS plus the JPEG
 * previews of GPU mode shown to browsers that cannot run it. A chunk's base name may contain dots: Vite names
 * Babylon Lite's lazily loaded shader chunks after their source files (`skybox.vertex-<hash>.js`), which the
 * instrument material's environment loading brings in.
 */
const allowed = /^(?:(?:index|404)\.html|robots\.txt|sitemap\.xml|favicon\.svg|og\.jpg|apple-touch-icon\.png|examples\/[\w-]+\.html|assets\/[\w.-]+\.(?:js|css|jpg))$/;
let count = 0;
/** Recursively checks `path`; `prefix` is the output-relative prefix (`""`, `"assets/"` or `"examples/"`) of its entries. */
async function check(path, prefix = "") {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`, file = join(path, entry.name);
    assert.equal((await lstat(file)).isSymbolicLink(), false, `Public asset symlink refused: ${name}`);
    if (entry.isDirectory()) {
      // Only the top-level `assets/` and `examples/` directories are allowed; any nested directory fails here.
      assert.ok(name === "assets" || name === "examples", `Unexpected public directory: ${name}`);
      await check(file, `${name}/`);
    } else {
      assert.ok(allowed.test(name), `Unexpected public asset: ${name}`);
      if (name.endsWith(".jpg")) {
        // JPEG start-of-image marker.
        const bytes = await readFile(file);
        assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, `Public image is not a JPEG: ${name}`);
      } else if (name.endsWith(".png")) {
        // PNG signature.
        const bytes = await readFile(file);
        assert.ok(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `Public image is not a PNG: ${name}`);
      } else {
        // Refuses text containing `/Users/`, `session-state`, `evidence/phase`, `PRIVATE KEY` or
        // `sourceMappingURL`.
        assert.ok(!/\/Users\/|session-state|evidence\/phase|PRIVATE KEY|sourceMappingURL/.test(await readFile(file, "utf8")),
          `Private or mapped public asset refused: ${name}`);
      }
      count++;
    }
  }
}
await check(directory);
assert.ok(count >= 3, "Showcase requires its HTML, CSS and JavaScript");
console.log(`Sanitized showcase output: ${count} public assets`);
