/**
 * The premium character's numbers for the Phase I1 prototype page (`ui-proto-instrument.html`,
 * docs/ui-library/instrument.md, Phase I1): one place for every proportion, height, travel, throw, spring and material
 * the three presentations (Instrument meshes, Strata Objects, CSS) read, so a variant is a set of tuning values and
 * everything else follows. Heights are the 50% depth values, scaled by Strata's `depthScale` (0.6 at 0%, 1 at 50%,
 * 1.6 at 100%); widths, travel and angles do not scale with depth. Throwaway prototype code: Phase I1's spec work
 * copies the accepted numbers into the design language and `premium.json`.
 *
 * Second iteration: the materials take I0.4's settled values (brushed base 0.86 linear, roughness 0.3, anisotropy 0.9
 * with the grain map; lacquer roughness 0.5, coat 1 at 0.03; gold through its base colour at roughness 0.18; chrome
 * 0.04), glass is the capture-refraction shader, chamfers are 2 px, the bat lever is longer with a bigger ball and a
 * wider throw, the rocker and wall paddles tip further with an accent flag, the push button travels further, and the
 * panel gains a display window.
 *
 * Characters (Phase I5): `character` picks the token bundle the page resolves its materials, springs, glow, pointer and
 * room from: premium's numbers are the tables below; any other is `@underglass/ui`'s bundle (`characters/studio.json`)
 * laid over them, read through the library's own `createStrataTheme` and `instrumentSettings`, so the page proves the
 * bundle and not a copy of it.
 */
import { createStrataTheme, instrumentSettings, resolve, strataTokens } from "@underglass/ui/tokens";

/** The tuning values a variant is made of; every one is in the page's query string. */
export interface TuningValues {
  /** The character (design language section 19): its bundle sets the materials, springs, glow, pointer and room. */
  character: CharacterName;
  /** 0–100. */
  depth: number;
  capMaterial: MaterialName;
  skirtMaterial: MaterialName;
  /** The faceplate and wall plate; `auto` follows the theme (brushed aluminium on light, gunmetal on dark). */
  plateMaterial: MaterialName | "auto";
  /** Knob skirt diameter, CSS px (the detented knob is 80% of it). */
  size: number;
  /** Skirt (flange) height at 50% depth, CSS px. */
  skirt: number;
  /** Cap chamfer, CSS px. */
  chamfer: number;
  /** Fader travel, CSS px. */
  travel: number;
  /** Detented knob positions. */
  detents: number;
  /** Key light intensity. */
  light: number;
  /** Studio reflections (environment intensity). */
  reflections: number;
  /** The pointer light (1 on, 0 off). */
  pointer: number;
  theme: "light" | "dark";
}

export const characterNames = ["premium", "studio", "playful"] as const;
export type CharacterName = (typeof characterNames)[number];
export const materialNames = ["brushed", "polished", "lacquer", "glass", "gold", "gunmetal", "anodised", "rubberSky", "candyYellow", "candyMint", "candyGrape"] as const;
export type MaterialName = (typeof materialNames)[number];
type Rgb = readonly [number, number, number];

/**
 * A material recipe: the PBR numbers the Instrument level uses, and the colours the Objects (flat face colour) and CSS
 * (base, highlight and shade of the gradients) presentations use for the same material.
 */
export interface MaterialRecipe {
  label: string;
  /** sRGB base colour (for metals, the specular colour F0). */
  colour: Rgb;
  metallic: number;
  roughness: number;
  /** Brushed-metal anisotropy 0–1 (`brush.strength`), with the grain normal map. */
  brush: number;
  coat: number;
  coatRoughness: number;
  /** How bright the studio reflections are on it. */
  environment: number;
  /** Lite's `directIntensity`: the share of the key light's direct term. */
  direct: number;
  /** Print colour on this material (pointer lines, grip lines). */
  ink: Rgb;
  /** Glass: drawn by the capture-refraction shader instead of Lite PBR. */
  glass?: boolean;
  /** CSS rendering: the colour of the face, its lit edge and its shaded edge. */
  css: { base: Rgb; light: Rgb; shade: Rgb; gloss: number };
  /** The faceplate in this material (printed text sits on it). */
  plate: { base: Rgb; ink: Rgb; muted: Rgb; grain: number };
}

