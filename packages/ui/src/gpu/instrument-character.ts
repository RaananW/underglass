/**
 * The Instrument materials of a character (design language sections 4 and 19). The part tables
 * (`premiumMaterials`, `faderMaterials`, `switchMaterials`) are the premium character's numbers; with a character on
 * the page (`data-strata-character`, the stylesheet of `tokens/character-css.ts`) its tokens are custom properties, and
 * this builds the same named materials from them: each role's preset (`material.roles.knobCap`, ...), that preset's
 * layers (`instrument.material.<preset>.*`) and the cap's ink (`instrument.ink.cap`). Without a character the custom
 * properties are not there and the premium tables stand, so a page that never names one is unchanged. Premium's own
 * block restates its tokens, and builds the premium tables exactly (a unit test holds it to that).
 */
import type { InstrumentRecipe } from "./instrument.ts";

type Raw = (path: string) => string;
/** The premium cap ink, where a character names none. */
const PREMIUM_INK = "#26282c";

/** The materials a character names, by the names the part tables use; undefined when no character is on the page. */
export function characterMaterials(raw: Raw, glow: string): Record<string, InstrumentRecipe> | undefined {
  if (!raw("instrument.material.metal.base.colour")) return undefined;
  const number = (path: string, fallback: number) => { const value = Number.parseFloat(raw(path)); return Number.isFinite(value) ? value : fallback; };
  const role = (name: string) => raw(`material.roles.${name}`) || "metal";
  /** One preset's recipe: the base layer, and the brush and grain where the preset has them. */
  const preset = (name: string, direction: "circular" | "linear", { grain = false, brush = true } = {}): InstrumentRecipe => {
    const at = `instrument.material.${name}`;
    const recipe: InstrumentRecipe = { base: { colour: raw(`${at}.base.colour`) || "#eff0f1", metallic: number(`${at}.base.metallic`, 1), roughness: number(`${at}.base.roughness`, 0.3), direct: number(`${at}.base.direct`, 1) } };
    const strength = number(`${at}.brush.strength`, 0);
    if (brush && strength > 0) recipe.brush = { strength, direction };
    const hairline = number(`${at}.grain.strength`, 0);
    if (grain && hairline > 0) recipe.grain = { kind: "hairline", strength: hairline };
    // A coated preset (hifi's oiled walnut) names its coat; the premium presets in use have none.
    const coat = number(`${at}.coat.strength`, 0);
    if (coat > 0) recipe.coat = { strength: coat, roughness: number(`${at}.coat.roughness`, 0), ior: number(`${at}.coat.ior`, 1.5) };
    return recipe;
  };
  /** The same metal polished: the chamfer of a cap and a lever. */
  const polished = (recipe: InstrumentRecipe): InstrumentRecipe => ({ base: { ...recipe.base, roughness: Math.min(recipe.base?.roughness ?? 0.06, 0.06) } });
  const ink: InstrumentRecipe = { base: { colour: raw("instrument.ink.cap") || PREMIUM_INK, roughness: 0.6 } };
  const flag = (strength: number): InstrumentRecipe => ({ base: { colour: glow, roughness: 0.5 }, emissive: { strength, colour: glow } });
  const knobCap = preset(role("knobCap"), "circular", { grain: true });
  const faderCap = preset(role("faderCap"), "linear", { grain: true });
  const plate = preset(role("plate"), "linear");
  return {
    knobCap, knobSkirt: preset(role("knobSkirt"), "circular", { grain: true }), knobChamfer: polished(knobCap), knobInk: ink,
    faderCap, faderChamfer: polished(faderCap), faderInk: ink,
    switchCap: faderCap, switchChamfer: polished(faderCap), switchLever: polished(preset(role("lever"), "linear")),
    switchBezel: preset(role("bezel"), "circular", { brush: false }), switchPlate: plate, switchPlateDark: plate, switchInk: ink,
    switchFlagOn: flag(1), switchFlagOff: flag(0.12),
  };
}
