/**
 * Application themes (design language section 15, layer 2): a theme is the token source with an application's
 * changes applied, validated against every invariant. It serialises to the W3C Design Tokens format, so it can be
 * shared, versioned and loaded at runtime.
 */
import { applyCharacter, isProvisional, type StrataCharacter } from "./character.ts";
import { tokensToCss } from "./css.ts";
import { strataSource } from "./source.ts";
import { flatten, namespace, themesOf, type TokenGroup, type TokenNode, type TokenValue } from "./model.ts";
import { validateTokens, type Issue } from "./validate.ts";

/** A colour for every theme, or per theme. A plain string sets the `light` theme only. */
export type ThemedColour = string | Partial<Record<string, string>>;

/** What an application may change, all optional. */
export interface StrataThemeInput {
  /**
   * The Instrument character (design language section 19), by name (`"premium"`) or as its token layer. It is laid over
   * the base before every other change here, so the rest of the input still overrides any of its tokens.
   */
  character?: string | TokenGroup;
  /** Depth, 0 (subtle) to 1 (bold); 0.5 by default. */
  depth?: number;
  /** The one light of the application. */
  light?: { azimuth?: number; elevation?: number; intensity?: number; ambient?: number; colour?: string };
  /** Colour roles (`accent`, `panel`, …). */
  colour?: Partial<Record<string, ThemedColour>>;
  /** Material for each role (`buttonPrimary: "lacquer"`). */
  roles?: Partial<Record<string, string>>;
  /** Any token by its dotted path. A value replaces the depth blend of that token. */
  tokens?: Record<string, TokenValue>;
  /** New depth anchors (values at depth 0, 0.5 and 1) for depth-blended tokens. */
  anchors?: Record<string, [number, number, number]>;
  /** Opt-in feedback on Instrument controls (design language section 20): synthesised sound and haptics, both off by default. */
  feedback?: { sound?: boolean; haptics?: boolean };
}

export interface StrataTheme {
  /** The full token source with this theme's changes. */
  readonly source: TokenGroup;
  /** Broken invariants; empty when the theme is valid. */
  readonly issues: readonly Issue[];
  /** The token stylesheet for this theme, in the `strata.theme` layer (above the defaults, below the components). */
  css(): string;
  /** The theme as W3C Design Tokens JSON. */
  toJSON(): TokenGroup;
  /** The character the theme was built with, and the token paths it set whose values are still provisional. */
  readonly character?: { readonly name: string; readonly status: string; readonly provisional: readonly string[] };
}

export interface CreateThemeOptions {
  /** The theme to start from; the Strata defaults when absent. */
  base?: TokenGroup | StrataTheme;
  /** Throw on any broken invariant instead of reporting it in `issues`. */
  strict?: boolean;
  /** Development: warn (`console.warn`) once with the provisional tokens of the character. */
  development?: boolean;
  /** The character is a subtree's, not the application's: its studio and environment are reported and not applied (section 19). */
  scoped?: boolean;
}

/** Thrown in strict mode when a theme breaks an invariant. */
export class StrataThemeError extends Error {
  readonly issues: readonly Issue[];
  constructor(issues: readonly Issue[]) {
    super(`Strata theme breaks ${issues.length} rule${issues.length === 1 ? "" : "s"}:\n${issues.map(({ path, message }) => `- ${path}: ${message}`).join("\n")}`);
    this.name = "StrataThemeError";
    this.issues = issues;
  }
}

/** Whether `value` is a built theme rather than a token source. */
export const isTheme = (value: TokenGroup | StrataTheme): value is StrataTheme => Array.isArray((value as StrataTheme).issues) && typeof (value as StrataTheme).css === "function";
/** The token source of a theme, or the source itself; the defaults when absent. */
export const sourceOf = (base: TokenGroup | StrataTheme | undefined): TokenGroup => (base === undefined ? strataSource : isTheme(base) ? base.source : base);

/** The token at a dotted path in `source`, or undefined. */
function tokenAt(source: TokenGroup, path: string): TokenNode | undefined {
  let node: unknown = source;
  for (const key of path.split(".")) node = (node as Record<string, unknown> | undefined)?.[key];
  return node && typeof node === "object" && "$value" in node ? node as TokenNode : undefined;
}

