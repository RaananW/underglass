/**
 * Generates the token stylesheet: every token as a CSS custom property (`colour.accent` → `--strata-colour-accent`),
 * as the design language's runtime mechanism describes (section 15). The stylesheet computes depth-blended values
 * and the light vector with `calc()`, so changing `--strata-depth` or the light angles restyles without
 * regenerating CSS. Everything sits in the `strata.tokens` cascade layer, so unlayered application CSS wins.
 *
 * - **Depth:** `--strata-depth` (0–1) is set on the root or on a scope element (`data-strata-scope` with an inline
 *   `--strata-depth`, or `data-strata-depth` where typed `attr()` is supported). Depth-blended tokens are
 *   re-declared on every scope, so each subtree blends at its own depth.
 * - **Themes:** `data-strata-theme` (`light`, `dark`, `contrast`, `contrast-dark`) on the root or a scope. Without it
 *   the root follows `prefers-color-scheme`, and `prefers-contrast: more` turns light into `contrast` and dark into
 *   `contrast-dark`.
 * - **Derived values:** text on role colours (`--strata-colour-on-accent`), role colours as text
 *   (`--strata-colour-accent-text`), the light vector (`--strata-light-x`, `-y`, `-z`), the shadow offset per pixel of
 *   height (`--strata-shadow-dx`, `-dy`), the spacing scale (`--strata-space-1` to `-10`), each material's finish
 *   gradient (`--strata-finish-gloss`) and each role's (`--strata-finish-role-knob`), and the density's control
 *   height, panel padding and gaps (`--strata-gap-control` between controls, `--strata-gap-group` between groups).
 */
import { onColour, parseHex, scale, textColour, toHex, type Rgb } from "./contrast.ts";
import { finishGradient, finishRecipes } from "./finish.ts";
import { flatten, numeric, themesOf, type Token, type TokenGroup, type TokenValue } from "./model.ts";

/** The custom property for a token path: `object.keyHeight` → `--strata-object-key-height`. */
export function cssVariable(path: string): string {
  return `--strata-${path.split(".").map(part => part.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)).join("-")}`;
}

/** Roles that carry text, so they get a derived `on-` colour. */
const textRoles = ["accent", "success", "warning", "danger", "info"];

/** Control height, panel padding, and the gaps between controls and between groups, per density (section 13). */
const densities: Record<string, [number, number, number, number]> = { compact: [28, 12, 8, 16], comfortable: [34, 18, 12, 20], spacious: [40, 24, 16, 24] };
const densityLines = ([height, padding, control, group]: [number, number, number, number]) =>
  [`--strata-control-height: ${height}px;`, `--strata-panel-padding: ${padding}px;`, `--strata-gap-control: ${control}px;`, `--strata-gap-group: ${group}px;`];

const genericFonts = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math"]);
const number = (value: number) => String(Math.round(value * 10000) / 10000);

/** A token's literal CSS value (`value` defaults to its `$value`). */
export function literal(token: Token, value: TokenValue = token.$value): string {
  if (typeof value === "string" && /^\{[^}]+\}$/.test(value)) return `var(${cssVariable(value.slice(1, -1))})`;
  switch (token.$type) {
    case "fontFamily": return (Array.isArray(value) ? value : [String(value)]).map(name => (genericFonts.has(name) ? name : `"${name}"`)).join(", ");
    case "cubicBezier": return Array.isArray(value) ? `cubic-bezier(${value.join(", ")})` : String(value);
    default:
      if (typeof value === "number") return number(value);
      if (Array.isArray(value)) return value.join(" ");
      return value;
  }
}

/** A depth-blended value: piecewise-linear through the three anchors, driven by `--strata-depth-t` (−1 to 1). */
function blended(token: Token): string {
  const [subtle, medium, bold] = token.meta.anchors!;
  const unit = token.$type === "dimension" ? "px" : "";
  if (subtle === medium && medium === bold) return `${number(medium)}${unit}`;
  const t = "var(--strata-depth-t)";
  return `calc(${number(medium)}${unit} + ${number(medium - subtle)}${unit} * min(${t}, 0) + ${number(bold - medium)}${unit} * max(${t}, 0))`;
}

