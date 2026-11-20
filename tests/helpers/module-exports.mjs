/**
 * Lists the names a TypeScript module exports, read from its source text (a `.ts`/`.tsx` source or an emitted
 * `.d.ts`) without the compiler: `export { ... } from`, `export type { ... }`, exported declarations and
 * `export * from`, which it follows. Each name is a "value" (it exists at runtime: a function, class, constant,
 * enum or namespace) or a "type" (an interface or type alias, or a name re-exported with `type`). Used by
 * `tests/unit/adapter-exports.unit.test.mjs` to compare the adapters' public surfaces.
 *
 * It covers the export forms this repository writes and TypeScript emits; it is not a general TypeScript parser.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Block comments and whole-line comments, which may sit inside an export list. */
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Returns a `Map` from exported name to `"value"` or `"type"` for the module at `file`. `resolveModule(specifier,
 * from)` maps an import specifier to a file path; relative specifiers are resolved by default (`./x.js` to `x.ts`,
 * `x.tsx` or `x.d.ts` beside `from`). A module whose specifier cannot be resolved throws.
 */
export function moduleExports(file, resolveModule = () => undefined, seen = new Map()) {
  if (seen.has(file)) return seen.get(file);
  const names = new Map();
  seen.set(file, names);
  const text = stripComments(readFileSync(file, "utf8"));
  const target = specifier => {
    const resolved = resolveModule(specifier, file) ?? relative(specifier, file);
    if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${file}`);
    return moduleExports(resolved, resolveModule, seen);
  };
  // Exported declarations.
  for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|const|let|var|enum|namespace|interface|type)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.set(match[2], match[1] === "interface" || match[1] === "type" ? "type" : "value");
  }
  // Local imports, for `export { name }` lists without `from`.
  const imports = new Map();
  for (const match of text.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)) {
    for (const specifier of match[2].split(",").map(part => part.trim()).filter(Boolean)) {
      const [, typeOnly, original, alias] = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(specifier) ?? [];
      if (original) imports.set(alias ?? original, { from: match[3], name: original, type: !!(match[1] || typeOnly) });
    }
  }
  for (const match of text.matchAll(/^export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/gm)) {
    for (const specifier of match[2].split(",").map(part => part.trim()).filter(Boolean)) {
      const parsed = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(specifier);
      if (!parsed) throw new Error(`Unparsed export specifier "${specifier}" in ${file}`);
      const [, typeOnly, original, alias] = parsed;
      const name = alias ?? original;
      if (match[1] || typeOnly) { names.set(name, "type"); continue; }
      if (match[3]) {
        const kind = target(match[3]).get(original);
        if (!kind) throw new Error(`${match[3]} does not export ${original} (re-exported by ${file})`);
        names.set(name, kind);
      } else if (imports.has(original)) {
        const imported = imports.get(original);
        names.set(name, imported.type ? "type" : target(imported.from).get(imported.name) ?? "value");
      } else names.set(name, names.get(original) ?? "value");
    }
  }
  for (const match of text.matchAll(/^export\s+(type\s+)?\*\s+from\s*["']([^"']+)["']/gm)) {
    for (const [name, kind] of target(match[2])) if (name !== "default" && !names.has(name)) names.set(name, match[1] ? "type" : kind);
  }
  return names;
}
/** `./x.js` beside `from`, as `x.ts`, `x.tsx` or `x.d.ts`; undefined for a bare specifier. */
function relative(specifier, from) {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(from), specifier).replace(/\.js$/, "");
  return [".ts", ".tsx", ".d.ts"].map(extension => base + extension).find(existsSync);
}
/** Whether a module's own text re-exports with `export * from` (it does not follow imports). */
export function wildcardExports(file) {
  return [...stripComments(readFileSync(file, "utf8")).matchAll(/^export\s+(?:type\s+)?\*\s+from\s*["']([^"']+)["']/gm)].map(match => match[1]);
}
/** Sorted `{ values, types }` name lists of a `moduleExports` map. */
export function exportLists(names) {
  const sorted = kind => [...names].filter(([, entry]) => entry === kind).map(([name]) => name).sort();
  return { values: sorted("value"), types: sorted("type") };
}