export const materials: Record<MaterialName, MaterialRecipe> = {
  brushed: {
    label: "Brushed aluminium", colour: [239, 240, 241], metallic: 1, roughness: 0.3, brush: 0.9, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [26, 28, 32], css: { base: [204, 206, 210], light: [248, 249, 250], shade: [128, 131, 137], gloss: 0.35 },
    plate: { base: [206, 208, 211], ink: [22, 23, 26], muted: [50, 52, 57], grain: 0.05 },
  },
  polished: {
    label: "Polished aluminium", colour: [250, 250, 251], metallic: 1, roughness: 0.04, brush: 0, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [26, 28, 32], css: { base: [214, 216, 220], light: [255, 255, 255], shade: [92, 95, 101], gloss: 0.8 },
    plate: { base: [222, 224, 227], ink: [22, 23, 26], muted: [50, 52, 57], grain: 0.015 },
  },
  lacquer: {
    label: "Black lacquer", colour: [28, 28, 30], metallic: 0, roughness: 0.5, brush: 0, coat: 1, coatRoughness: 0.03, environment: 1, direct: 1,
    ink: [236, 237, 240], css: { base: [24, 24, 27], light: [120, 122, 128], shade: [4, 4, 5], gloss: 0.9 },
    plate: { base: [24, 24, 27], ink: [236, 237, 240], muted: [196, 198, 204], grain: 0 },
  },
  glass: {
    label: "Glass", colour: [236, 240, 244], metallic: 0, roughness: 0.02, brush: 0, coat: 1, coatRoughness: 0, environment: 1.5, direct: 1, glass: true,
    ink: [30, 32, 36], css: { base: [196, 206, 212], light: [255, 255, 255], shade: [70, 82, 92], gloss: 1 },
    plate: { base: [30, 34, 39], ink: [236, 239, 243], muted: [196, 202, 210], grain: 0 },
  },
  gold: {
    label: "Gold", colour: [255, 219, 147], metallic: 1, roughness: 0.18, brush: 0, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [52, 38, 14], css: { base: [208, 178, 118], light: [252, 236, 196], shade: [128, 100, 56], gloss: 0.45 },
    plate: { base: [202, 178, 130], ink: [26, 20, 10], muted: [48, 38, 22], grain: 0.04 },
  },
  anodised: {
    label: "Black anodised", colour: [42, 44, 49], metallic: 0.85, roughness: 0.5, brush: 0.6, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [236, 237, 240], css: { base: [40, 42, 47], light: [96, 99, 106], shade: [12, 13, 15], gloss: 0.2 },
    plate: { base: [34, 36, 41], ink: [240, 241, 244], muted: [204, 207, 214], grain: 0.05 },
  },
  gunmetal: {
    label: "Dark gunmetal", colour: [104, 107, 114], metallic: 1, roughness: 0.36, brush: 0.9, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [236, 237, 240], css: { base: [76, 79, 86], light: [164, 168, 176], shade: [28, 30, 34], gloss: 0.3 },
    plate: { base: [56, 58, 64], ink: [238, 239, 242], muted: [198, 201, 208], grain: 0.04 },
  },
  rubberSky: {
    label: "Sky rubber", colour: [45, 147, 255], metallic: 0, roughness: 0.82, brush: 0, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [26, 18, 64], css: { base: [58, 160, 240], light: [140, 208, 255], shade: [20, 92, 170], gloss: 0.1 },
    plate: { base: [58, 160, 240], ink: [20, 14, 52], muted: [26, 18, 64], grain: 0 },
  },
  candyYellow: {
    label: "Sun-yellow lacquer", colour: [255, 209, 46], metallic: 0, roughness: 0.35, brush: 0, coat: 1, coatRoughness: 0.04, environment: 1, direct: 1,
    ink: [52, 38, 14], css: { base: [250, 200, 40], light: [255, 240, 150], shade: [170, 120, 10], gloss: 0.9 },
    plate: { base: [250, 204, 52], ink: [30, 22, 6], muted: [60, 44, 8], grain: 0 },
  },
  candyMint: {
    label: "Mint lacquer", colour: [95, 214, 192], metallic: 0, roughness: 0.4, brush: 0, coat: 1, coatRoughness: 0.05, environment: 1, direct: 1,
    ink: [20, 18, 58], css: { base: [88, 208, 186], light: [190, 246, 234], shade: [30, 130, 112], gloss: 0.9 },
    plate: { base: [95, 214, 192], ink: [20, 18, 58], muted: [34, 30, 86], grain: 0 },
  },
  candyGrape: {
    label: "Grape lacquer", colour: [59, 38, 128], metallic: 0, roughness: 0.4, brush: 0, coat: 1, coatRoughness: 0.05, environment: 1, direct: 1,
    ink: [255, 246, 224], css: { base: [58, 38, 124], light: [140, 110, 220], shade: [20, 10, 56], gloss: 0.9 },
    plate: { base: [59, 38, 128], ink: [255, 246, 224], muted: [226, 214, 255], grain: 0 },
  },
};