/**
 * The current size's values for each size in the source (`size.<part>.<size>`): `--strata-indicator`,
 * `--strata-switch-width`, `--strata-control-offset`, `--strata-control-font` and `--strata-knob-size`.
 */
function sizes(tokens: Token[]): [string, string[]][] {
  const parts: Record<string, string> = { indicator: "indicator", switchWidth: "switch-width", control: "control-offset", font: "control-font", knob: "knob-size" };
  const bySize = new Map<string, string[]>();
  for (const token of tokens.filter(token => token.path.startsWith("size."))) {
    const [, part, size] = token.path.split(".") as [string, string, string];
    if (!parts[part]) continue;
    bySize.set(size, [...(bySize.get(size) ?? []), `--strata-${parts[part]}: var(${cssVariable(token.path)});`]);
  }
  // The default comes first, so a size set on the root itself overrides it.
  return [...bySize.entries()].sort(([a], [b]) => Number(b === "medium") - Number(a === "medium"));
}

const block = (selector: string, lines: string[], indent = "  ") => `${indent}${selector} {\n${lines.map(line => `${indent}  ${line}`).join("\n")}\n${indent}}`;

/** The token stylesheet for `source`. */
/** The cascade layers, lowest first: defaults, an application's theme, then the components. */
export const layerOrder = "@layer strata.tokens, strata.theme, strata.components;";

export interface TokensCssOptions {
  /** The cascade layer to write into: `strata.tokens` for the defaults, `strata.theme` for an application theme. */
  layer?: "strata.tokens" | "strata.theme";
}

