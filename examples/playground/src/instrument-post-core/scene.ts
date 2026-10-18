/**
 * Instrument scenes for `instrument-post-core.html` (core work item 3, `docs/ui-library/instrument-phase2.md`): each
 * enrolled panel's native controls become Instrument objects for core's `instrument` material, sized by the box rule
 * (I0.2) so every part stays in its control's box over the whole travel. Native state sets each object's `t`:
 * - knob (`<input type="range">`): a skirt, a lacquer cap, a polished chamfer and a pointer, turning ±135°;
 * - fader (vertical range): a printed slot, a carriage and its grip line;
 * - key (`<button>`): a body, a captured cap (the button's own label) and an LED on the cap's corner, a lens whose
 *   emitter is lit while the key is latched (`data-latched`);
 * - switch (checkbox): a track and a thumb;
 * - lamp (checkbox): a polished bezel and a lens, an emitter lit while checked; the box leaves room for the bloom halo;
 * - bat (checkbox): a plate, a nut and a lever with its ball thrown ±40° about x (I0.5's lever-on-plate case);
 * - thin (a `<button>`): a plinth with a 2 px plate on it (I0.5's thin-plate case).
 * The page is the only author of these numbers: it is what the Strata GPU helper will build in its own PR.
 */
import type { InstrumentEmitter, InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentRecipe, InstrumentScene } from "@underglass/core";

export type ControlKind = "knob" | "fader" | "key" | "switch" | "lamp" | "bat" | "thin";
export interface Theme { name: "light" | "dark"; stage: string; face: string; body: string; slot: string; thumb: string; metal: string; plate: string }
export const themes: Record<Theme["name"], Theme> = {
  light: { name: "light", stage: "#e3e5e9", face: "#dfe1e5", body: "#2563eb", slot: "#0c0c0e", thumb: "#eceef2", metal: "#eceef0", plate: "#6b7079" },
  dark: { name: "dark", stage: "#16181c", face: "#2a2d34", body: "#e2e6ec", slot: "#050506", thumb: "#c9ccd2", metal: "#686b72", plate: "#4a4e57" },
};
/** The stage camera: `D` = 2,400, the camera rule's floor (2D.3). */
export const CAMERA_DISTANCE = 2400;
/** Part heights (50% depth), in CSS px. */
export const heights = { skirt: 2.5, cap: 12, pointer: 0.8, carriage: 8, grip: 0.6, slot: 0.4, body: 5, keyCap: 1, led: 1.4, track: 1.5, thumb: 6,
  bezel: 2.5, lens: 4, plate: 3, nut: 2.4, lever: 18, ball: 3, plinth: 3, thin: 2 };
/** The bat's throw (degrees each way) and the lamps' and LEDs' light (I0.3's lamp: 3,200 at a 28 px lens, 6 diameters). */
export const BAT_THROW = 40;
export const LAMP = { colour: [1, 0.62, 0.22] as [number, number, number], strength: 3200, reach: 6 };
export const LED = { colour: [0.2, 1, 0.4] as [number, number, number], strength: 160, radius: 28 };

/** The box rule's margin at this stage (`ceil(drift(h) + 1)`, I0.2), with `r` the stage's half-diagonal. */
export function margin(height: number, stage: { width: number; height: number }) {
  const r = Math.hypot(stage.width, stage.height) / 2;
  return Math.ceil((r * height) / (CAMERA_DISTANCE - height) + 1);
}
/** A control's layout box in its panel's CSS px, unrounded. */
export function rectOf(element: HTMLElement, panel: HTMLElement): [number, number, number, number] {
  const box = element.getBoundingClientRect(), base = panel.getBoundingClientRect();
  return [box.left - base.left, box.top - base.top, box.width, box.height];
}
/** A control's position along its travel from native state: value, checked, latched or pressed. */
export function travelOf(element: HTMLElement, pressed: ReadonlySet<HTMLElement>) {
  if (element instanceof HTMLInputElement && element.type === "range") return (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min));
  if (element instanceof HTMLInputElement) return element.checked ? 1 : 0;
  return pressed.has(element) ? 1 : 0;
}
/** Whether a control's light is on: a checked lamp, a latched key. */
export const litOf = (element: HTMLElement) => element instanceof HTMLInputElement ? element.checked : element.dataset.latched === "true";

