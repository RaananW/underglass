/**
 * Applying Strata configuration to a live page (design language section 15): an application theme with runtime
 * updates (layers 2 and 3), and scope overrides for a subtree (layer 4). Everything works through CSS custom
 * properties and attributes, so a change restyles without regenerating component CSS, and the GPU presentation reads
 * the same values.
 */
import { contrast, onColour, parseHex, scale, textColour, toHex } from "../tokens/contrast.ts";
import { cssVariable, literal } from "../tokens/css.ts";
import { flatten, numeric, themesOf, valueOf, type Token, type TokenGroup, type TokenValue } from "../tokens/model.ts";
import { StrataThemeError, createStrataTheme, sourceOf, type StrataTheme, type StrataThemeInput } from "../tokens/theme.ts";
import type { Issue } from "../tokens/validate.ts";

/** What to do with broken invariants: log them (`error`, the default; `warn`), ignore them, or throw (strict). */
export type ReportMode = "error" | "warn" | "silent" | "throw";

const report = (issues: readonly Issue[], mode: ReportMode, what: string) => {
  if (!issues.length || mode === "silent") return;
  if (mode === "throw") throw new StrataThemeError(issues);
  console[mode](`Strata ${what}: ${issues.map(({ path, message }) => `${path}: ${message}`).join("; ")}`);
};

export interface AppliedTheme {
  /** The theme in effect. */
  readonly theme: StrataTheme;
  /** Runtime update (layer 3): changes these tokens on top of the theme in effect, and restyles. */
  update(input: StrataThemeInput | StrataTheme): StrataTheme;
  /** Removes the theme; the defaults apply again. */
  remove(): void;
}

export interface ApplyThemeOptions {
  /** The document to style; the global document by default. */
  document?: Document;
  /** How to report broken invariants; `throw` refuses to apply an invalid theme. */
  report?: ReportMode;
}

const isTheme = (value: StrataThemeInput | StrataTheme): value is StrataTheme => "issues" in value && "source" in value;

/**
 * Applies an application theme (layer 2): its token stylesheet goes into the `strata.theme` cascade layer, above
 * the defaults and below the components. Call `update` for runtime changes (a dark-mode toggle, a depth control, a
 * brand switch).
 */
export function applyStrataTheme(theme: StrataThemeInput | StrataTheme, options: ApplyThemeOptions = {}): AppliedTheme {
  const doc = options.document ?? document, mode = options.report ?? "error";
  const style = doc.createElement("style");
  style.dataset.strataThemeSheet = "";
  let current = isTheme(theme) ? theme : createStrataTheme(theme);
  const apply = (next: StrataTheme) => {
    report(next.issues, mode, "theme");
    current = next;
    style.textContent = next.css();
    if (!style.isConnected) doc.head.append(style);
    return next;
  };
  apply(current);
  return {
    get theme() { return current; },
    update: input => apply(isTheme(input) ? input : createStrataTheme(input, { base: current })),
    remove: () => style.remove(),
  };
}

/** Overrides for one subtree (layer 4). Light and environment tokens are application-only and are rejected. */
export interface ScopeOverrides {
  depth?: number;
  /** A theme name (`light`, `dark`, `contrast`, `contrast-dark`). Colour overrides need one, to check contrast. */
  theme?: string;
  density?: "compact" | "comfortable" | "spacious";
  size?: "small" | "medium" | "large";
  level?: "relief" | "objects" | "scene";
  /** Material for the subtree's components, a preset name. */
  material?: string;
  /** Colour roles for the subtree, in `theme`. */
  colour?: Partial<Record<string, string>>;
  /** Any scope-overridable token by its dotted path. */
  tokens?: Record<string, TokenValue>;
  /** Opt-in feedback for the subtree's Instrument controls (design language section 20): sound and haptics, off by default. */
  feedback?: { sound?: boolean; haptics?: boolean };
}

