/**
 * Builds the `@underglass/ui/astro` entry into `dist/astro/`, so the package ships JavaScript and declarations
 * instead of raw TypeScript. Runs from `npm run build` in this package, after `vite build` and `tsc`.
 *
 * Astro components are source by nature: the consumer's Astro build compiles `.astro` files. So the `.astro`
 * files are copied as they are, except that their `.ts` import specifiers now name `.js`. Every TypeScript module
 * they reach (`src/astro`, `src/shared`, `src/dom`, `src/tokens`) is transpiled to ES2022 JavaScript at the same
 * relative path, and the character JSON they import is copied. The entry is `dist/astro/astro/index.js` with a
 * declaration file listing the components.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const out = join(root, "dist/astro");
const seen = new Set();
const queue = (await readdir(join(src, "astro"))).map(name => join(src, "astro", name));
const specifier = /((?:import|export)[^"';]*?from\s*|import\s*)(["'])(\.[^"']+)\2/g;

while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(specifier)) {
    const target = resolve(dirname(file), match[3]);
    if (/\.(ts|astro|json)$/.test(target)) queue.push(target);
    else throw new Error(`${relative(root, file)}: unsupported relative import ${match[3]}`);
  }
}

const rewrite = text => text.replace(specifier, (all, head, quote, path) => path.endsWith(".ts") ? `${head}${quote}${path.slice(0, -3)}.js${quote}` : all);
for (const file of [...seen].sort()) {
  const text = await readFile(file, "utf8");
  const to = join(out, relative(src, file));
  await mkdir(dirname(to), { recursive: true });
  if (file.endsWith(".ts")) {
    const { code } = await transformWithOxc(text, file, { target: "es2022" });
    await writeFile(to.replace(/\.ts$/, ".js"), rewrite(code));
  } else if (file.endsWith(".astro")) {
    await writeFile(to, rewrite(text));
  } else {
    await writeFile(to, text);
  }
}

// The `.astro` components have no TypeScript declarations of their own: each is typed as an Astro component.
const names = [...(await readFile(join(src, "astro/index.ts"), "utf8")).matchAll(/export \{ default as (\w+) \}/g)].map(match => match[1]);
if (!names.length) throw new Error("no component exports found in src/astro/index.ts");
await writeFile(join(out, "astro/index.d.ts"), `/** Strata's Astro components (\`@underglass/ui/astro\`); each takes its props as an attribute object. */
type StrataAstroComponent = (props: Record<string, any>) => any;
${names.map(name => `export declare const ${name}: StrataAstroComponent;`).join("\n")}
`);
console.log(`astro: ${seen.size} files, ${names.length} components -> dist/astro`);