const lathe = (points: [number, number, number, number][], segments = 48): InstrumentProfile => ({ type: "lathe", points, segments });
const prism = (width: number, length: number, radius: number, height: number, taper = 0, chamfer = 0): InstrumentProfile =>
  ({ type: "prism", width, length, radius: Math.min(radius, width / 2, length / 2), height, taper, chamfer });
const round = (value: number) => Math.round(value * 100) / 100;
const r2 = Math.SQRT1_2;
/** A dome of radius `r` and height `h`, standing on z = 0 (a lens). */
const dome = (r: number, h: number) => lathe([[r, 0, 1, 0], ...[0, 1, 2, 3, 4, 5, 6].map((i): [number, number, number, number] => {
  const a = (i / 6) * (Math.PI / 2);
  return [round(r * Math.cos(a)), round(h * Math.sin(a)), round(Math.cos(a) / r), round(Math.sin(a) / h)];
})], 32);

/** The materials of a theme; `face` is matte with no coat, so the face's interior factor is exactly 1 and text is the capture. */
export function materials(theme: Theme): Record<string, InstrumentRecipe> {
  return {
    face: { base: { roughness: 1 } },
    metal: { base: { colour: theme.metal, metallic: 1, roughness: 0.3, direct: 0.2 }, brush: { strength: 0.9, direction: "circular" }, grain: { strength: 0.15 } },
    polished: { base: { colour: "#f4f5f7", metallic: 1, roughness: 0.08, direct: 0.2 } },
    lacquer: { base: { colour: "#1d1d1f", roughness: 0.5 }, coat: { strength: 1, roughness: 0.03, ior: 1.5 } },
    body: { base: { colour: theme.body, roughness: 0.4 } },
    // Captured caps: roughness 1 and no coat, so the interior factor is 1 and the label is the capture itself.
    keycap: { base: { roughness: 1 } },
    slot: { base: { colour: theme.slot, roughness: 0.9 } },
    thumb: { base: { colour: theme.thumb, roughness: 0.35 } },
    grip: { base: { colour: "#f5f5f5", roughness: 0.5 }, emissive: { strength: 0.3 } },
    plate: { base: { colour: theme.plate, roughness: 0.55 } },
    lever: { base: { colour: "#fafafb", metallic: 1, roughness: 0.06 } },
    // Lenses: a lit lens glows in its emissive colour and blooms; an unlit one is dark glass-like lacquer.
    lens: { base: { colour: "#5a3c1e", roughness: 0.2 }, emissive: { strength: 1.4, colour: "#ff9e38" } },
    led: { base: { colour: "#14401e", roughness: 0.3 }, emissive: { strength: 1.2, colour: "#38ff66" } },
  };
}

export interface SceneOptions {
  /** `false`: every part's caster `null` (no face shadows), for pixel tests that must see the parts alone. */
  casters?: boolean;
  /** `false`: no objects, only the face (with the same emitters). */
  objects?: boolean;
  /** Emitters on (each lamp and latched key) or every strength 0. */
  lights?: boolean;
  post?: InstrumentScene["post"];
  map?: NonNullable<InstrumentScene["shadow"]["map"]>;
}