/** Premium's tables as shipped; a character is laid over a copy of them each time the tokens resolve. */
const pristine = structuredClone(materials);

export const defaults: TuningValues = {
  character: "premium", depth: 50, capMaterial: "brushed", skirtMaterial: "polished", plateMaterial: "auto",
  size: 64, skirt: 2.5, chamfer: 2, travel: 180, detents: 11, light: 1.6, reflections: 1, pointer: 1, theme: "light",
};

/** Strata's `depthScale`: 0.6 at 0%, 1 at 50%, 1.6 at 100%, piecewise linear. */
export const depthScale = (depth: number) => { const d = Math.min(1, Math.max(0, depth / 100)); return d < 0.5 ? 0.6 + 0.8 * d : 1 + 1.2 * (d - 0.5); };
/** Strata's `shadow.strength`: 0.14, 0.24, 0.32. */
export const shadowStrength = (depth: number) => { const d = Math.min(1, Math.max(0, depth / 100)); return d < 0.5 ? 0.14 + 0.2 * d : 0.24 + 0.16 * (d - 0.5); };

/** The spring constants the page's controls use, by name (design language section 12). */
export type SpringSet = Record<"knob" | "detent" | "fader" | "slide" | "rocker" | "bat" | "wall" | "button", { stiffness: number; damping: number }>;
/** What a character's bundle gives the page: see `characterLook`. */
export interface CharacterLook {
  name: CharacterName;
  /** Each material role's preset, as the page's material names. */
  roles: { knobCap: MaterialName; knobSkirt: MaterialName; plate: MaterialName };
  springs: SpringSet;
  /** The glow (`colour.glowOn`) and the pointer's width, px. */
  accent: Rgb;
  pointerWidth: number;
  /** The room (`studio.*`) and its strength (`environment.intensity`). */
  room: { key: number; keyRadius: number; fill: number; front: number; strip: number; floor: number; ceiling: number };
  environment: number;
  /** The values the page sets when this character is chosen: the roles' materials, the room's strength. */
  choose: Partial<TuningValues>;
}
const roomOf = (values: Record<string, unknown>) => Object.fromEntries((["key", "keyRadius", "fill", "front", "strip", "floor", "ceiling"] as const)
  .map(key => [key, Number(values[`studio.${key}`])])) as CharacterLook["room"];
const presetOf: Record<MaterialName, string> = { brushed: "metal", polished: "polished", lacquer: "lacquer", glass: "glass", gold: "gold", gunmetal: "gunmetal", anodised: "anodised", rubberSky: "rubberSky", candyYellow: "candyYellow", candyMint: "candyMint", candyGrape: "candyGrape" };
const hexRgb = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as unknown as Rgb;
const scale = (colour: Rgb, ratio: Rgb): Rgb => colour.map((channel, index) => Math.min(255, Math.round(channel * ratio[index]!))) as unknown as Rgb;
/** The page's material for a preset name (`metal` is the brushed material). */
const materialOf = (preset: string): MaterialName => (Object.entries(presetOf).find(([, name]) => name === preset)?.[0] ?? "brushed") as MaterialName;

/**
 * A character's look, read from its bundle through the library (`createStrataTheme`, `instrumentSettings`): the materials
 * of the tables above are replaced, in place, by the bundle's recipes (colour, roughness, metallic, brush; the CSS
 * gradients and the faceplate are scaled by the colour's change from premium's), so every presentation that reads
 * `materials` follows. Premium restores the tables as shipped.
 */
