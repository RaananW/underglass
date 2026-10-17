/**
 * Scenes for `instrument-emitters-core.html` (core work item 2, `docs/ui-library/instrument-phase2.md`): each enrolled
 * panel's real controls at the Relief, Objects or Instrument level, as version 4 scenes with their emitters and
 * protected text rects, for core's `relief`, `objects` and `instrument` materials. Native state drives the light: a
 * checked lamp, the LED and a pressed ring button are emitters; the pointer light is one more, written by the page.
 * Nothing here is a core API: it is what the Strata GPU helper will build in its own PR.
 */
import type { InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentRecipe, InstrumentScene, ReliefScene, SceneEmitter } from "@underglass/core";

export type Level = "relief" | "objects" | "instrument";
export interface Theme { name: "light" | "dark"; stage: string; panel: string; body: string; metal: string; knob: string }
export const themes: Record<Theme["name"], Theme> = {
  light: { name: "light", stage: "#dee1e6", panel: "#e9ebef", body: "#f7f8fa", metal: "#eceef0", knob: "#fcfcfd" },
  dark: { name: "dark", stage: "#181a1f", panel: "#2c3038", body: "#3e434e", metal: "#8a8d94", knob: "#eceef2" },
};
/** The emitter tokens (design language section 3; I0.3's values), in CSS px. */
export const tokens = {
  lamp: { diameter: 28, height: 20, reach: 6, strength: 3200, colour: [1, 0.72, 0.38] as [number, number, number], bright: 1.5 },
  led: { diameter: 10, height: 8, reach: 6, strength: 520, colour: [0.35, 1, 0.45] as [number, number, number] },
  ring: { diameter: 44, height: 10, radius: 120, strength: 1200, colour: [0.31, 0.59, 1] as [number, number, number] },
  pointer: { strength: 16000, radius: 360, height: 120, colour: [1, 0.95, 0.88] as [number, number, number], face: 0.3, feather: 10, fade: 120 },
  /** The light (and shadow) outset past a panel's edge. */
  outset: 48,
  interiorMax: 0.04,
};
/** The stage camera: `D` = 2,400, the camera rule's floor (2D.3). */
export const CAMERA_DISTANCE = 2400;

/** A control's layout box in its layer's CSS px. */
export function rectOf(element: Element, layer: HTMLElement): [number, number, number, number] {
  const box = element.getBoundingClientRect(), base = layer.getBoundingClientRect();
  return [box.left - base.left, box.top - base.top, box.width, box.height];
}
/** The layer-local boxes of every text run in `layer` (its protected rects), from Range client rects. */
export function textRects(layer: HTMLElement): [number, number, number, number][] {
  const base = layer.getBoundingClientRect(), rects: [number, number, number, number][] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || node.parentElement?.closest("select, option")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) rects.push([box.left - base.left, box.top - base.top, box.width, box.height]);
  }
  return rects;
}
/** Whether a lamp, an LED or a ring button gives light now. */
export function lit(element: HTMLElement) {
  if (element instanceof HTMLInputElement) return element.checked;
  if (element.dataset.emitter === "ring") return element.getAttribute("aria-pressed") === "true";
  return true;
}
/** The emitters a panel's own controls carry now, in its layer px (lit or not: an unlit one has strength 0). */
export function ownEmitters(layer: HTMLElement): SceneEmitter[] {
  return [...layer.querySelectorAll<HTMLElement>("[data-emitter]")].map(element => {
    const [x, y, w, h] = rectOf(element, layer), cx = x + w / 2, cy = y + h / 2, on = lit(element);
    const kind = element.dataset.emitter;
    if (kind === "lamp") {
      const t = tokens.lamp, bright = element.id === "c-lamp" ? t.bright : 1;
      return { position: [cx, cy, t.height], colour: t.colour, strength: on ? t.strength * bright : 0, radius: t.reach * t.diameter };
    }
    if (kind === "led") return { position: [cx, cy, tokens.led.height], colour: tokens.led.colour, strength: on ? tokens.led.strength : 0, radius: tokens.led.reach * tokens.led.diameter };
    return { position: [cx, cy, tokens.ring.height], colour: tokens.ring.colour, strength: on ? tokens.ring.strength : 0, radius: tokens.ring.radius };
  });
}
/** `count` LED-sized emitters on a grid over a layer (the density case): all inside it, so they tie on reach. */
export function gridEmitters(layer: HTMLElement, count: number): SceneEmitter[] {
  const width = layer.offsetWidth, height = layer.offsetHeight;
  const columns = Math.max(1, Math.ceil(Math.sqrt((count * width) / Math.max(1, height)))), rows = Math.max(1, Math.ceil(count / columns));
  return Array.from({ length: count }, (_, index) => ({ position: [((index % columns) + 0.5) * (width / columns), (Math.floor(index / columns) + 0.5) * (height / rows), tokens.led.height] as [number, number, number],
    colour: [1, 0.9, 0.8] as [number, number, number], strength: tokens.lamp.strength, radius: tokens.lamp.reach * tokens.lamp.diameter }));
}