export interface ScopeOptions {
  /** The token source in effect (an applied theme's), for ranges and contrast; the defaults when absent. */
  base?: TokenGroup | StrataTheme;
  report?: ReportMode;
}

export interface StrataScope {
  /** Problems found in the overrides; rejected overrides are not applied. */
  readonly issues: readonly Issue[];
  /** Replaces the overrides. */
  update(overrides: ScopeOverrides): readonly Issue[];
  /** Removes every override this scope applied. */
  remove(): void;
}

const roles = ["accent", "success", "warning", "danger", "info"];

/**
 * Checks scope overrides against the source and returns the custom properties and attributes to apply. Pure, so
 * bindings can render a scope on the server.
 */
export function resolveStrataScope(overrides: ScopeOverrides, base?: TokenGroup | StrataTheme): { issues: Issue[]; properties: Map<string, string>; attributes: Map<string, string> } {
  const source = sourceOf(base);
  const issues: Issue[] = [], properties = new Map<string, string>(), attributes = new Map<string, string>([["data-strata-scope", ""]]);
  const byPath = new Map(flatten(source).map(token => [token.path, token]));
  const themes = themesOf(source);
  const accept = (path: string, value: TokenValue): Token | undefined => {
    const token = byPath.get(path);
    if (!token) { issues.push({ path, message: "is not a Strata token" }); return undefined; }
    if (token.meta.scope === false) { issues.push({ path, message: "is application-only and cannot be overridden in a scope" }); return undefined; }
    if (token.meta.options && !token.meta.options.includes(String(value))) { issues.push({ path, message: `${String(value)} is not one of ${token.meta.options.join(", ")}` }); return undefined; }
    if (typeof value === "number" || token.$type === "dimension") {
      const number = numeric(value);
      if (token.meta.min !== undefined && number < token.meta.min) { issues.push({ path, message: `${number} is below the minimum ${token.meta.min}` }); return undefined; }
      if (token.meta.max !== undefined && number > token.meta.max) { issues.push({ path, message: `${number} is above the maximum ${token.meta.max}` }); return undefined; }
    }
    return token;
  };
  const enumerated = (name: string, path: string, value: string | undefined) => { if (value !== undefined && accept(path, value)) attributes.set(name, value); };

  if (overrides.depth !== undefined && accept("depth", overrides.depth)) properties.set("--strata-depth", String(overrides.depth));
  if (overrides.theme !== undefined) {
    if (themes[overrides.theme]) attributes.set("data-strata-theme", overrides.theme);
    else issues.push({ path: "theme", message: `${overrides.theme} is not a theme` });
  }
  enumerated("data-strata-density", "density", overrides.density);
  enumerated("data-strata-level", "level", overrides.level);
  if (overrides.size !== undefined) {
    if (["small", "medium", "large"].includes(overrides.size)) attributes.set("data-strata-size", overrides.size);
    else issues.push({ path: "size", message: `${String(overrides.size)} is not small, medium or large` });
  }
  if (overrides.material !== undefined) {
    if ([...byPath.keys()].some(path => path.startsWith(`material.presets.${overrides.material}.`))) attributes.set("data-strata-material", overrides.material);
    else issues.push({ path: "material", message: `${overrides.material} is not a material preset` });
  }
  for (const [name, on] of Object.entries(overrides.feedback ?? {})) {
    if (on !== undefined && accept(`feedback.${name}`, on ? 1 : 0)) properties.set(cssVariable(`feedback.${name}`), on ? "1" : "0");
  }
  for (const [path, value] of Object.entries(overrides.tokens ?? {})) {
    if (path.startsWith("colour.")) { issues.push({ path, message: "set colours with the colour option and a theme" }); continue; }
    const token = accept(path, value);
    if (token) properties.set(cssVariable(path), literal(token, typeof value === "number" && token.$type === "dimension" ? `${value}px` : value));
  }

  // Colours: checked for contrast on the scope's theme, with the derived on- and -text colours set alongside.
  const colours = Object.entries(overrides.colour ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined);
  if (colours.length) {
    const theme = overrides.theme;
    if (!theme || !themes[theme]) issues.push({ path: "colour", message: "colour overrides need the scope's theme, to check contrast" });
    else {
      const colourOf = (role: string) => {
        const override = colours.find(([name]) => name === role)?.[1];
        const token = byPath.get(`colour.${role}`);
        return parseHex(override ?? String(token ? valueOf(token, { theme }) : "#000000"));
      };
      const interior = numeric(byPath.get("interior.max")?.$value ?? 0);
      const surfaces = ["panel", "field", "stage", "secondary"].flatMap(role => [1, 1 + interior, 1 - interior].map(factor => scale(colourOf(role), factor)));
      for (const [role, value] of colours) {
        const path = `colour.${role}`;
        if (!byPath.has(path)) { issues.push({ path, message: "is not a Strata colour role" }); continue; }
        if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) { issues.push({ path, message: `${value} is not a hex colour` }); continue; }
        properties.set(cssVariable(path), value);
        if (roles.includes(role)) {
          properties.set(cssVariable(`colour.on-${role}`), toHex(onColour(parseHex(value))));
          properties.set(cssVariable(`colour.${role}-text`), toHex(textColour(parseHex(value), colourOf("text"), surfaces)));
        }
      }
      // The rules of section 8 that involve the overridden roles, on the scope's lit surfaces.
      const text = colourOf("text"), panel = colourOf("panel"), accent = colourOf("accent"), edge = colourOf("edge"), track = colourOf("track");
      const checks: [string, number, number][] = [
        ["text on the panel", Math.min(...[1, 1 + interior, 1 - interior].map(f => contrast(text, scale(panel, f)))), 4.5],
        ["text in fields", contrast(text, colourOf("field")), 4.5],
        ["the focus colour on the panel", contrast(accent, panel), 3],
        ["the edge on the panel", Math.min(...[1, 1 + interior, 1 - interior].map(f => contrast(edge, scale(panel, f)))), 3],
        ["the accent fill on the track", contrast(accent, track), 3],
        ...roles.map((role): [string, number, number] => [`text on ${role}`, Math.min(...[1, 1 + interior, 1 - interior].map(f => contrast(onColour(colourOf(role)), scale(colourOf(role), f)))), 4.5]),
      ];
      for (const [label, ratio, minimum] of checks) if (ratio < minimum) issues.push({ path: `colour (${theme})`, message: `${label} is ${ratio.toFixed(2)}:1, under ${minimum}:1` });
    }
  }
  return { issues, properties, attributes };
}