export function characterLook(name: CharacterName, theme: "light" | "dark"): CharacterLook {
  for (const key of materialNames) Object.assign(materials[key], structuredClone(pristine[key]));
  const source = createStrataTheme({ character: name }).source, values = resolve(source, { theme, depth: 0.5 });
  const settings = instrumentSettings(strataTokens, { character: name, theme });
  for (const key of materialNames) {
    const recipe = settings.materials[presetOf[key]];
    if (!recipe?.base?.colour || key === "glass" || name === "premium") continue;
    const base = pristine[key], colour = hexRgb(recipe.base.colour), ratio = colour.map((channel, index) => channel / Math.max(1, base.colour[index]!)) as unknown as Rgb;
    Object.assign(materials[key], { colour, metallic: recipe.base.metallic ?? base.metallic, roughness: recipe.base.roughness ?? base.roughness, brush: recipe.brush?.strength ?? 0,
      coat: recipe.coat?.strength ?? 0, coatRoughness: recipe.coat?.roughness ?? 0,
      css: { ...base.css, base: scale(base.css.base, ratio), light: scale(base.css.light, ratio), shade: scale(base.css.shade, ratio) } });
    // The cap's material (the metal, or hifi's champagne) carries the character's ink (a knob's pointer, a fader's grip).
    if (key === materialOf(settings.roles.knobCap!) && values["instrument.ink.cap"]) materials[key].ink = hexRgb(String(values["instrument.ink.cap"]));
  }
  const spring = (key: string) => ({ stiffness: Number(values[`spring.${key}.stiffness`]), damping: Number(values[`spring.${key}.damping`]) });
  const roles = { knobCap: materialOf(settings.roles.knobCap!), knobSkirt: materialOf(settings.roles.knobSkirt!), plate: materialOf(settings.roles.plate!) };
  const environment = Number(values["environment.intensity"] ?? 1);
  return {
    name, roles, accent: hexRgb(String(values["colour.glowOn"])), pointerWidth: Number.parseFloat(String(values["knob.pointer.width"])),
    springs: { knob: spring("knob"), detent: spring("detent"), fader: spring("fader"), slide: spring("slide"), rocker: spring("rocker"), bat: spring("bat"), wall: spring("wall"), button: spring("button") },
    room: roomOf(values), environment, choose: { capMaterial: roles.knobCap, skirtMaterial: roles.knobSkirt, plateMaterial: "auto", reflections: environment },
  };
}