/** The emitters of a panel: one per lamp and one per key LED, in control order; strength 0 while unlit. */
export function panelEmitters(panel: HTMLElement, stage: { width: number; height: number }, lights = true): InstrumentEmitter[] {
  const emitters: InstrumentEmitter[] = [];
  for (const element of panel.querySelectorAll<HTMLElement>("[data-part=lamp], [data-part=key]")) {
    const [x, y, w, h] = rectOf(element, panel), on = lights && litOf(element);
    if (element.dataset.part === "lamp") {
      const d = lensDiameter(w);
      emitters.push({ position: [x + w / 2, y + h / 2, heights.bezel + heights.lens + 2], colour: LAMP.colour, strength: on ? LAMP.strength * (d / 28) ** 2 : 0,
        radius: LAMP.reach * d, reach: "outset", face: 1 });
    } else {
      const led = ledAt([x, y, w, h], stage);
      emitters.push({ position: [led.x, led.y, heights.body + heights.keyCap + heights.led + 1], colour: LED.colour, strength: on ? LED.strength : 0, radius: LED.radius, reach: "outset", face: 1 });
    }
  }
  return emitters;
}
const lensDiameter = (side: number) => Math.round(side * 0.36);
/** The LED's centre on a key: the cap's top-right corner, inside the cap. */
function ledAt([x, y, w]: [number, number, number, number], stage: { width: number; height: number }) {
  const m = margin(heights.body + heights.keyCap + heights.led, stage);
  return { x: round(x + w - m - 5.5), y: round(y + m + 5.5) };
}

