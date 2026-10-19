/**
 * Characters (design language section 19): a character is a bundle of Instrument tokens that gives the hardware its
 * proportions, finish and feel. It is a validated theme layer over the defaults, so an application's theme still
 * overrides any of its tokens. The first is `premium` (`characters/premium.json`, W3C Design Tokens), whose provisional
 * values are listed inside the file so the runtime can report them in development; `studio` (`characters/studio.json`) is
 * a sparse layer that sets only what differs from it, as is `hifi` (`characters/hifi.json`).
 *
 * A character may set its own part, spring, emitter and material tokens, its sound set (`feedback.<sound>.*`), the `glowOn` and `glowOff` colours, and (only
 * as the application's character) the studio and the environment. It may not set the light, the elevation order, any
 * other colour role, focus, target size, the guard or any invariant: such values are reported and not applied.
 */
import premium from "./characters/premium.json" with { type: "json" };
import studio from "./characters/studio.json" with { type: "json" };
import hifi from "./characters/hifi.json" with { type: "json" };
import { flatten, namespace, numeric, valueOf, type ResolveOptions, type Token, type TokenGroup, type TokenNode } from "./model.ts";
import { sceneSettings } from "./scene.ts";
import type { InstrumentRecipe, InstrumentScene, StudioTokens } from "./instrument.ts";
import type { Issue } from "./validate.ts";

/** A character's metadata, under `$extensions["dev.underglass.strata"].character` on its root. */
export interface CharacterInfo {
  name: string;
  version: number;
  status: string;
  source?: string;
  /** Token paths, or path prefixes, whose values are still provisional (`instrument-spec-notes.md`). */
  provisional: string[];
  /** The built-in character this one is laid over (`studio` over `premium`): it sets only what differs. */
  extends?: string;
}
/** A character: its metadata and its token layer. */
export interface StrataCharacter extends CharacterInfo {
  tokens: TokenGroup;
}

/** The built-in characters by name. */
const builtIn: Record<string, TokenGroup> = { premium: premium as TokenGroup, studio: studio as TokenGroup, hifi: hifi as TokenGroup };
/** The names of the built-in characters (`premium`, `studio`, `hifi`); `premium` is the default. */
export const characterNames = Object.keys(builtIn);
export const defaultCharacter = "premium";

/** A character from its name or its token layer, or an issue when there is none. */
export function characterOf(input: string | TokenGroup): StrataCharacter | Issue {
  const tokens = typeof input === "string" ? builtIn[input] : input;
  if (!tokens) return { path: "character", message: `${String(input)} is not a Strata character (${characterNames.join(", ")})` };
  const info = (tokens.$extensions?.[namespace] as { character?: Partial<CharacterInfo> } | undefined)?.character;
  if (!info || typeof info.name !== "string") return { path: "character", message: "has no character metadata ($extensions.dev.underglass.strata.character.name)" };
  return { name: info.name, version: info.version ?? 1, status: info.status ?? "draft", ...(info.source ? { source: info.source } : {}), ...(info.extends ? { extends: info.extends } : {}),
    provisional: Array.isArray(info.provisional) ? info.provisional.map(String) : [], tokens };
}
const isIssue = (value: StrataCharacter | Issue): value is Issue => "message" in value;

/** The colour roles a character may set (design language section 19). */
const characterColours = ["glowOn", "glowOff"];
/** Why a character may not set a token at `path` (design language section 19), or undefined when it may. */
function forbidden(path: string, base: Token | undefined, scoped: boolean): string | undefined {
  if (/^light\./.test(path)) return "is the application's one light: a character may not set it";
  if (/^elevation\./.test(path)) return "is part of the elevation order: a character may not set it";
  if (/^colour\./.test(path) && !characterColours.includes(path.slice(7))) return "is a colour role: a character sets only glowOn and glowOff";
  if (/^(focus|target|interior|outline)\./.test(path)) return "keeps an invariant (focus, target size, the guard): a character may not set it";
  // A character's sound set is its own (section 20); whether feedback is on (`feedback.sound`, `feedback.haptics`) never is.
  if (/^(post|feedback|motion)\./.test(path) && !/^feedback\.(click|tick|thunk|snap)\./.test(path)) return "is not a character's to set (the post chain, whether feedback is on, reduced motion)";
  if (base?.meta.invariant) return "is an invariant: a character may not set it";
  if (scoped && /^(environment|studio)\./.test(path)) return "is application only: a scoped character's value is reported and not applied";
  return undefined;
}

/** The node at a dotted path in `source`, creating groups on the way when `create` is set. */
function nodeAt(source: TokenGroup, path: string, create = false): { parent: Record<string, unknown>; key: string } | undefined {
  const keys = path.split(".");
  let group = source as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    let next = group[key];
    if (next === undefined && create) { next = {}; group[key] = next; }
    if (typeof next !== "object" || next === null || "$value" in next) return undefined;
    group = next as Record<string, unknown>;
  }
  return { parent: group, key: keys[keys.length - 1]! };
}

/** The outcome of laying a character over a token source. */
export interface AppliedCharacter {
  /** A copy of the source with the character's tokens. */
  source: TokenGroup;
  character?: StrataCharacter;
  /** Values the character may not set, reported and not applied, and values outside their range. */
  issues: Issue[];
  /** The token paths the character set. */
  applied: string[];
}
/**
 * Lays a character over a token source (design language section 19). A token the source already has keeps its range,
 * scope and options; the character changes its value (and its depth anchors or per-theme values). New tokens are added
 * as the character defines them. Forbidden tokens are reported and skipped; `scoped` marks a character applied to a
 * subtree, whose studio and environment are reported too.
 */