/** Everything the presentations draw, resolved from the tuning values. CSS px, radians. */
export function resolveTokens(values: TuningValues) {
  const s = depthScale(values.depth), look = characterLook(values.character, values.theme);
  const plateName: MaterialName = values.plateMaterial === "auto" ? look.roles.plate : values.plateMaterial;
  const knob = (size: number) => {
    const cap = Math.round(size * 0.8);
    return {
      /** Skirt diameter, cap diameter and the native box (the dial: skirt plus the printed scale). */
      size, cap, box: size + 76,
      skirtHeight: values.skirt * s, capHeight: 16 * s, chamfer: Math.min(values.chamfer, cap / 2 - 2),
      /** The top's spun crown (a shallow dome, so the top shows the studio, not one grey). */
      crown: 1.2 * s,
      /** Edge break on the skirt's rim. */
      skirtBreak: Math.min(0.8, (values.skirt * s) / 2),
      /** The skirt top's slope (a shallow cone), radians. */
      skirtSlope: (7.5 * Math.PI) / 180,
      /** Engraved pointer line, from `from` to `to` of the top's radius. */
      pointer: { width: look.pointerWidth, from: 0.28, to: 0.86, rise: 0.08 },
      /** A glass cap: a short wall and a superellipse dome (a plano-convex lens over the printed hub). */
      dome: { wall: 2 * s, exponent: 2, height: 22 * s, radius: Math.round(cap * 0.45) },
      /** The printed hub ring under the cap's centre (seen through a glass cap). */
      hub: 7,
      sweep: (270 * Math.PI) / 180,
    };
  };
  return {
    values, depthScale: s, shadow: { strength: shadowStrength(values.depth), contact: 0.22 },
    light: { azimuth: 323, elevation: 41, intensity: values.light, ambient: 0.35, environment: values.reflections },
    character: look,
    materials: { cap: values.capMaterial, skirt: values.skirtMaterial, plate: plateName },
    knob: knob(values.size), small: knob(Math.round(values.size * 0.8)),
    detents: Math.max(2, Math.round(values.detents)),
    fader: { travel: values.travel, width: 30, length: 42, height: 12 * s, taper: 0.6, chamfer: 2, radius: 3, box: 46, grip: { width: 1.6, rise: 0.08 } },
    slide: { box: [64, 28] as const, block: [24, 20] as const, height: 6 * s, taper: 0.4, chamfer: 2, radius: 3, inset: 6, slot: [50, 8] as const, flag: 0.06 },
    rocker: { box: [38, 62] as const, bezel: [38, 62] as const, bezelHeight: 2 * s, bezelTaper: 0.8, paddle: [28, 50] as const, end: 12 * s, centre: 4 * s, flag: [18, 9] as const },
    bat: { box: [48, 92] as const, nut: 12, nutHeight: 3 * s, bushing: 7, bushingHeight: 7 * s, length: 40 * Math.min(s, 1.15), pivot: 5 * s, base: 3.4, neck: 2.7, ball: 5.6, throw: (40 * Math.PI) / 180 },
    wall: { box: [66, 92] as const, plateHeight: 3 * s, plateTaper: 1, radius: 6, paddle: [30, 54] as const, paddleHeight: 7 * s, paddleTaper: 0.6, chamfer: 2, crown: 1.6, throw: (9 * Math.PI) / 180, flag: [12, 4] as const },
    button: { box: 64, cap: 40, height: 6 * s, taper: 0.6, chamfer: 2, travel: 4 * s, latch: 1.8 * s, bezel: [27, 22.6] as const, bezelHeight: 3.2 * s, ring: [22.6, 20.6] as const },
    /** The display window: a bezel (border, rise, chamfer) round a flat glass pane over the backlit window. */
    display: { box: [236, 58] as const, radius: 8, edge: 0.5, border: 7, rise: 2.4 * s, taper: 1.2, chamfer: 2, glass: 2.4 * s, glassTaper: 2.6, band: 0.3, horizon: 0.25 },
    accent: look.accent,
    /** Springs (stiffness, damping, per unit mass) and the reduced-motion form: an instant pose. */
    springs: look.springs,
  };
}
export type ResolvedTokens = ReturnType<typeof resolveTokens>;

/** Reads tuning values from a query string, falling back to the defaults for anything missing or invalid. */
export function parseValues(search: string): TuningValues {
  const params = new URLSearchParams(search), values: TuningValues = { ...defaults };
  const number = (key: keyof TuningValues, min: number, max: number) => {
    const raw = params.get(key);
    if (raw !== null && Number.isFinite(Number(raw))) (values as unknown as Record<string, number>)[key] = Math.min(max, Math.max(min, Number(raw)));
  };
  number("depth", 0, 100); number("size", 40, 96); number("skirt", 0, 8); number("chamfer", 0, 6); number("travel", 100, 260); number("detents", 2, 24); number("light", 0.5, 3); number("reflections", 0, 2); number("pointer", 0, 1);
  for (const key of ["capMaterial", "skirtMaterial"] as const) { const raw = params.get(key); if (raw && (materialNames as readonly string[]).includes(raw)) values[key] = raw as MaterialName; }
  const plate = params.get("plateMaterial");
  if (plate && (plate === "auto" || (materialNames as readonly string[]).includes(plate))) values.plateMaterial = plate as TuningValues["plateMaterial"];
  if (params.get("theme") === "dark") values.theme = "dark";
  const character = params.get("character");
  if (character && (characterNames as readonly string[]).includes(character)) values.character = character as CharacterName;
  return values;
}
/** The query string for `values` (only what differs from the defaults). */
export function queryOf(values: TuningValues): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults) as (keyof TuningValues)[]) if (values[key] !== defaults[key]) params.set(key, String(values[key]));
  const text = params.toString();
  return text ? `?${text}` : "";
}