/** Strata metadata of a token, created when absent. */
const metaOf = (token: TokenNode) => ((token.$extensions ??= {})[namespace] ??= {});

/** Builds a theme from `input` over the defaults (or `options.base`), then validates it. */
export function createStrataTheme(input: StrataThemeInput = {}, options: CreateThemeOptions = {}): StrataTheme {
  const issues: Issue[] = [];
  let source = structuredClone(sourceOf(options.base));
  // Section 19: the character first, so the application's own changes below override any of its tokens.
  let character: StrataTheme["character"];
  if (input.character !== undefined) {
    const applied = applyCharacter(source, input.character, { scoped: options.scoped });
    source = applied.source;
    issues.push(...applied.issues);
    if (applied.character) character = describe(applied.character, applied.applied);
    if (character?.provisional.length && options.development) {
      console.warn(`Strata character ${character.name} (${character.status}): provisional values in ${character.provisional.join(", ")}`);
    }
  }
  const themeNames = Object.keys(themesOf(source));

  const set = (path: string, value: TokenValue) => {
    const token = tokenAt(source, path);
    if (!token) { issues.push({ path, message: "is not a Strata token" }); return; }
    const meta = metaOf(token);
    token.$value = value;
    // An explicit value replaces the depth blend; a colour set this way applies to every theme.
    delete meta.anchors;
    if (meta.themes) for (const theme of Object.keys(meta.themes)) meta.themes[theme] = value;
  };
  const setColour = (role: string, colour: ThemedColour) => {
    const path = `colour.${role}`, token = tokenAt(source, path);
    if (!token) { issues.push({ path, message: "is not a Strata colour role" }); return; }
    const themes = (metaOf(token).themes ??= {});
    const values = typeof colour === "string" ? { light: colour } : colour;
    for (const [theme, value] of Object.entries(values)) {
      if (value === undefined) continue;
      if (!themeNames.includes(theme)) { issues.push({ path, message: `has no theme named ${theme}` }); continue; }
      themes[theme] = value;
      if (theme === "light") token.$value = value;
    }
  };

  if (input.depth !== undefined) set("depth", input.depth);
  for (const [name, value] of Object.entries(input.light ?? {})) if (value !== undefined) set(`light.${name}`, value);
  for (const [role, colour] of Object.entries(input.colour ?? {})) if (colour !== undefined) setColour(role, colour);
  for (const [role, preset] of Object.entries(input.roles ?? {})) if (preset !== undefined) set(`material.roles.${role}`, preset);
  for (const [name, on] of Object.entries(input.feedback ?? {})) if (on !== undefined) set(`feedback.${name}`, on ? 1 : 0);
  for (const [path, anchors] of Object.entries(input.anchors ?? {})) {
    const token = tokenAt(source, path);
    if (!token || !metaOf(token).anchors) { issues.push({ path, message: "is not a depth-blended token" }); continue; }
    metaOf(token).anchors = anchors;
    token.$value = token.$type === "dimension" ? `${anchors[1]}px` : anchors[1];
  }
  for (const [path, value] of Object.entries(input.tokens ?? {})) {
    if (path.startsWith("colour.") && typeof value === "string") setColour(path.slice(7), Object.fromEntries(themeNames.map(theme => [theme, value])));
    else set(path, value);
  }

  issues.push(...validateTokens(source));
  if (options.strict && issues.length) throw new StrataThemeError(issues);
  return {
    source,
    issues,
    css: () => tokensToCss(source, { layer: "strata.theme" }),
    toJSON: () => structuredClone(source),
    ...(character ? { character } : {}),
  };
}

/** A character's name and status, and the provisional paths among the tokens it set. */
function describe(character: StrataCharacter, applied: readonly string[]): NonNullable<StrataTheme["character"]> {
  return { name: character.name, status: character.status, provisional: applied.filter(path => isProvisional(character, path)) };
}

/** Loads a theme serialised with `toJSON()` (or any W3C Design Tokens source in Strata's shape) and validates it. */
export function loadStrataTheme(json: TokenGroup, options: Pick<CreateThemeOptions, "strict"> = {}): StrataTheme {
  return createStrataTheme({}, { ...options, base: json });
}

/** Every token path a theme can set, for tooling. */
export function themeTokenPaths(source: TokenGroup = strataSource): string[] {
  return flatten(source).map(token => token.path);
}
