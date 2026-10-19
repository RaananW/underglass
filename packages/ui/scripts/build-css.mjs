/**
 * Writes the stylesheets and `dist/tokens.json` from the token source, after validating it against the design
 * language's invariants. Any broken invariant fails the build. Runs from `npm run build` in this package.
 *
 * - `dist/css/tokens.css`: the token custom properties (`strata.tokens` layer) and the characters (`strata.theme` layer).
 * - `dist/css/components.css`: the Tier A components (`strata.components` layer).
 * - `dist/css/strata.css`: both; the token stylesheet declares the layer order first.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { segmentsFontFace, segmentsGhostUrl } from "../src/shared/segments.ts";
import { charactersToCss, layerOrder, strataTokens, tokensToCss, validateTokens } from "../src/tokens/index.ts";

const issues = validateTokens(strataTokens);
if (issues.length) {
  for (const { path, message } of issues) console.error(`strata tokens: ${path}: ${message}`);
  process.exit(1);
}
const dist = new URL("../dist/", import.meta.url);
// The characters' blocks (`data-strata-character`) follow the tokens, in the theme layer.
const tokens = `${tokensToCss(strataTokens)}
${charactersToCss().replace(`${layerOrder}
`, "")}`;
// Every stylesheet declares the layer order first, so the layers rank the same whichever one loads first.
// The Display's `segments` face is drawn by Strata (`shared/segments.ts`) and embedded as a data URI: no font file ships and no third-party font is taken on.
const components = `${layerOrder}

${segmentsFontFace()}
${(await readFile(new URL("../src/css/components.css", import.meta.url), "utf8")).replace("__SEGMENTS_GHOST__", segmentsGhostUrl())}`;
await mkdir(new URL("css/", dist), { recursive: true });
await writeFile(new URL("css/tokens.css", dist), tokens);
await writeFile(new URL("css/components.css", dist), components);
await writeFile(new URL("css/strata.css", dist), `${tokens}\n${components}`);
await writeFile(new URL("tokens.json", dist), `${JSON.stringify(strataTokens, null, 2)}\n`);
console.log("strata tokens: valid; wrote dist/css/strata.css, tokens.css, components.css and dist/tokens.json");