/** The fields every scene of a theme shares (sceneSettings' values at 50% depth). */
function common(layer: HTMLElement, theme: Theme, outset: number) {
  return {
    format: "strata-scene" as const, version: 4 as const,
    extent: { width: layer.offsetWidth, height: layer.offsetHeight }, outset: { top: outset, right: outset, bottom: outset, left: outset },
    backdrop: theme.stage, light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" as const }, shadow: { strength: 0.24 },
    interior: { max: tokens.interiorMax }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
  };
}
const reliefMaterials = {
  face: { base: { roughness: 1 } }, satin: { base: { roughness: 0.5 } }, metal: { base: { roughness: 0.3, metallic: 1 } },
  glass: { base: { roughness: 0.15 }, coat: { strength: 1, roughness: 0.05 } }, emissive: { emissive: { strength: 1 } },
};
const inset = (rect: [number, number, number, number], by: number): [number, number, number, number] => [rect[0] + by, rect[1] + by, rect[2] - 2 * by, rect[3] - 2 * by];

/** The stage: a relief layer with no primitives (its own capture, the page), lit by the pointer light and the outsets. */
export function stageScene(stage: HTMLElement, theme: Theme, light: { emitters: SceneEmitter[]; protected: [number, number, number, number][]; feather: number }): ReliefScene {
  return { ...common(stage, theme, 0), outset: undefined, materials: { face: { base: { roughness: 1 } } }, primitives: [], ...light };
}

/** A panel's scene at `level`, with `light` (its emitters, protected rects and feather). */
export function panelScene(layer: HTMLElement, level: Level, theme: Theme, stage: { width: number; height: number; x: number; y: number },
  light: { emitters: SceneEmitter[]; protected: [number, number, number, number][]; feather: number }): ReliefScene | InstrumentScene {
  const box = (selector: string) => rectOf(layer.querySelector(selector)!, layer);
  const all = (selector: string) => [...layer.querySelectorAll<HTMLElement>(selector)];
  const face = { face: "raised" as const, rect: [0, 0, layer.offsetWidth, layer.offsetHeight] as [number, number, number, number], radius: 14, height: 8, material: "face" };
  if (level === "instrument") return instrumentScene(layer, theme, stage, light, face);
  const base = layer.getBoundingClientRect();
  if (level === "objects") {
    const vanish: [number, number] = [stage.x + stage.width / 2 - base.left, stage.y + stage.height / 2 - base.top];
    return { ...common(layer, theme, tokens.outset), camera: { distance: CAMERA_DISTANCE, vanish }, environment: { source: "studio", strength: 0.6 }, materials: reliefMaterials, primitives: [
      face,
      { object: "key", rect: box("[data-part=key]"), radius: 8, height: 6, taper: 3, material: "satin" },
      { object: "knob", rect: inset(box("[data-part=knob]"), 4), bounds: box("[data-part=knob]"), height: 9, colour: theme.knob, material: "metal" },
      ...all("[data-emitter=led]").map(led => ({ object: "puck" as const, rect: inset(rectOf(led, layer), 1.5), bounds: rectOf(led, layer), height: 2, colour: "#46dc6e", material: "emissive" })),
      ...all("[data-emitter=lamp]").map(lamp => ({ object: "puck" as const, rect: inset(rectOf(lamp, layer), 3.5), bounds: rectOf(lamp, layer), height: 6,
        colour: lit(lamp) ? "#ffaa3c" : "#2a2420", material: lit(lamp) ? "emissive" : "glass" })),
      ...all("[data-emitter=ring]").flatMap(ring => [
        { object: "key" as const, rect: rectOf(ring, layer), radius: 22, height: 5, taper: 3, material: "satin" },
        { face: "ring" as const, rect: inset(rectOf(ring, layer), 3), height: 0, material: "satin", ring: { thickness: 4, start: 0, sweep: 360, colour: lit(ring) ? "#5096ff" : "#3a3f48" } },
      ]),
    ], ...light } as ReliefScene;
  }
  return { ...common(layer, theme, tokens.outset), materials: reliefMaterials, primitives: [
    face,
    { face: "raised", rect: box("[data-part=key]"), radius: 8, height: 4, material: "satin" },
    { face: "knob", rect: box("[data-part=knob]"), height: 6, material: "metal" },
    ...all("[data-emitter=led]").map(led => ({ face: "knob" as const, rect: rectOf(led, layer), height: 1.5, material: "glass" })),
    ...all("[data-emitter=lamp]").map(lamp => ({ face: "knob" as const, rect: rectOf(lamp, layer), height: 3, material: "glass" })),
    ...all("[data-emitter=ring]").flatMap(ring => [
      { face: "raised" as const, rect: rectOf(ring, layer), radius: 22, height: 4, material: "satin" },
      { face: "ring" as const, rect: inset(rectOf(ring, layer), 3), height: 0, material: "satin", ring: { thickness: 4, start: 0, sweep: 360, colour: lit(ring) ? "#5096ff" : "#3a3f48" } },
    ]),
  ], ...light } as ReliefScene;
}