export function tokensToCss(source: TokenGroup, { layer = "strata.tokens" }: TokensCssOptions = {}): string {
  const tokens = flatten(source);
  const themes = themesOf(source);
  const isAlias = (token: Token) => typeof token.$value === "string" && token.$value.startsWith("{");

  // Plain values inherit from the root. Depth-blended values and aliases are re-declared on every scope.
  const root: string[] = [], scoped: string[] = ["--strata-depth-t: calc(clamp(-1, 2 * var(--strata-depth) - 1, 1));"];
  for (const token of tokens) {
    const name = cssVariable(token.path);
    if (token.meta.anchors) {
      const value = blended(token);
      scoped.push(`${name}: ${token.meta.themes ? `var(--strata-theme-${name.slice(9)}, ${value})` : value};`);
    } else if (isAlias(token)) scoped.push(`${name}: ${literal(token)};`);
    else if (!token.meta.themes) root.push(`${name}: ${literal(token)};`);
  }
  root.push(
    "--strata-light-x: calc(sin(var(--strata-light-azimuth) * 1deg) * cos(var(--strata-light-elevation) * 1deg));",
    "--strata-light-y: calc(-1 * cos(var(--strata-light-azimuth) * 1deg) * cos(var(--strata-light-elevation) * 1deg));",
    "--strata-light-z: calc(sin(var(--strata-light-elevation) * 1deg));",
    "--strata-shadow-dx: calc(-1 * var(--strata-light-x) / var(--strata-light-z));",
    "--strata-shadow-dy: calc(-1 * var(--strata-light-y) / var(--strata-light-z));",
  );
  // The spacing scale (section 13): space.1–space.10 as multiples of the base unit.
  [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12].forEach((factor, index) => root.push(`--strata-space-${index + 1}: calc(var(--strata-space-base) * ${factor});`));
  // Material finishes (section 4) at the default depth, and each material role's finish.
  for (const [preset, recipe] of Object.entries(finishRecipes(source))) root.push(`--strata-finish-${preset}: ${finishGradient(recipe)};`);
  for (const token of tokens.filter(token => token.path.startsWith("material.roles."))) {
    root.push(`${cssVariable(`finish.role.${token.path.split(".")[2]!}`)}: var(--strata-finish-${String(token.$value)});`);
  }

  // Each theme's values, with derived colours: text on each role colour (`on-accent`), and each role colour as text
  // on the lit surfaces (`accent-text`, for links and messages), at 4.5:1 on every surface at every lit state.
  const interior = numeric(tokens.find(token => token.path === "interior.max")?.$value ?? 0);
  const themeLines = (theme: string) => {
    const lines = [`color-scheme: ${themes[theme]!.scheme};`];
    const colours = new Map<string, Rgb>();
    for (const token of tokens) {
      const value = token.meta.themes?.[theme];
      const name = cssVariable(token.path);
      // A theme without its own value restores the depth-blended one inside another theme's subtree.
      if (value === undefined) { if (token.meta.themes && token.meta.anchors) lines.push(`--strata-theme-${name.slice(9)}: initial;`); continue; }
      lines.push(token.meta.anchors ? `--strata-theme-${name.slice(9)}: ${literal(token, value)};` : `${name}: ${literal(token, value)};`);
      if (token.path.startsWith("colour.")) colours.set(token.path.slice(7), parseHex(String(value)));
    }
    const surfaces = ["panel", "field", "stage", "secondary"].flatMap(role => [1, 1 + interior, 1 - interior].map(factor => scale(colours.get(role)!, factor)));
    for (const role of textRoles) {
      lines.push(`${cssVariable(`colour.on-${role}`)}: ${toHex(onColour(colours.get(role)!))};`);
      lines.push(`${cssVariable(`colour.${role}-text`)}: ${toHex(textColour(colours.get(role)!, colours.get("text")!, surfaces))};`);
    }
    return lines;
  };
  const contrastOf = (scheme: "light" | "dark") => Object.entries(themes).find(([, info]) => info.scheme === scheme && info.contrast === "more")?.[0];
  const plainOf = (scheme: "light" | "dark") => Object.entries(themes).find(([, info]) => info.scheme === scheme && !info.contrast)?.[0];
  const light = plainOf("light") ?? "light", dark = plainOf("dark");

  const parts = [
    "/* @underglass/ui tokens, generated from strata.tokens.json by tokensToCss. Do not edit. */",
    // The order statement first, so the layers rank the same whichever stylesheet the page loads first.
    layerOrder,
    `@layer ${layer} {`,
    block(":root", [...root, ...densityLines(densities.comfortable!)]),
    block(":root, [data-strata-scope], [data-strata-depth], [data-strata-theme]", scoped),
    "  @supports (x: attr(x type(*))) {",
    block("[data-strata-depth]", ["--strata-depth: attr(data-strata-depth type(<number>), 0.5);"], "    "),
    "  }",
    ...Object.entries(densities).map(([density, values]) => block(`[data-strata-density="${density}"]`, densityLines(values))),
    // Component size (section 13): medium by default; data-strata-size on a component or a scope picks another.
    ...sizes(tokens).map(([size, lines]) => block(size === "medium" ? `:root, [data-strata-size="medium"]` : `[data-strata-size="${size}"]`, lines)),
    block(`:root, [data-strata-theme="${light}"]`, themeLines(light)),
    ...Object.keys(themes).filter(theme => theme !== light).map(theme => block(`[data-strata-theme="${theme}"]`, themeLines(theme))),
  ];
  if (dark) parts.push("  @media (prefers-color-scheme: dark) {", block(":root:not([data-strata-theme])", themeLines(dark), "    "), "  }");
  const contrastLight = contrastOf("light"), contrastDark = contrastOf("dark");
  if (contrastLight) parts.push("  @media (prefers-contrast: more) {", block(`:root:not([data-strata-theme]), [data-strata-theme="${light}"]`, themeLines(contrastLight), "    "), "  }");
  if (dark && contrastDark) {
    parts.push("  @media (prefers-contrast: more) {", block(`[data-strata-theme="${dark}"]`, themeLines(contrastDark), "    "), "  }");
    parts.push("  @media (prefers-contrast: more) and (prefers-color-scheme: dark) {", block(":root:not([data-strata-theme])", themeLines(contrastDark), "    "), "  }");
  }
  parts.push("}");
  return `${parts.join("\n")}\n`;
}