/** The scene of one panel. */
export function panelScene(panel: HTMLElement, theme: Theme, stage: { width: number; height: number }, pressed: ReadonlySet<HTMLElement>, options: SceneOptions = {}): InstrumentScene {
  const profiles: Record<string, InstrumentProfile> = {};
  const profile = (name: string, shape: InstrumentProfile) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
  const objects: InstrumentObject[] = [];
  const caster = options.casters === false ? { caster: null } : {};
  let emitter = 0;
  for (const element of panel.querySelectorAll<HTMLElement>("[data-part]")) {
    const kind = element.dataset.part as ControlKind, rect = rectOf(element, panel), [x, y, w, h] = rect;
    const cx = x + w / 2, cy = y + h / 2, t = travelOf(element, pressed);
    // Emitter indices follow `panelEmitters`, whether or not the objects are drawn.
    const index = kind === "lamp" || kind === "key" ? emitter++ : -1;
    if (options.objects === false) continue;
    let parts: InstrumentPart[];
    let radius = 0;
    if (kind === "knob") {
      radius = w / 2;
      const rc = round(w / 2 - margin(heights.skirt + heights.cap, stage)), rs = round(Math.max(rc + 1, w / 2 - margin(heights.skirt, stage)));
      const turn = { from: { turn: -135 }, to: { turn: 135 } };
      const offset = round(rc * 0.55);
      const pointerTurn = { from: { turn: -135, pivot: [0, offset, 0] as [number, number, number] }, to: { turn: 135, pivot: [0, offset, 0] as [number, number, number] } };
      parts = [
        { kind: "skirt", profile: profile("skirt", lathe([[rs, 0, 1, 0], [rs, heights.skirt - 0.8, 1, 0], [rs - 0.8, heights.skirt, 0.6, 0.8], [rc, heights.skirt, 0, 1]])), at: [cx, cy, 0], material: "metal", pose: turn, ...caster },
        { kind: "cap", profile: profile("cap", lathe([[rc, 0, 1, 0], [rc, heights.cap - 1.4, 1, 0], [rc - 1.4, heights.cap, 0.6, 0.8], [0, heights.cap, 0, 1]])), at: [cx, cy, heights.skirt], material: "lacquer", pose: turn, ...caster },
        { kind: "chamfer", profile: profile("chamfer", lathe([[rc + 0.01, heights.cap - 1.4, 0.75, 0.66], [rc - 1.4, heights.cap + 0.01, 0.75, 0.66]])), at: [cx, cy, heights.skirt], material: "polished", pose: turn, caster: null },
        { kind: "pointer", profile: profile("pointer", prism(2, round(rc * 0.5), 0.6, heights.pointer, 0.2)), at: [cx, round(cy - offset), heights.skirt + heights.cap], material: "grip", pose: pointerTurn, caster: null },
      ];
    } else if (kind === "fader") {
      const m = margin(heights.carriage, stage), width = round(Math.max(6, w - 2 * m)), length = round(Math.min(18, Math.max(8, h * 0.18)));
      const travel = round(Math.max(0, h - 2 * m - length)), top = y + m + length / 2;
      const slide = { from: { slide: [0, travel] as [number, number] }, to: { slide: [0, 0] as [number, number] } };
      parts = [
        { kind: "slot", profile: profile("slot", prism(3, Math.max(1, travel), 1.5, heights.slot)), at: [cx, round(top + travel / 2), 0], material: "slot", caster: null },
        { kind: "carriage", profile: profile("carriage", prism(width, length, 2.5, heights.carriage, 2, 0.5)), at: [cx, round(top), 0], material: "lacquer", pose: slide, ...caster },
        { kind: "grip", profile: profile("grip", prism(round(Math.max(2, width - 6)), 1.4, 0.4, heights.grip)), at: [cx, round(top), heights.carriage], material: "grip", pose: slide, caster: null },
      ];
    } else if (kind === "key") {
      radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      const m = margin(heights.body + heights.keyCap + heights.led, stage), width = round(w - 2 * m), length = round(h - 2 * m);
      const press = { from: { travel: 0 }, to: { travel: -2.5 } };
      const led = ledAt(rect, stage);
      parts = [
        { kind: "plinth", profile: profile("body", prism(width, length, Math.max(1, radius - m), heights.body, 1.2)), at: [cx, cy, 0], material: "body", pose: press, ...caster },
        { kind: "cap", profile: profile("keyCap", prism(round(width - 2.4), round(length - 2.4), Math.max(1, radius - m - 1.2), heights.keyCap)), at: [cx, cy, heights.body], material: "keycap", captured: true, pose: press, caster: null },
        // The LED stands on the cap's corner: a part in front of a captured cap hides it there (the depth test of the caps).
        { kind: "lens", profile: profile("led", dome(2.4, heights.led)), at: [led.x, led.y, heights.body + heights.keyCap], material: "led", pose: press, emitter: index, caster: null },
      ];
    } else if (kind === "switch") {
      radius = h / 2;
      const m = margin(heights.thumb, stage), track = { width: round(w - 2 * m), length: round(h - 2 * m) };
      const d = round(Math.max(4, track.length - 2)), travel = round(Math.max(0, track.width - d));
      parts = [
        { kind: "slot", profile: profile("track", prism(track.width, track.length, track.length / 2, heights.track, 0.4)), at: [cx, cy, 0], material: "slot", caster: null },
        { kind: "carriage", profile: profile("thumb", prism(d, d, d / 2, heights.thumb, 1)), at: [round(cx - travel / 2), cy, heights.track], material: "thumb",
          pose: { from: { slide: [0, 0] }, to: { slide: [travel, 0] } }, ...caster },
      ];
    } else if (kind === "lamp") {
      radius = w / 2;
      const d = lensDiameter(w), r = d / 2;
      parts = [
        { kind: "bezel", profile: profile("bezel", lathe([[r + 4, 0, 1, 0], [r + 4, heights.bezel - 0.6, 1, 0], [r + 4, heights.bezel - 0.6, r2, r2], [r + 3.4, heights.bezel, r2, r2], [r + 3.4, heights.bezel, 0, 1], [r, heights.bezel, 0, 1]])), at: [cx, cy, 0], material: "polished", ...caster },
        { kind: "lens", profile: profile("lens", dome(r, heights.lens)), at: [cx, cy, heights.bezel], material: "lens", emitter: index, caster: null },
      ];
    } else if (kind === "bat") {
      radius = 8;
      // The lever is a tapered rod from its pivot (on the nut) and a ball at its tip, thrown about x; the plate under them
      // receives their mapped shadow.
      const pivot = heights.plate + heights.nut, rise = heights.lever - heights.ball;
      const sphere = lathe(Array.from({ length: 9 }, (_, i): [number, number, number, number] => {
        const a = -Math.PI / 2 + (i / 8) * Math.PI;
        return [round(Math.max(0, heights.ball * Math.cos(a))), round(heights.ball + heights.ball * Math.sin(a)), round(Math.cos(a)), round(Math.sin(a))];
      }), 24);
      const throwOf = (z: number) => ({ from: { tilt: -BAT_THROW, pivot: [0, 0, z] as [number, number, number] }, to: { tilt: BAT_THROW, pivot: [0, 0, z] as [number, number, number] } });
      const plateWidth = round(w - 2 * margin(heights.plate, stage)), plateLength = round(h - 2 * margin(heights.plate, stage));
      parts = [
        { kind: "plate", profile: profile("bat-plate", prism(plateWidth, plateLength, 4, heights.plate, 0, 0.6)), at: [cx, cy, 0], material: "plate", ...caster },
        { kind: "nut", profile: profile("bat-nut", lathe([[8, 0, 1, 0], [8, heights.nut - 0.5, 1, 0], [8, heights.nut - 0.5, r2, r2], [7.5, heights.nut, r2, r2], [7.5, heights.nut, 0, 1], [0, heights.nut, 0, 1]], 6)), at: [cx, cy, heights.plate], material: "polished", ...caster },
        { kind: "lever", profile: profile("bat-lever", lathe([[2.4, 0, 1, 0.02], [1.8, rise + 0.6, 1, 0.02]], 20)), at: [cx, cy, pivot], material: "lever", pose: throwOf(0), caster: null },
        { kind: "ball", profile: profile("bat-ball", sphere), at: [cx, cy, pivot + rise], material: "lever", pose: throwOf(-rise), caster: null },
      ];
    } else {
      radius = 4;
      // A plinth and a 2 px plate on it (a membrane key): the plate's mapped shadow on the plinth must stay whole.
      const m = margin(heights.plinth + heights.thin, stage), width = round(w - 2 * m), length = round(h - 2 * m);
      parts = [
        { kind: "plate", profile: profile("plinth", prism(width, length, 3, heights.plinth, 0, 0.6)), at: [cx, cy, 0], material: "plate", ...caster },
        { kind: "plate", profile: profile("thin", prism(round(width * 0.6), round(length * 0.55), 1, heights.thin)), at: [cx, cy, heights.plinth], material: "thumb", caster: null },
      ];
    }
    objects.push({ id: element.id, rect, bounds: { rect, radius }, t, parts,
      // The Relief primitive drawn instead (pending builds, step-downs) casts no shadow, so it stays inside the box too.
      relief: { face: kind === "knob" || kind === "lamp" ? "knob" : "raised", rect, radius, height: 0, material: kind === "key" ? "body" : "metal" } });
  }
  return {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance: CAMERA_DISTANCE, vanish: [stage.width / 2, stage.height / 2] },
    // The page probe is core work item 4's (tested in core-glass); this page tests the post chain on the studio alone.
    environment: { source: "studio", strength: 1, page: { enabled: false } },
    extent: { width: panel.offsetWidth, height: panel.offsetHeight }, outset: { top: 16, right: 16, bottom: 16, left: 16 },
    backdrop: theme.stage, light: { azimuth: 323, elevation: 41 },
    bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24, ...(options.map ? { map: options.map } : {}) }, interior: { max: 0.04 },
    state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: materials(theme),
    primitives: [{ face: "raised", rect: [0, 0, panel.offsetWidth, panel.offsetHeight], radius: 14, height: 6, material: "face" }],
    profiles, objects, emitters: panelEmitters(panel, stage, options.lights !== false),
    ...(options.post ? { post: options.post } : {}),
  };
}