/**
 * Applies scope overrides (layer 4) to `element` and its subtree: attributes for the theme, density, size, level
 * and material; custom properties for depth and tokens. Invalid overrides are reported and not applied; with
 * `report: "throw"` nothing is applied.
 */
export function strataScope(element: HTMLElement, overrides: ScopeOverrides, options: ScopeOptions = {}): StrataScope {
  const mode = options.report ?? "error";
  let applied: { properties: Map<string, string>; attributes: Map<string, string> } = { properties: new Map(), attributes: new Map() };
  let issues: readonly Issue[] = [];
  const clear = () => {
    for (const name of applied.properties.keys()) element.style.removeProperty(name);
    if (element.getAttribute("style") === "") element.removeAttribute("style");
    for (const name of applied.attributes.keys()) element.removeAttribute(name);
    applied = { properties: new Map(), attributes: new Map() };
  };
  const apply = (next: ScopeOverrides) => {
    const resolved = resolveStrataScope(next, options.base);
    report(resolved.issues, mode, "scope");
    clear();
    for (const [name, value] of resolved.properties) element.style.setProperty(name, value);
    for (const [name, value] of resolved.attributes) element.setAttribute(name, value);
    applied = resolved;
    issues = resolved.issues;
    return issues;
  };
  apply(overrides);
  return {
    get issues() { return issues; },
    update: apply,
    remove: clear,
  };
}