// ---- The Instrument level ----

/** The box rule's margin at this stage (`ceil(drift(h) + 1)`, I0.2), with `r` the stage's half-diagonal. */
export function margin(height: number, stage: { width: number; height: number }) {
  return Math.ceil((Math.hypot(stage.width, stage.height) / 2 * height) / (CAMERA_DISTANCE - height) + 1);
}
const lathe = (points: [number, number, number, number][], segments = 48): InstrumentProfile => ({ type: "lathe", points, segments });
const prism = (width: number, length: number, radius: number, height: number, taper = 0, chamfer = 0): InstrumentProfile =>
  ({ type: "prism", width, length, radius: Math.min(radius, width / 2, length / 2), height, taper, chamfer });
const round = (value: number) => Math.round(value * 100) / 100;
function materials(theme: Theme): Record<string, InstrumentRecipe> {
  return {
    face: { base: { roughness: 1 } },
    metal: { base: { colour: theme.metal, metallic: 1, roughness: 0.3 }, brush: { strength: 0.9, direction: "circular" }, grain: { strength: 0.15 } },
    polished: { base: { colour: "#f4f5f7", metallic: 1, roughness: 0.08 } },
    lacquer: { base: { colour: "#1d1d1f", roughness: 0.5 }, coat: { strength: 1, roughness: 0.03, ior: 1.5 } },
    body: { base: { colour: theme.body, roughness: 0.4 } },
    keycap: { base: { roughness: 1 } },
    bezel: { base: { colour: "#60626a", metallic: 0.9, roughness: 0.35 } },
    lensOff: { base: { colour: "#2a2420", roughness: 0.15 }, coat: { strength: 1, roughness: 0.05 } },
    lensOn: { base: { colour: "#ffc878", roughness: 0.2 }, emissive: { strength: 1.2, colour: "#ff9e38" } },
    led: { base: { colour: "#46dc6e", roughness: 0.3 }, emissive: { strength: 1, colour: "#1ee650" } },
    ringOff: { base: { colour: "#3a3f48", roughness: 0.4 } },
    ringOn: { base: { colour: "#5096ff", roughness: 0.3 }, emissive: { strength: 1, colour: "#3c82ff" } },
  };
}
function instrumentScene(layer: HTMLElement, theme: Theme, stage: { width: number; height: number; x: number; y: number },
  light: { emitters: SceneEmitter[]; protected: [number, number, number, number][]; feather: number }, face: InstrumentScene["primitives"][number]): InstrumentScene {
  const profiles: Record<string, InstrumentProfile> = {};
  const profile = (name: string, shape: InstrumentProfile) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
  const objects: InstrumentObject[] = [];
  const add = (element: HTMLElement, radius: number, t: number, parts: InstrumentPart[], material: string) => {
    const rect = rectOf(element, layer);
    objects.push({ id: element.id, rect, bounds: { rect, radius }, t, parts, relief: { face: "raised", rect, radius, height: 0, material } });
  };
  for (const element of layer.querySelectorAll<HTMLElement>("[data-part], [data-emitter]")) {
    const [x, y, w, h] = rectOf(element, layer), cx = round(x + w / 2), cy = round(y + h / 2), on = lit(element) ? 1 : 0;
    const kind = element.dataset.emitter ?? element.dataset.part;
    if (kind === "lamp") {
      // A bezel, a dark lens, and the lit lens, which sinks below the dark one when the lamp is off (one structure for both).
      const r = round(w / 2 - margin(3.5, stage)), lens = round(Math.min(r - 2.5, w / 2 - margin(9, stage) + 2.5));
      add(element, w / 2, on, [
        { kind: "bezel", profile: profile("bezel", lathe([[r, 0, 1, 0], [r, 2.5, 0.7, 0.7], [r - 1, 3.5, 0, 1], [lens, 3.5, 0, 1]])), at: [cx, cy, 0], material: "bezel" },
        { kind: "lens", profile: profile("lensOff", lathe([[lens, 0, 1, 0], [lens, 2, 0.8, 0.6], [lens * 0.7, 5.5, 0.5, 0.86], [lens * 0.35, 7, 0.2, 0.98], [0, 7.3, 0, 1]])), at: [cx, cy, 3.5], material: "lensOff", caster: null },
        { kind: "lens", profile: profile("lensOn", lathe([[lens + 0.4, 0, 1, 0], [lens + 0.4, 2.1, 0.8, 0.6], [lens * 0.74, 5.7, 0.5, 0.86], [lens * 0.37, 7.3, 0.2, 0.98], [0, 7.6, 0, 1]])), at: [cx, cy, 3.5], material: "lensOn",
          pose: { from: { travel: -8 }, to: { travel: 0 } }, caster: null },
      ], "bezel");
    } else if (kind === "led") {
      add(element, w / 2, 0, [{ kind: "lens", profile: profile("led", lathe([[3.5, 0, 1, 0], [3.3, 1.5, 0.8, 0.6], [2.2, 2.8, 0.4, 0.9], [0, 3.2, 0, 1]], 24)), at: [cx, cy, 0], material: "led", caster: null }], "led");
    } else if (kind === "knob") {
      const rc = round(w / 2 - margin(14.5, stage)), rs = round(Math.max(rc + 1, w / 2 - margin(2.5, stage)));
      const input = element as HTMLInputElement, t = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      const turn = { from: { turn: -135 }, to: { turn: 135 } };
      add(element, w / 2, t, [
        { kind: "skirt", profile: profile("skirt", lathe([[rs, 0, 1, 0], [rs, 1.7, 1, 0], [rs - 0.8, 2.5, 0.6, 0.8], [rc, 2.5, 0, 1]])), at: [cx, cy, 0], material: "metal", pose: turn },
        { kind: "cap", profile: profile("cap", lathe([[rc, 0, 1, 0], [rc, 10.6, 1, 0], [rc - 1.4, 12, 0.6, 0.8], [0, 12, 0, 1]])), at: [cx, cy, 2.5], material: "lacquer", pose: turn },
        { kind: "chamfer", profile: profile("chamfer", lathe([[rc + 0.01, 10.6, 0.75, 0.66], [rc - 1.4, 12.01, 0.75, 0.66]])), at: [cx, cy, 2.5], material: "polished", pose: turn, caster: null },
      ], "metal");
    } else if (kind === "key" || kind === "ring") {
      const ring = kind === "ring", radius = ring ? w / 2 : 8;
      const m = margin(ring ? 6.1 : 6, stage), width = round(w - 2 * m), length = round(h - 2 * m);
      const parts: InstrumentPart[] = [
        { kind: "plinth", profile: profile(ring ? "ringBody" : "body", prism(width, length, Math.max(1, radius - m), 5, 1.2)), at: [cx, cy, 0], material: "body" },
        { kind: "cap", profile: profile(ring ? "ringCap" : "keyCap", prism(round(ring ? 24 : width - 2.4), round(ring ? 24 : length - 2.4), ring ? 12 : Math.max(1, radius - m - 1.2), 1)), at: [cx, cy, 5], material: "keycap", captured: true, caster: null },
      ];
      if (ring) {
        const outer = round(Math.min(width / 2 - 1.5, 17)), inner = 12.6;
        parts.push({ kind: "bezel", profile: profile("ringOff", lathe([[outer, 0, 0, 1], [inner, 0, 0, 1]], 64)), at: [cx, cy, 5.05], material: "ringOff", caster: null },
          { kind: "bezel", profile: profile("ringOn", lathe([[outer, 0, 0.3, 0.95], [(outer + inner) / 2, 0.8, 0, 1], [inner, 0, -0.3, 0.95]], 64)), at: [cx, cy, 5.1], material: "ringOn",
            pose: { from: { travel: -4 }, to: { travel: 0 } }, caster: null });
      }
      add(element, radius, ring ? on : 0, parts, "body");
    }
  }
  return {
    ...common(layer, theme, tokens.outset), kind: "instrument",
    camera: { distance: CAMERA_DISTANCE, vanish: [stage.width / 2, stage.height / 2] }, environment: { source: "studio", strength: 1 },
    materials: materials(theme), primitives: [face], profiles, objects, ...light,
  };
}