export function applyCharacter(source: TokenGroup, input: string | TokenGroup, { scoped = false }: { scoped?: boolean } = {}): AppliedCharacter {
  let result = structuredClone(source);
  const issues: Issue[] = [], applied: string[] = [];
  const character = characterOf(input);
  if (isIssue(character)) return { source: result, issues: [character], applied };
  // A character that extends another is laid over it: the parent first, then only what it sets.
  if (character.extends) {
    const parent = applyCharacter(source, character.extends, { scoped });
    result = parent.source; issues.push(...parent.issues); applied.push(...parent.applied);
  }
  const base = new Map(flatten(result).map(token => [token.path, token]));
  for (const token of flatten(character.tokens)) {
    const existing = base.get(token.path), reason = forbidden(token.path, existing, scoped);
    if (reason) { issues.push({ path: token.path, message: `${reason} (character ${character.name})` }); continue; }
    const slot = nodeAt(result, token.path, true);
    if (!slot) { issues.push({ path: token.path, message: `does not fit the token tree (character ${character.name})` }); continue; }
    const { path: _path, meta, ...node } = token;
    void _path;
    if (existing) {
      // The default's range and scope stay; the character sets the value, and its anchors and themes if it has them.
      const target = slot.parent[slot.key] as TokenNode, kept = { ...(target.$extensions?.[namespace] ?? {}) };
      delete kept.anchors; delete kept.themes;
      if (meta.anchors) kept.anchors = meta.anchors;
      if (meta.themes) kept.themes = meta.themes;
      target.$value = structuredClone(token.$value);
      target.$extensions = { ...(target.$extensions ?? {}), [namespace]: kept };
      const value = typeof token.$value === "number" || token.$type === "dimension" ? numeric(token.$value) : undefined;
      if (value !== undefined && ((kept.min !== undefined && value < kept.min) || (kept.max !== undefined && value > kept.max))) {
        issues.push({ path: token.path, message: `${value} is outside the token's range ${kept.min ?? "−∞"}–${kept.max ?? "∞"} (character ${character.name})` });
      }
    } else slot.parent[slot.key] = structuredClone({ ...node, ...(Object.keys(meta).length ? { $extensions: { [namespace]: meta } } : {}) });
    if (!applied.includes(token.path)) applied.push(token.path);
  }
  return { source: result, character, issues, applied };
}

/** Whether a token path is provisional in a character (its own path, or under a provisional prefix). */
export function isProvisional(character: Pick<CharacterInfo, "provisional">, path: string): boolean {
  return character.provisional.some(prefix => path === prefix || path.startsWith(`${prefix}.`));
}

/** An Instrument scene's settings from a token source: everything but the extent, camera, primitives and parts. */
export interface InstrumentSettings extends Pick<InstrumentScene, "backdrop" | "light" | "bevel" | "shadow" | "interior" | "state" | "focus" | "environment"> {
  /** The Instrument column of every preset (design language section 4), by preset name. */
  materials: Record<string, InstrumentRecipe>;
  /** Each material role's preset, for this theme. */
  roles: Record<string, string>;
  /** The character the settings came from, if any. */
  character?: string;
}
/**
 * An Instrument scene's settings (rendering model section 3, `instrumentSettings`) from a token source and a character,
 * resolved for a depth and a theme: the face's settings as `sceneSettings` gives them, the key light with its
 * Instrument intensity and no fill (2D.1), the studio and its strength, the shadow map's defaults (2D.7), and the
 * Instrument column of every preset as a recipe with its base colour.
 */
export function instrumentSettings(tokens: TokenGroup, { depth = 0.5, theme = "light", character }: ResolveOptions & { character?: string | TokenGroup } = {}): InstrumentSettings {
  const source = character === undefined ? tokens : applyCharacter(tokens, character).source;
  const options = { depth, theme }, face = sceneSettings(source, options), all = flatten(source);
  const values = new Map(all.map(token => [token.path, valueOf(token, options)]));
  const resolve = (value: unknown): unknown => {
    for (let hops = 0; typeof value === "string" && /^\{[^}]+\}$/.test(value) && hops < 8; hops++) value = values.get(value.slice(1, -1));
    return value;
  };
  const at = (path: string, fallback: number) => (values.has(path) ? numeric(values.get(path)!) : fallback);
  const materials: Record<string, InstrumentRecipe> = {};
  for (const token of all.filter(token => token.path.startsWith("instrument.material."))) {
    const [, , preset, layer, key] = token.path.split(".") as [string, string, string, string, string];
    if (!key) continue;
    const recipe = (materials[preset] ??= {}) as Record<string, Record<string, unknown>>;
    const value = resolve(values.get(token.path));
    (recipe[layer] ??= {})[key] = typeof value === "number" || token.$type === "number" ? numeric(value as number) : value;
  }
  const studio = Object.fromEntries((["key", "keyRadius", "fill", "front", "strip", "floor", "ceiling"] as const).flatMap(key => (values.has(`studio.${key}`) ? [[key, at(`studio.${key}`, 0)]] : []))) as Partial<StudioTokens>;
  const roles = Object.fromEntries(all.filter(token => token.path.startsWith("material.roles.")).map(token => [token.path.slice(15), String(values.get(token.path))]));
  return {
    backdrop: face.backdrop,
    light: { ...face.light, intensity: at("light.intensity", 1.6), ambient: 0 },
    bevel: face.bevel, shadow: { strength: face.shadow.strength, map: { size: 4096, bias: 1.95, darkness: 0.1 } },
    interior: face.interior, state: face.state, focus: face.focus,
    environment: { source: "studio", strength: at("environment.intensity", 1), ...(Object.keys(studio).length ? { studio } : {}) },
    materials, roles,
    ...(character !== undefined ? { character: typeof character === "string" ? character : String((characterOf(character) as StrataCharacter).name) } : {}),
  };
}
