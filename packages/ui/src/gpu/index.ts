/**
 * `@underglass/ui/gpu`: Strata over Underglass. `attachStrataGpu` enrolls each Strata panel that is a direct child of
 * the Underglass root as a GPU layer and gives it core's built-in `relief` material, with a scene in the Strata
 * Rendering Model's format built from the panel's `data-strata-face` markers and its resolved tokens. At the Objects
 * level (`data-strata-level="objects"` on a component, a panel or a scope, or the `level` option) the components
 * become objects (keys, wells, bezels, knobs) and the panel takes core's `objects` material instead. While GPU
 * presents, the panels switch to `data-strata-mode="face"`, so CSS paints flat faces and the GPU paints the relief;
 * whenever GPU is off, the CSS relief is back.
 *
 * At the Scene level (`level: "scene"`, or `data-strata-level="scene"` on the root or a scope around it) the helper adds
 * decorative layers of its own: a lit backdrop behind the panels and, while `burst()` runs, a particle layer in front;
 * panels entering settle with a damped spring. An environment map (`environment: url`) lights every object.
 *
 * The root becomes a stage (`data-strata-stage`): Dialog and Drawer panels rendered into it are presented as panels
 * of their own while they are open, over a scrim the GPU fades, and are let go before they hide.
 *
 * Panel motion (`strataEnter`, `strataLeave` from `@underglass/ui/dom`) moves a presented panel on the GPU: core's
 * `transition` carries it through depth (scale, tilt and opacity, as the CSS motion does) while its scene height
 * travels from the modal level, so its shadow grows and settles with it.
 *
 * A Knob's skirt and cap are raised faces (slabs at the Objects level, the cap on the skirt) in the `knob` material,
 * with its input's hover and disabled state; its turning pointer is captured content on the cap.
 *
 * At the Instrument level (`instrument`, between `objects` and `scene` on the ladder, set like the others) a panel with
 * any element at that level takes core's `instrument` material and a version 4 scene (`gpu/instrument.ts`): its knobs
 * become the premium knob's parts, whose pointer turns on a spring as their value changes (uniform updates, no
 * recapture), its faders the premium fader's carriage (`gpu/instrument-fader.ts`), sliding its slot on `spring.fader`
 * while the slot stays a groove and the scale printed on the face, and its buttons keys with captured caps; every
 * other component stays a Relief primitive on the face.
 * The Scene level still draws its panels at the Objects level, so the adjust policy steps a Scene page over
 * `instrument`.
 *
 * Everything the scene needs comes from the page as the CSS presentation sees it: geometry from layout (followed through
 * CSS transitions frame by frame), states from
 * `:hover`, `:active`, `:focus-visible` and `:disabled`, and token values from each element's resolved `--strata-*`
 * custom properties, so depth, themes and scopes apply exactly as they do in CSS. The helper never imports
 * `@underglass/core`: it takes the controller as a value and speaks the scene format.
 */
import { cssVariable, flatten, numeric, strataTokens } from "../tokens/index.ts";
import { isSceneObject, type SceneEntry, type SceneFace, type SceneMaterial, type ScenePrimitive, type StrataScene } from "../tokens/scene.ts";
import { panelMotion, type PanelMover } from "../dom/motion.ts";
import { switchFormEntries } from "./switch-forms.ts";
import { strataStage, type StagePresenter } from "../dom/stage.ts";
import type { EnvironmentMap, StageScene } from "../tokens/stage.ts";
import { advance, asParticle, decodeHdr, environmentFrom, launch, spring, type BurstOptions, type Confetto } from "./scene.ts";
import { advanceSpring, depthScale, INSTRUMENT_CAMERA, keyObject, knobObject, knobSprings, premiumMaterials, type InstrumentObject, type InstrumentProfile,
  type InstrumentRecipe, type KnobSpring } from "./instrument.ts";
import { faderMaterials, faderObject, faderParts, faderSpring } from "./instrument-fader.ts";

export type { InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentRecipe, KnobSpring } from "./instrument.ts";

export { decodeHdr, environmentFrom, launch, advance, spring } from "./scene.ts";
export type { BurstOptions, Confetto, HdrImage } from "./scene.ts";

/** What the helper needs from an Underglass controller (`CanvasController` from `@underglass/core`). */
export interface StrataGpuController {
  readonly container: HTMLElement;
  enroll(element: HTMLElement, options: { id: string; origin?: "center"; decorative?: boolean }): () => void;
  setMaterial(id: string, descriptor: StrataSceneMaterial | StrataStageMaterial): { update(scene: StrataScene | StrataInstrumentScene | StageScene): void; cancel(): void };
  transition(id: string, motion: StrataPanelMotion): { finished: Promise<{ status: string; reason: string }>; cancel(): void };
  state(): { mode: string };
}
/** A panel motion as core's typed motion: numeric keyframes and timing. */
export interface StrataPanelMotion {
  keyframes: { offset: number; opacity?: number; scaleX?: number; scaleY?: number; tiltX?: number; perspective?: number }[];
  timing: { duration: number; easing: string };
}
/**
 * The material descriptor the helper hands to `setMaterial`: `relief` for a version 1 scene, `objects` for version 2
 * and 3, `instrument` for version 4.
 */
export type StrataSceneMaterial = StrataMaterialBase & ({ kind: "relief" | "objects"; scene: StrataScene } | { kind: "instrument"; scene: StrataInstrumentScene });
/** What every material descriptor of the helper's has in common. */
export interface StrataMaterialBase {
  bounds: "layer";
  interaction: "material";
  media: "identity";
  fallback: "static";
}
/** The material descriptor of the Scene level's decorative layers: a stage scene (rendering model 2C). */
export interface StrataStageMaterial extends StrataMaterialBase {
  kind: "stage";
  scene: StageScene;
}
export interface StrataGpuOptions {
  /** Which direct root children are Strata panels (default `.ug-panel`). */
  panels?: string;
  /** How often to check whether GPU is presenting, in ms (default 500). Call `refresh()` from `onStatusChange` too. */
  poll?: number;
  /**
   * The application's presentation level (design language section 16), where no component, panel or scope sets
   * `data-strata-level`: `relief` by default. `objects` presents components as objects.
   */
  level?: StrataLevel;
  /**
   * The adjust policy (design language section 16), off by default. When the 95th percentile of frame intervals stays
   * over `frameBudgetMs` for `stepDownAfterFrames` frames, the levels step down (Scene to Objects to Relief); after
   * `stepUpAfterFrames` frames back under 80% of the budget, they step up again, never above what the page sets. Every
   * step is reported through `onAdjust` and a `strata-adjust` event on the root. GPU stays on.
   */
  adjust?: StrataAdjustPolicy;
  /** Called with every step of the adjust policy. */
  onAdjust?(event: StrataAdjustEvent): void;
  /** The Scene level's backdrop: its light pool and vignette (0–1; 0.5 and 0.35 by default) and an optional tint. */
  backdrop?: { pool?: number; vignette?: number; tint?: string; tintStrength?: number };
  /**
   * An equirectangular Radiance `.hdr` image for objects to reflect instead of the studio (rendering model 2C.4),
   * loaded once. Until it has loaded (or if it fails), the studio lights them.
   */
  environment?: string;
}
/** The adjust policy's settings. The defaults are provisional, until measured on a low-end GPU. */
export interface StrataAdjustPolicy {
  enabled: boolean;
  /** Default 25 ms (40 frames per second). */
  frameBudgetMs?: number;
  /** Default 120 frames over budget. */
  stepDownAfterFrames?: number;
  /** Default 600 frames back under budget. */
  stepUpAfterFrames?: number;
  /** Frames the 95th percentile is taken over; default 60. */
  window?: number;
}
/** One step of the adjust policy: the highest level presented before and after, and the measurement that caused it. */
export interface StrataAdjustEvent {
  from: StrataLevel;
  to: StrataLevel;
  /** The 95th percentile of the last frame intervals, in ms. */
  p95: number;
  frameBudgetMs: number;
}
export interface StrataGpu {
  /** Rebuilds every panel's scene now (for example from the runtime's `onStatusChange`). */
  refresh(): void;
  /** The scene last given to a panel, for inspection and tests. */
  scene(panel: HTMLElement): StrataScene | StrataInstrumentScene | undefined;
  /** Releases every panel: cancels materials, leaves face mode and releases the enrollments. */
  detach(): void;
  /** The highest level the adjust policy currently allows (`scene` when it allows everything, or when it is off). */
  cap(): StrataLevel;
  /**
   * At the Scene level, bursts confetti from an element's centre (or a stage point) over the UI, and resolves when the
   * last particle has gone. Under reduced motion, or below the Scene level, it resolves at once and draws nothing.
   */
  burst(origin: Element | [number, number], options?: BurstOptions): Promise<void>;
}

/** The helper attached to each stage root, for `strataBurst`. */
const attachedTo = new WeakMap<Element, StrataGpu>();
/** Bursts confetti from `element` on the Strata GPU stage it is presented on (see `StrataGpu.burst`). */
export function strataBurst(element: Element, options?: BurstOptions): Promise<void> {
  const stage = element.closest("[data-strata-stage]");
  const strata = stage && attachedTo.get(stage);
  return strata ? strata.burst(element, options) : Promise.resolve();
}

const faces: readonly SceneFace[] = ["raised", "well", "groove", "knob", "mark", "ring", "flat"];
const interactive = "input, button, select, textarea, a[href], [tabindex]";
/** Material roles by face, for elements that name no material (design language section 4). */
function roleOf(face: SceneFace, element: Element, panel: Element): string {
  if (element === panel || element.matches(".ug-card")) return "panel";
  // A knob's skirt and cap, and a fader's carriage, are raised faces in the knob's material (a fader's slot is a
  // groove, a rail).
  if (element.matches(".ug-knob__skirt, .ug-knob__cap, .ug-fader__carriage")) return "knob";
  if (face === "raised") return element.matches(".ug-button--accent, .ug-button--primary") ? "buttonPrimary" : "control";
  return ({ well: "field", groove: "rail", knob: "knob", mark: "indicator", ring: "field", flat: "control" } as Record<string, string>)[face] ?? "control";
}

// The numeric tokens a scene reads. Registering them lets the browser resolve their depth-blended `calc()` values
// per element, so `getComputedStyle` returns numbers; their meaning and values do not change.
const sceneTokens = /^(light\.(azimuth|elevation)|bevel\.(width|gain)|shadow\.strength|interior\.max|state\.|focus\.(width|offset)|elevation\.|object\.|camera\.distance|material\.presets\.[^.]+\.(base|coat|emissive)\.(roughness|metallic|strength))/;
const registered = new Set<string>();
function register(name: string, syntax: "<number>" | "<length>", initialValue: string) {
  if (registered.has(name)) return;
  registered.add(name);
  try { CSS.registerProperty({ name, syntax, inherits: true, initialValue }); } catch { /* already registered by the page */ }
}
function registerTokens() {
  for (const token of flatten(strataTokens)) {
    if (!sceneTokens.test(token.path)) continue;
    const length = token.$type === "dimension";
    register(cssVariable(token.path), length ? "<length>" : "<number>", length ? `${numeric(token.$value)}px` : String(numeric(token.$value)));
  }
}
/** An application material named in markup: its layers are registered on first sight. */
function registerMaterial(name: string) {
  for (const [layer, keys] of [["base", ["roughness", "metallic"]], ["coat", ["strength", "roughness"]], ["emissive", ["strength"]]] as const) {
    for (const key of keys) register(cssVariable(`material.presets.${name}.${layer}.${key}`), "<number>", "0");
  }
}

/** A CSS colour value (`#rgb`, `#rrggbb` or `rgb()`) as `#rrggbb`. */
function hex(value: string) {
  if (value.startsWith("#")) {
    const digits = value.slice(1, 7);
    return `#${(digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits).toLowerCase()}`;
  }
  const parts = (value.match(/[0-9.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  return `#${parts.map(part => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}
/** Reads one element's resolved token values. */
function reader(element: Element) {
  const style = getComputedStyle(element);
  const raw = (path: string) => style.getPropertyValue(cssVariable(path)).trim();
  const number = (path: string, fallback = 0) => { const value = Number.parseFloat(raw(path)); return Number.isFinite(value) ? value : fallback; };
  return { raw, number, colour: (role: string) => hex(raw(`colour.${role}`)) };
}

/** The element's border box relative to the panel's, in the panel's CSS px (transforms inside the panel included). */
function rectWithin(element: Element, panel: HTMLElement): [number, number, number, number] {
  const outer = panel.getBoundingClientRect(), inner = element.getBoundingClientRect();
  const scale = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  return [(inner.left - outer.left) / scale, (inner.top - outer.top) / scale, inner.width / scale, inner.height / scale];
}
function radiusOf(element: Element, width: number) {
  const value = getComputedStyle(element).borderTopLeftRadius;
  const amount = Number.parseFloat(value);
  return value.endsWith("%") ? (amount / 100) * width : Number.isFinite(amount) ? amount : 0;
}

/** A presentation level (design language section 16). */
export type StrataLevel = "relief" | "objects" | "instrument" | "scene";

/** What a caller may override in a panel's scene. */
export interface StrataSceneOptions {
  /** The panel's own height, in CSS px, instead of its elevation (panel motion carries it through depth). */
  height?: number;
  /** The level where neither the panel, its components nor a scope around them set one; `relief` by default. */
  level?: StrataLevel;
  /** The stage the camera is centred on (the Underglass root); the panel's parent by default. */
  stage?: Element;
  /** Collects the elements drawn as domes, whose own CSS paint the helper hides while GPU presents them. */
  domes?: Set<Element>;
  /** The highest level to present at (the adjust policy's cap); `scene` by default. */
  cap?: StrataLevel;
  /** An environment map for the objects to reflect: the scene becomes version 3. */
  environment?: EnvironmentMap;
  /**
   * At the Instrument level, each knob's spring (its pointer's position along the travel), kept between scenes; the
   * knobs whose spring is still moving are added to `moving`, so the caller builds another scene next frame.
   */
  springs?: WeakMap<Element, KnobSpring>;
  moving?: Set<Element>;
  /** The time the springs advance to (ms, `performance.now()` by default). */
  now?: number;
}

/** The levels from lowest to highest. */
export const strataLevels: readonly StrataLevel[] = ["relief", "objects", "instrument", "scene"];
const lower = (a: StrataLevel, b: StrataLevel) => (strataLevels.indexOf(a) <= strataLevels.indexOf(b) ? a : b);

/** The level an element is presented at: its own `data-strata-level`, or the nearest scope's, or the default. */
export function strataLevel(element: Element, fallback: StrataLevel = "relief"): StrataLevel {
  const level = element.closest("[data-strata-level]")?.getAttribute("data-strata-level");
  return level === "relief" || level === "objects" || level === "instrument" || level === "scene" ? level : fallback;
}

/**
 * Builds a panel's scene from its markup, layout, states and resolved tokens. At the Relief level it is a version 1
 * scene of relief primitives. Where the panel or any of its components is at the Objects level (or the Scene level,
 * which includes it), it is a version 2 scene: those components become objects (design language section 6), mixed
 * into the same back-to-front list, seen through the stage's camera.
 */
export function strataScene(panel: HTMLElement, options: StrataSceneOptions = {}): StrataScene | StrataInstrumentScene {
  registerTokens();
  const tokens = reader(panel);
  const level = (element: Element, fallback: string) =>
    tokens.number(`elevation.${element.getAttribute("data-strata-elevation") ?? fallback}`, tokens.number(`elevation.${fallback}`));
  const presets = new Set(flatten(strataTokens).filter(token => token.path.startsWith("material.presets.")).map(token => token.path.split(".")[2]!));
  const materials: Record<string, SceneMaterial> = {};
  const material = (name: string): string => {
    if (!presets.has(name)) registerMaterial(name);
    if (!materials[name]) {
      const at = (path: string, fallback = 0) => tokens.number(`material.presets.${name}.${path}`, fallback);
      materials[name] = { base: { roughness: at("base.roughness", 1), metallic: at("base.metallic") },
        coat: { strength: at("coat.strength"), roughness: at("coat.roughness"), ior: 1.5 }, emissive: { strength: at("emissive.strength") } };
    }
    return name;
  };
  const materialFor = (element: Element, face: SceneFace) => {
    const named = element.closest("[data-strata-material]");
    return material(named && panel.contains(named) ? named.getAttribute("data-strata-material")! : tokens.raw(`material.roles.${roleOf(face, element, panel)}`) || "matte");
  };
  const states = (element: Element) => {
    // A knob's skirt and cap are its input's object: they take its hover, press and disabled state. A fader's slot and
    // carriage are its input's object too: they take its hover and disabled state (a carriage does not sink while it is
    // dragged, as hardware does not). Their focus ring is the CSS outline round the skirt or the track (captured
    // content), so the GPU adds no focus edge of its own.
    const knob = element.closest(".ug-knob__dial")?.querySelector(".ug-knob__input");
    const fader = element.closest(".ug-fader__track")?.querySelector(".ug-fader__input");
    const owner = knob ?? fader;
    const control = element.matches(interactive) ? element : owner ?? element.closest("label")?.querySelector("input, select, textarea") ?? element;
    const target = control.closest("label") ?? control;
    const preview = `${element.getAttribute("data-strata-preview") ?? ""} ${control.getAttribute("data-strata-preview") ?? ""}`.split(/\s+/);
    // Only a control takes hover and press: a card, a plinth or any other surface under the pointer stays where it is.
    const isControl = control.matches(interactive);
    return {
      hover: (isControl && target.matches(":hover")) || preview.includes("hover"),
      // A toggle that is on, the current page of a Pagination, or a SegmentedControl's selected key holds its key down (design language section 6: it
      // latches at its travel).
      pressed: !fader && (isControl && control.matches(":active, [aria-pressed='true'], [aria-current]:not([aria-current='false']), .ug-segmented__input:checked")) || preview.includes("active"),
      focus: !owner && (control.matches(":focus-visible") || preview.includes("focus")),
      disabled: control.matches(":disabled, [aria-disabled='true']"),
    };
  };
  const effective = (element: Element) => lower(strataLevel(element, options.level), options.cap ?? "scene");
  // The Instrument level, per layer (design language section 16): a panel with any element at `instrument` is drawn
  // with core's `instrument` material. Its knobs and buttons become parts; everything else stays on the face as Relief.
  const instrumentLayer = [panel, ...panel.querySelectorAll("[data-strata-level]")].some(element => effective(element) === "instrument");
  const objects = (element: Element) => !instrumentLayer && effective(element) !== "relief";
  const knobs = new Set<HTMLElement>(), faders = new Set<HTMLElement>(), keys: HTMLElement[] = [];
  // Objects (design language section 6): the tokens of their proportions, and the height each surface's top stands at.
  const keyHeight = tokens.number("object.keyHeight", 8), keyTravel = tokens.number("object.keyTravel", 6), taper = tokens.number("object.taper", 3);
  const tops = new Map<Element, number>(), floors = new Map<Element, number>();
  const baseOf = (element: Element) => {
    for (let node = element.parentElement; node && node !== panel.parentElement; node = node.parentElement) if (tops.has(node)) return tops.get(node)!;
    return 0;
  };
  // A knob, dot or mark stands on the floor of its control's well; the control is the label around both.
  const floorOf = (element: Element) => floors.get(element.closest("label") ?? element.parentElement!) ?? baseOf(element);
  const width = panel.offsetWidth, height = panel.offsetHeight;
  const panelHeight = options.height ?? level(panel, "floating");
  const entries: SceneEntry[] = [];
  if (objects(panel)) {
    entries.push({ object: "slab", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: panelHeight, taper, material: materialFor(panel, "raised") });
    tops.set(panel, panelHeight);
  } else entries.push({ face: "raised", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: panelHeight, material: materialFor(panel, "raised") });
  for (const element of panel.querySelectorAll<HTMLElement>("[data-strata-face]")) {
    if (entries.length >= 254) break;
    const face = element.getAttribute("data-strata-face") as SceneFace;
    if (!faces.includes(face) || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    if (instrumentLayer && effective(element) !== "relief") {
      // A knob's skirt and cap, and a fader's carriage, are drawn as its Instrument object (a fader's slot stays a
      // groove on the face); a button as a key with a captured cap.
      const knob = element.matches(".ug-knob__skirt, .ug-knob__cap") ? element.closest<HTMLElement>(".ug-knob") : null;
      if (knob) { knobs.add(knob); continue; }
      const fader = element.matches(".ug-fader__carriage") ? element.closest<HTMLElement>(".ug-fader") : null;
      if (fader) { faders.add(fader); continue; }
      if (face === "raised" && element.matches("button")) { keys.push(element); continue; }
    }
    let rect = rectWithin(element, panel);
    if (rect[2] <= 0 || rect[3] <= 0) continue;
    const state = states(element);
    const radius = radiusOf(element, rect[2]);
    // A Switch's hardware form (`switch-forms.ts`): its parts, inside the input's box, shadows included.
    const form = switchFormEntries(element, { rect, radius, state, objects: objects(element), base: baseOf(element), rectOf: part => rectWithin(part, panel), material: materialFor, well: level(element, "well"),
      knob: { material: material(tokens.raw("material.roles.knob") || "satin"), colour: tokens.colour("knob") }, hoverHeight: tokens.number("state.hoverHeight", 1.6),
      light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, domes: options.domes });
    if (form) { entries.push(...form); continue; }
    if (objects(element) && face !== "ring" && face !== "flat") {
      const base = baseOf(element);
      if (element.matches("input[type='range']")) {
        // A slider: a metal rail along the input, and a puck (a flattened dome) placed from the value, inside the input.
        const input = element as HTMLInputElement;
        const rail = Number.parseFloat(getComputedStyle(element).getPropertyValue("--_rail")) || 6;
        const rise = Math.max(1, keyHeight / 4);
        entries.push({ object: "rail", rect: [rect[0], rect[1] + (rect[3] - rail) / 2, rect[2], rail], radius: rail / 2, height: rise, base, taper: 1,
          material: materialFor(element, "groove"), state: { disabled: state.disabled } });
        const min = Number(input.min || 0), max = Number(input.max || 100), along = max > min ? (Number(input.value) - min) / (max - min) : 0;
        const size = rect[3], inset = Math.min(taper, size / 4);
        entries.push({ object: "puck", rect: [rect[0] + along * (rect[2] - size) + inset, rect[1] + inset, size - 2 * inset, size - 2 * inset],
          height: Math.max(2, keyHeight / 2), base: base + rise, material: material(tokens.raw("material.roles.knob") || "satin"), colour: tokens.colour("knob"),
          bounds: rect, state });
        options.domes?.add(element);
        continue;
      }
      if (face === "raised") {
        // Controls (raised links included) are keys that travel on press; cards, plinths and other raised faces are
        // slabs others stand on.
        if (element.matches("button, select, [role='button'], a, .ug-segmented__key")) {
          entries.push({ object: "key", rect, radius, height: keyHeight, base, taper, travel: keyTravel, material: materialFor(element, face),
            finish: element.matches("button, [role='button'], .ug-button, .ug-segmented__key") && element.getAttribute("data-strata-finish") !== "off", state });
        } else {
          const rise = level(element, "raised");
          entries.push({ object: "slab", rect, radius, height: rise, base, taper: Math.min(taper, rise), material: materialFor(element, face), state });
          tops.set(element, base + rise);
        }
        continue;
      }
      if (face === "well" && element.matches("input[type='checkbox'], input[type='radio']")) {
        // A checkbox, radio or switch: a well sunk into the surface; its mark, dot or knob stands on its floor.
        const depth = Math.max(1, level(element, "well"));
        entries.push({ object: "well", rect, radius, height: depth, base, taper: Math.min(taper, depth), material: materialFor(element, face), state });
        floors.set(element.closest("label") ?? element.parentElement!, base - depth);
        continue;
      }
      if (face === "well") {
        // A text field: its well, and a bezel ring just inside it (the text sits on the face).
        entries.push({ face, rect, radius, height: level(element, "well"), material: materialFor(element, face), state });
        entries.push({ object: "bezel", rect, radius, height: Math.max(1, keyHeight / 4), base, taper: 1, width: Math.max(3, tokens.number("bevel.width", 6) / 2),
          material: materialFor(element, face), state: { disabled: state.disabled } });
        continue;
      }
      if (face === "mark") {
        entries.push({ object: "mark", rect, radius, height: Math.max(1, keyHeight / 4), base: floorOf(element), taper: 1, material: materialFor(element, face), state });
        continue;
      }
      if (face === "knob") {
        // A switch knob or radio dot: a dome in the control's colour, kept inside the control (the label around it).
        const control = element.closest("label") ?? element.parentElement!;
        entries.push({ object: "knob", rect, height: Math.min(rect[2], rect[3]) / 2, base: floorOf(element), material: materialFor(element, face),
          colour: tokens.colour(element.matches(".ug-radio__dot") ? "accent" : "knob"), bounds: rectWithin(control, panel), state });
        options.domes?.add(element);
        continue;
      }
    }
    if (element.matches("input[type='range']")) {
      // A slider: the face is the input's box; the groove is its rail, and the knob is placed from the value.
      const input = element as HTMLInputElement;
      const rail = Number.parseFloat(getComputedStyle(element).getPropertyValue("--_rail")) || 6;
      entries.push({ face: "groove", rect: [rect[0], rect[1] + (rect[3] - rail) / 2, rect[2], rail], radius: rail / 2, height: level(element, "well"),
        material: materialFor(element, "groove"), state: { disabled: state.disabled } });
      const min = Number(input.min || 0), max = Number(input.max || 100), along = max > min ? (Number(input.value) - min) / (max - min) : 0;
      const size = rect[3];
      entries.push({ face: "knob", rect: [rect[0] + along * (rect[2] - size), rect[1], size, size], radius: size / 2, height: level(element, "raised"),
        material: material(tokens.raw("material.roles.knob") || "satin"), state });
      continue;
    }
    if (face === "ring") {
      // A spinner: the ring is its arc's box; the turning arc stays in the captured content.
      const arc = element.querySelector(".ug-spinner__arc");
      if (arc) rect = rectWithin(arc, panel);
      entries.push({ face, rect, height: level(element, "well"), material: materialFor(element, face), state,
        ring: { thickness: Math.max(2, Math.min(rect[2], rect[3]) / 8), start: 0, sweep: 0, colour: tokens.colour("accent") } });
      continue;
    }
    entries.push({
      face, rect, radius,
      height: face === "flat" ? 0 : face === "raised" || face === "knob" ? level(element, "raised") : level(element, "well"),
      material: materialFor(element, face),
      finish: face === "raised" && element.matches("button, [role='button'], .ug-button, .ug-segmented__key") && element.getAttribute("data-strata-finish") !== "off",
      state,
    });
  }
  // The outset reaches the farthest shadow: the offset plus the softness of the tallest caster, hovered.
  const elevation = (tokens.number("light.elevation", 41) * Math.PI) / 180;
  const top = (entry: SceneEntry) => (isSceneObject(entry) ? (entry.base ?? 0) + (entry.object === "well" ? 0 : entry.height) : entry.height);
  // Hover multiplies a primitive's height, and raises an object's cap by a quarter of its height.
  const tallest = Math.max(...entries.map(entry => top(entry) * (isSceneObject(entry) ? 1.25 : tokens.number("state.hoverHeight", 1.6))));
  const reach = Math.min(128, Math.ceil(tallest / Math.tan(elevation) + 1.5 * tallest + 1));
  const settings = {
    extent: { width, height },
    outset: { top: reach, right: reach, bottom: reach, left: reach },
    backdrop: tokens.colour("stage"),
    light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) },
    bevel: { width: tokens.number("bevel.width", 6), gain: tokens.number("bevel.gain", 0.55), profile: (tokens.raw("bevel.profile") || "quarter-round") as StrataScene["bevel"]["profile"] },
    shadow: { strength: tokens.number("shadow.strength", 0.24) },
    interior: { max: Math.min(0.1, tokens.number("interior.max", 0.04)) },
    state: { hoverHeight: tokens.number("state.hoverHeight", 1.6), pressHeight: tokens.number("state.pressHeight", 0.25),
      hoverLift: tokens.number("state.hoverLift", 0.04), pressSink: tokens.number("state.pressSink", 0.06) },
    focus: { colour: tokens.colour("accent"), width: tokens.number("focus.width", 3), offset: tokens.number("focus.offset", 0.5) },
    materials,
  };
  if (instrumentLayer) return instrumentScene(panel, options, { settings, entries: entries as ScenePrimitive[], knobs, faders, keys, states, materialFor, tokens, reach });
  if (!entries.some(isSceneObject)) return { format: "strata-scene", version: 1, ...settings, primitives: entries };
  // The camera (design language section 2): centred on the stage, at D = max(camera.distance, r · h / taper + h),
  // with r the stage's half-diagonal, so every solid keeps the taper rule wherever its panel sits.
  const outer = panel.getBoundingClientRect(), stage = (options.stage ?? panel.parentElement ?? panel).getBoundingClientRect();
  const scale = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  const steepest = Math.max(0, ...entries.filter(isSceneObject).filter(entry => entry.taper).map(entry => entry.height / entry.taper!));
  const highest = Math.max(0, ...entries.map(top));
  const distance = Math.max(tokens.number("camera.distance", 1600), Math.ceil(Math.hypot(stage.width, stage.height) / 2 / scale * steepest + highest + 1));
  return {
    format: "strata-scene", version: options.environment ? 3 : 2, ...(options.environment ? { environment: options.environment } : {}),
    camera: { distance, vanish: [(stage.left + stage.width / 2 - outer.left) / scale, (stage.top + stage.height / 2 - outer.top) / scale] },
    ...settings, primitives: entries,
  };
}

/**
 * A version 4 scene for core's `instrument` material (Rendering Model part 2D), as the helper writes it: the face's
 * relief primitives, and the knobs and keys as objects of parts.
 */
export interface StrataInstrumentScene extends Omit<StrataScene, "version" | "primitives" | "materials" | "environment" | "light"> {
  version: 4;
  kind: "instrument";
  camera: { distance: number; vanish: [number, number] };
  environment: { source: "studio"; strength: number };
  light: { azimuth: number; elevation: number; intensity: number };
  materials: Record<string, InstrumentRecipe>;
  primitives: ScenePrimitive[];
  profiles: Record<string, InstrumentProfile>;
  objects: InstrumentObject[];
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The Instrument scene of a panel (design language section 16, `gpu/instrument.ts`): the face as the Relief level
 * draws it (its primitives), each knob at the Instrument level as the premium knob, its pointer turned by its spring,
 * each fader's carriage as the premium fader's, slid by its spring, and each button at the Objects level or above as a
 * key with a captured cap. Everything else stays a Relief primitive.
 */
function instrumentScene(panel: HTMLElement, options: StrataSceneOptions, context: {
  settings: Omit<StrataScene, "format" | "version" | "primitives">; entries: ScenePrimitive[]; knobs: Set<HTMLElement>; faders: Set<HTMLElement>; keys: HTMLElement[];
  states: (element: Element) => { hover: boolean; pressed: boolean; focus: boolean; disabled: boolean };
  materialFor: (element: Element, face: SceneFace) => string; tokens: ReturnType<typeof reader>; reach: number;
}): StrataInstrumentScene {
  const { settings, entries, tokens } = context;
  const materials: Record<string, InstrumentRecipe> = {};
  for (const [name, layers] of Object.entries(settings.materials)) {
    materials[name] = { base: { roughness: layers.base?.roughness ?? 1, metallic: layers.base?.metallic ?? 0 }, coat: { ...layers.coat }, emissive: { strength: layers.emissive?.strength ?? 0 } };
  }
  const profiles: Record<string, InstrumentProfile> = {};
  const profile = (name: string, shape: InstrumentProfile) => {
    const key = `${name}:${JSON.stringify(shape)}`;
    profiles[key] ??= shape;
    return key;
  };
  const use = (name: string) => { materials[name] ??= premiumMaterials[name] ?? faderMaterials[name as keyof typeof faderMaterials]; return name; };
  const scale = depthScale(tokens.number("depth", 0.5)), raised = tokens.number("elevation.raised", 3);
  const outer = panel.getBoundingClientRect(), stageBox = (options.stage ?? panel.parentElement ?? panel).getBoundingClientRect();
  const zoom = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  const stage = { width: stageBox.width / zoom, height: stageBox.height / zoom };
  const objects: InstrumentObject[] = [];
  const ids = new Set<string>(), idOf = (element: Element, prefix: string) => {
    let id = (element.id || `${prefix}-${objects.length + 1}`).slice(0, 64);
    while (ids.has(id)) id = `${id.slice(0, 60)}-${ids.size}`;
    ids.add(id);
    return id;
  };
  const now = options.now ?? performance.now(), instant = reducedMotion();
  /** Where a range input's value sits, 0–1, as its spring has it now (section 12): a uniform update, never a capture. */
  const follow = (input: HTMLInputElement, constants: { stiffness: number; damping: number }) => {
    const min = Number.parseFloat(input.min) || 0, max = Number.isFinite(Number.parseFloat(input.max)) ? Number.parseFloat(input.max) : 100;
    const target = max > min ? Math.min(1, Math.max(0, (Number(input.value) - min) / (max - min))) : 0;
    if (!options.springs) return target;
    let spring = options.springs.get(input);
    if (!spring || instant) { spring = { t: target, v: 0, time: now }; options.springs.set(input, spring); }
    else {
      // A spring at rest starts one frame back, so the first frame after a change already moves.
      if (spring.v === 0 && spring.t === target) spring.time = now;
      else if (spring.v === 0 && now - spring.time > 50) spring.time = now - 16;
      if (!advanceSpring(spring, target, now, constants)) options.moving?.add(input);
    }
    return spring.t;
  };
  let tallest = 0;
  for (const root of context.knobs) {
    const input = root.querySelector<HTMLInputElement>(".ug-knob__input"), skirt = root.querySelector(".ug-knob__skirt"), cap = root.querySelector(".ug-knob__cap");
    if (!input || !skirt || !cap || objects.length + entries.length >= 255) continue;
    // The pointer follows the value on its spring.
    const t = follow(input, root.matches(".ug-knob--detented") ? knobSprings.detent : knobSprings.knob);
    const state = context.states(skirt);
    const sweep = reader(root).number("knob.sweep", 270);
    objects.push(knobObject({ id: idOf(input, "knob"), box: rectWithin(input, panel), skirt: rectWithin(skirt, panel)[2], cap: rectWithin(cap, panel)[2], t, sweep, scale,
      state: { hover: state.hover, disabled: state.disabled }, relief: { height: raised, material: use("knobCap") } }, profile));
    for (const name of ["knobSkirt", "knobChamfer", "knobInk"]) use(name);
    options.domes?.add(skirt); options.domes?.add(cap);
    tallest = Math.max(tallest, (2.5 + 16 + 1.2) * scale);
  }
  const light = { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) };
  for (const root of context.faders) {
    const input = root.querySelector<HTMLInputElement>(".ug-fader__input"), slot = root.querySelector(".ug-fader__slot"), carriage = root.querySelector(".ug-fader__carriage");
    if (!input || !slot || !carriage || objects.length + entries.length >= 255) continue;
    // The carriage slides with the value on `spring.fader`; the slot stays a groove and the scale captured on the face.
    const t = follow(input, faderSpring);
    const state = context.states(carriage), box = rectWithin(input, panel), slotBox = rectWithin(slot, panel);
    if (box[2] <= 0 || box[3] <= 0 || slotBox[2] <= 0 || slotBox[3] <= 0) continue;
    const vertical = !root.matches(".ug-fader--horizontal");
    // The carriage's caster is capped where its shadow would leave the box (full depth), so the shadow stays in it.
    objects.push(faderObject({ id: idOf(input, "fader"), box, slot: slotBox, vertical, t, scale, light, state: { hover: state.hover, disabled: state.disabled },
      relief: { rect: rectWithin(carriage, panel), height: raised, material: use("faderCap") } }, profile));
    for (const name of ["faderChamfer", "faderInk"]) use(name);
    options.domes?.add(carriage);
    tallest = Math.max(tallest, faderParts(vertical, scale).carriage.height + 0.13);
  }
  for (const element of context.keys) {
    if (objects.length + entries.length >= 255) break;
    const colour = hex(getComputedStyle(element).backgroundColor), name = `key ${colour}`;
    const box = rectWithin(element, panel), state = context.states(element), height = 5 * scale;
    // A body per colour (the button's own face colour, in its material's roughness), within core's 16 materials.
    const key = materials[name] || Object.keys(materials).length < 14
      ? keyObject({ id: idOf(element, "key"), box, radius: radiusOf(element, box[2]), material: name, height, travel: 2.5 * scale, pressed: state.pressed,
        state: { hover: state.hover, pressed: state.pressed, disabled: state.disabled }, stage, relief: { height: raised, material: use("keyCap") } }, profile)
      : undefined;
    if (!key) { entries.push({ face: "raised", rect: box, radius: radiusOf(element, box[2]), height: raised, material: context.materialFor(element, "raised"), state }); continue; }
    const layers = settings.materials[context.materialFor(element, "raised")];
    materials[name] ??= { base: { colour, roughness: layers?.base?.roughness ?? 0.45, metallic: layers?.base?.metallic ?? 0 }, coat: { ...layers?.coat } };
    objects.push(key);
    tallest = Math.max(tallest, height + 1);
  }
  const elevation = (tokens.number("light.elevation", 41) * Math.PI) / 180;
  const reach = Math.min(128, Math.max(context.reach, Math.ceil(tallest / Math.tan(elevation) + 1.5 * tallest + 1)));
  return {
    ...settings, format: "strata-scene", version: 4, kind: "instrument",
    outset: { top: reach, right: reach, bottom: reach, left: reach },
    camera: { distance: Math.max(INSTRUMENT_CAMERA, tokens.number("camera.distance", 1600)),
      vanish: [(stageBox.left + stageBox.width / 2 - outer.left) / zoom, (stageBox.top + stageBox.height / 2 - outer.top) / zoom] },
    environment: { source: "studio", strength: Math.min(3, Math.max(0, tokens.number("environment.intensity", 1))) },
    light: { ...settings.light, intensity: 1.6 },
    materials, primitives: entries, profiles, objects,
  };
}

type Movable = HTMLElement & { [panelMotion]?: PanelMover };

/** A resolved CSS time (`.32s`, `320ms`) in milliseconds. */
function milliseconds(value: string): number {
  const amount = Number.parseFloat(value);
  return value.trim().endsWith("ms") ? amount : amount * 1000;
}

/** A CSS `cubic-bezier()` timing function (or `linear`), as progress over time, for the scene height during motion. */
function bezier(value: string): (t: number) => number {
  const match = value.match(/cubic-bezier\(([^)]+)\)/);
  const [x1, y1, x2, y2] = match ? match[1]!.split(",").map(Number) as [number, number, number, number] : [0, 0, 1, 1];
  const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  return x => {
    // The ends are exact, so a motion that has finished leaves its panel exactly at its own height.
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // x(t) is monotonic for x1, x2 in [0, 1]: bisect for t, then read y.
    let low = 0, high = 1;
    for (let step = 0; step < 24; step++) { const mid = (low + high) / 2; if (at(mid, x1, x2) < x) low = mid; else high = mid; }
    return at((low + high) / 2, y1, y2);
  };
}

/**
 * Presents the Strata panels among `controller.container`'s direct children on the GPU, and keeps their scenes in
 * step with layout, states, tokens and the presentation mode. Returns a handle; `detach()` restores everything.
 */
export function attachStrataGpu(controller: StrataGpuController, options: StrataGpuOptions = {}): StrataGpu {
  registerTokens();
  const selector = options.panels ?? ".ug-panel";
  const root = controller.container;
  // Under forced colours everything is flat (design language section 4): the CSS presentation stays.
  const forced = matchMedia("(forced-colors: active)");
  type Motion = { start: number; duration: number; ease: (t: number) => number; from: number; to: number };
  const panels = new Map<HTMLElement, { id: string; release: () => void; handle?: ReturnType<StrataGpuController["setMaterial"]>; kind?: StrataSceneMaterial["kind"];
    scene?: string; motion?: Motion; domes: Set<Element> }>();
  /** Shows the CSS paint of the elements a panel no longer draws as domes, and hides it on those it now does. */
  const markDomes = (entry: { domes: Set<Element> }, domes: Set<Element>) => {
    for (const element of entry.domes) if (!domes.has(element)) element.removeAttribute("data-strata-dome");
    for (const element of domes) if (!element.hasAttribute("data-strata-dome")) element.setAttribute("data-strata-dome", "");
    entry.domes = domes;
  };
  // Scrims under open dialogs: plain layers (no material) that the GPU fades in and out.
  const scrims = new Map<HTMLElement, { id: string; release: () => void; fade?: ReturnType<StrataGpuController["transition"]>; closing?: boolean }>();
  let serial = 0, frame = 0, detached = false;
  // Instrument knobs' springs, kept between scenes; the knobs still moving ask for another frame.
  const springs = new WeakMap<Element, KnobSpring>(), moving = new Set<Element>();
  const schedule = () => { if (!frame && !detached) frame = requestAnimationFrame(sync); };
  const resize = new ResizeObserver(schedule);
  // The adjust policy: a cap on levels, moved by frame intervals measured here (no core dependency).
  let cap: StrataLevel = "scene";
  const policy = { frameBudgetMs: 25, stepDownAfterFrames: 120, stepUpAfterFrames: 600, window: 60, ...options.adjust };
  const intervals: number[] = [];
  let over = 0, under = 0, previous = 0, meter = 0;
  /** The highest level any panel (or the application) asks for, so the cap never rises above it. */
  const wanted = () => {
    let highest: StrataLevel = options.level ?? "relief";
    for (const element of panels.keys()) {
      for (const node of [element, ...element.querySelectorAll("[data-strata-level]")]) highest = strataLevels[Math.max(strataLevels.indexOf(highest), strataLevels.indexOf(strataLevel(node, options.level)))]!;
    }
    return highest;
  };
  const step = (to: StrataLevel, p95: number) => {
    const event: StrataAdjustEvent = { from: lower(cap, wanted()), to, p95, frameBudgetMs: policy.frameBudgetMs };
    cap = to;
    intervals.length = 0; over = 0; under = 0;
    options.onAdjust?.(event);
    root.dispatchEvent(new CustomEvent("strata-adjust", { detail: event }));
    schedule();
  };
  const measure = (now: number) => {
    meter = 0;
    if (detached) return;
    // A hidden tab or a stall is not rendering cost: intervals over 250 ms are not counted.
    if (previous && now - previous < 250) {
      intervals.push(now - previous);
      if (intervals.length > policy.window) intervals.shift();
    }
    previous = now;
    if (intervals.length >= policy.window && controller.state().mode === "gpu") {
      const sorted = [...intervals].sort((a, b) => a - b), p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
      const highest = wanted(), current = lower(cap, highest);
      over = p95 > policy.frameBudgetMs ? over + 1 : 0;
      under = p95 <= policy.frameBudgetMs * 0.8 ? under + 1 : 0;
      // The Scene level draws its panels at the Objects level, so a page that asks for `scene` steps over `instrument`.
      const next = (direction: 1 | -1) => {
        const level = strataLevels[strataLevels.indexOf(current) + direction]!;
        return level === "instrument" && highest === "scene" ? strataLevels[strataLevels.indexOf(level) + direction]! : level;
      };
      if (over >= policy.stepDownAfterFrames && current !== "relief") step(next(-1), p95);
      else if (under >= policy.stepUpAfterFrames && strataLevels.indexOf(cap) < strataLevels.indexOf(highest)) step(next(1), p95);
    }
    meter = requestAnimationFrame(measure);
  };
  if (options.adjust?.enabled) meter = requestAnimationFrame(measure);
  const presenting = () => controller.state().mode === "gpu" && !forced.matches;
  // A layer must never be hidden while presented (it would have no size), so only shown children are taken on.
  const shown = (element: Element): element is HTMLElement => element instanceof HTMLElement && !element.hidden && element.checkVisibility();

  /** Enrolls a shown panel now. Face mode comes first, so the panel never carries its CSS relief as a GPU layer. */
  function enrollPanel(element: HTMLElement, gpu: boolean) {
    const id = element.id || `strata-panel-${++serial}`;
    try {
      if (gpu) element.setAttribute("data-strata-mode", "face");
      // Centred, so depth and tilt move the panel about its middle as the CSS motion does.
      const release = controller.enroll(element, { id, origin: "center" });
      panels.set(element, { id, release, domes: new Set() });
      (element as Movable)[panelMotion] = mover(element);
      resize.observe(element);
    } catch (error) {
      element.removeAttribute("data-strata-mode");
      console.warn(`Strata GPU: ${id} was not enrolled: ${String(error)}`);
    }
  }
  /** Lets a panel go now: its material, its enrollment, face mode and its mover. */
  function releasePanel(element: HTMLElement) {
    const entry = panels.get(element);
    if (!entry) return;
    entry.handle?.cancel(); entry.release(); resize.unobserve(element); element.removeAttribute("data-strata-mode"); panels.delete(element);
    delete (element as Movable)[panelMotion];
    markDomes(entry, new Set());
  }
  /** Enrolls a shown scrim now, on the GPU only, and fades it in. */
  function enrollScrim(element: HTMLElement) {
    const id = `strata-scrim-${++serial}`;
    try {
      element.setAttribute("data-strata-mode", "face");
      scrims.set(element, { id, release: controller.enroll(element, { id }) });
      fadeScrim(element, false);
    } catch (error) {
      element.removeAttribute("data-strata-mode");
      console.warn(`Strata GPU: a scrim was not enrolled: ${String(error)}`);
    }
  }
  function releaseScrim(element: HTMLElement) {
    const entry = scrims.get(element);
    if (!entry) return;
    entry.fade?.cancel(); entry.release(); element.removeAttribute("data-strata-mode"); scrims.delete(element);
  }
  /** Fades a scrim's layer in, or out once its dialog closes, over `motion.slow` (instant under reduced motion). */
  function fadeScrim(element: HTMLElement, out: boolean) {
    const entry = scrims.get(element);
    if (!entry) return;
    entry.closing = out;
    const tokens = reader(element);
    const duration = Math.max(1, milliseconds(tokens.raw("motion.slow")) || 320);
    const keyframes = out ? [{ offset: 0 }, { offset: 1, opacity: 0 }] : [{ offset: 0, opacity: 0 }, { offset: 1 }];
    try { entry.fade = controller.transition(entry.id, { keyframes, timing: { duration, easing: tokens.raw("motion.easing.standard") || "ease-out" } }); }
    catch { entry.fade = undefined; }
  }
  // The stage hook (`@underglass/ui/dom`'s `stageOf`): dialogs hand their panel and scrim over as they show, and take
  // them back before they hide, in the same task.
  const presenter: StagePresenter = {
    present: element => {
      if (detached || element.parentElement !== root || !shown(element)) return;
      const gpu = presenting();
      if (element.matches(".ug-scrim")) { if (gpu && !scrims.has(element)) enrollScrim(element); return; }
      if (!element.matches(selector) || panels.has(element)) return;
      enrollPanel(element, gpu);
      const entry = panels.get(element);
      if (entry && gpu) update(element, entry);
    },
    withdraw: element => { releasePanel(element); releaseScrim(element); },
  };
  root.setAttribute("data-strata-stage", "");
  (root as HTMLElement & { [strataStage]?: StagePresenter })[strataStage] = presenter;

  function sync() {
    frame = 0;
    if (detached) return;
    moving.clear();
    const gpu = presenting();
    for (const element of root.children) {
      if (!shown(element)) continue;
      if (gpu && element.matches(".ug-scrim") && !scrims.has(element)) enrollScrim(element);
      if (!element.matches(selector) || panels.has(element)) continue;
      enrollPanel(element, gpu);
    }
    for (const [element, entry] of scrims) {
      if (element.parentElement !== root || !shown(element)) { releaseScrim(element); continue; }
      if (!gpu) { element.removeAttribute("data-strata-mode"); continue; }
      element.setAttribute("data-strata-mode", "face");
      if (element.hasAttribute("data-strata-closing") && !entry.closing) fadeScrim(element, true);
    }
    for (const [element, entry] of panels) {
      if (element.parentElement !== root) { releasePanel(element); continue; }
      if (!gpu) {
        // GPU is off: the CSS relief presents, and no material is kept.
        if (element.getAttribute("data-strata-mode") === "face") element.removeAttribute("data-strata-mode");
        entry.handle?.cancel(); entry.handle = undefined; entry.scene = undefined;
        markDomes(entry, new Set());
        continue;
      }
      update(element, entry);
    }
    // The Scene level: its backdrop while it applies (and its particles, which end with it).
    if (sceneLevel()) presentBackdrop(); else { withdrawBackdrop(); endParticles(); }
    // A CSS transition (a knob sliding, a face settling) moves geometry with no event per frame: follow it until it
    // ends. Endless CSS animations (the spinner) stay in the captured content and need no new scene.
    if (gpu && (root.getAnimations({ subtree: true }).some(animation => animation instanceof CSSTransition && animation.playState === "running")
      || [...panels.values()].some(entry => entry.motion) || moving.size)) schedule();
  }

  // ---- The Scene level (Phase 5): decorative layers the helper owns, a backdrop first and particles last. ----
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  /** The stage's box: the root's containing block (the canvas, or the ordinary host), which overlays fill. */
  const stageBox = () => root.parentElement ?? root;
  /** Whether the stage is at the Scene level now: presenting, and neither the page nor the adjust policy lowers it. */
  const sceneLevel = () => presenting() && lower(strataLevel(root, options.level), cap) === "scene";
  type StageLayer = { element: HTMLElement; release: () => void; handle?: ReturnType<StrataGpuController["setMaterial"]>; scene?: string };
  let backdrop: StageLayer | undefined, particles: (StageLayer & { confetti: Confetto[]; done: (() => void)[]; last: number; frame: number }) | undefined;
  /** A decorative, inert, hidden layer of the stage's size, added to the root and enrolled now. */
  function stageLayer(id: string, first: boolean): StageLayer | undefined {
    const element = document.createElement("div");
    element.className = "ug-stage-layer";
    element.id = id;
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
    if (first) root.prepend(element); else root.append(element);
    try { return { element, release: controller.enroll(element, { id, decorative: true }) }; }
    catch (error) { element.remove(); console.warn(`Strata GPU: the ${id} layer was not enrolled: ${String(error)}`); return undefined; }
  }
  /** Lets a stage layer go now, then removes it: a presented layer is never removed while enrolled. */
  function dropLayer(layer: StageLayer) {
    layer.handle?.cancel(); layer.release(); layer.element.remove();
  }
  /** The stage scene for a stage layer: the application's light and camera, centred on the stage. */
  function stageScene(layer: HTMLElement, extra: Partial<StageScene>): StageScene {
    const tokens = reader(root);
    const width = layer.offsetWidth, height = layer.offsetHeight;
    return { format: "strata-stage", version: 3, extent: { width, height },
      light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) },
      camera: { distance: tokens.number("camera.distance", 1600), vanish: [width / 2, height / 2] }, particles: [], ...extra };
  }
  function setStage(layer: StageLayer, scene: StageScene) {
    const key = JSON.stringify(scene);
    if (layer.scene === key) return;
    try {
      if (layer.handle) layer.handle.update(scene);
      else layer.handle = controller.setMaterial(layer.element.id, { kind: "stage", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
      layer.scene = key;
    } catch { layer.scene = undefined; }
  }
  function presentBackdrop() {
    backdrop ??= stageLayer("strata-backdrop", true);
    if (!backdrop) return;
    const tokens = reader(root), settings = options.backdrop ?? {};
    setStage(backdrop, stageScene(backdrop.element, { backdrop: { colour: tokens.colour("stage"), pool: settings.pool ?? 0.5, vignette: settings.vignette ?? 0.35,
      ...(settings.tint ? { tint: settings.tint, tintStrength: settings.tintStrength ?? 0.1 } : {}) } }));
  }
  function withdrawBackdrop() {
    if (!backdrop) return;
    dropLayer(backdrop);
    backdrop = undefined;
  }
  function endParticles() {
    if (!particles) return;
    cancelAnimationFrame(particles.frame);
    dropLayer(particles);
    for (const resolve of particles.done) resolve();
    particles = undefined;
  }
  /** One physics step and one scene per frame, until the last particle has gone. */
  function stepParticles(now: number) {
    if (!particles) return;
    particles.confetti = advance(particles.confetti, (now - particles.last) / 1000, particles.element.offsetHeight - 6);
    particles.last = now;
    if (!particles.confetti.length || !sceneLevel()) { endParticles(); return; }
    setStage(particles, stageScene(particles.element, { particles: particles.confetti.slice(-256).map(asParticle) }));
    particles.frame = requestAnimationFrame(stepParticles);
  }
  function burst(origin: Element | [number, number], burstOptions: BurstOptions = {}): Promise<void> {
    if (detached || reduced.matches || !sceneLevel()) return Promise.resolve();
    if (!particles) {
      const layer = stageLayer("strata-particles", false);
      if (!layer) return Promise.resolve();
      particles = { ...layer, confetti: [], done: [], last: performance.now(), frame: 0 };
      particles.frame = requestAnimationFrame(stepParticles);
    }
    const box = particles.element.getBoundingClientRect();
    const [x, y] = Array.isArray(origin) ? origin : (() => { const rect = origin.getBoundingClientRect(); return [rect.left + rect.width / 2 - box.left, rect.top + rect.height / 2 - box.top]; })();
    const tokens = reader(root);
    const colours = burstOptions.colours ?? ["accent", "success", "warning", "danger", "info"].map(role => tokens.colour(role)).filter(colour => colour !== "#000000");
    particles.confetti.push(...launch(x, y, colours, burstOptions));
    return new Promise(resolve => particles!.done.push(resolve));
  }
  // Environment light: an `.hdr` loaded once and downsampled for every object scene.
  let environment: EnvironmentMap | undefined;
  if (options.environment) {
    fetch(options.environment).then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(buffer => { environment = environmentFrom(decodeHdr(buffer)); schedule(); })
      .catch(error => console.warn(`Strata GPU: the environment ${options.environment} did not load: ${String(error)}`));
  }

  /** Brings a presented panel's scene and material up to date. */
  function update(element: HTMLElement, entry: NonNullable<ReturnType<typeof panels.get>>) {
    if (element.getAttribute("data-strata-mode") !== "face") element.setAttribute("data-strata-mode", "face");
    const motion = entry.motion;
    const domes = new Set<Element>();
    const scene = strataScene(element, { level: options.level, cap, stage: stageBox(), domes, environment, springs, moving,
      ...(motion ? { height: motion.from + (motion.to - motion.from) * motion.ease(Math.min(1, (performance.now() - motion.start) / motion.duration)) } : {}) });
    markDomes(entry, domes);
    const key = JSON.stringify(scene);
    if (entry.scene === key) return;
    const kind = scene.version === 1 ? "relief" : scene.version === 4 ? "instrument" : "objects";
    try {
      // A change of level changes the material's kind: the new material replaces the old one in one step.
      if (entry.handle && entry.kind === kind) entry.handle.update(scene);
      else {
        const base = { bounds: "layer", interaction: "material", media: "identity", fallback: "static" } as const;
        entry.handle = controller.setMaterial(entry.id, scene.version === 4 ? { kind: "instrument", scene, ...base } : { kind: kind as "relief" | "objects", scene, ...base });
      }
      entry.kind = kind;
      entry.scene = key;
    } catch {
      // The runtime is between states (admitting or transitioning): try again on the next change or poll.
      entry.scene = undefined;
    }
  }

  /**
   * A panel's GPU mover: from `elevation.modal` towards the panel's own level over `motion.slow`, as the CSS motion's
   * `perspective() translateZ() rotateX()` does: the depth becomes a scale of `D / (D − modal)` about the centre, with
   * the same tilt and fade. The panel's scene height travels the same way. It resolves when core's transition ends;
   * a motion core cannot start (GPU between states) ends at once, as reduced motion does.
   */
  function mover(element: HTMLElement): PanelMover {
    return async (motion, { tilt }) => {
      const entry = panels.get(element);
      if (!entry) return;
      const tokens = reader(element);
      const distance = tokens.number("camera.distance", 1600), modal = tokens.number("elevation.modal", 24);
      const own = tokens.number(`elevation.${element.getAttribute("data-strata-elevation") ?? "floating"}`, tokens.number("elevation.floating", 8));
      const duration = Math.max(1, milliseconds(tokens.raw("motion.slow")) || 320);
      const easing = tokens.raw("motion.easing.standard") || "cubic-bezier(0.2, 0, 0, 1)";
      const depth = distance / Math.max(distance - modal, 1);
      const far = { opacity: 0, scaleX: depth, scaleY: depth, ...(tilt ? { tiltX: tilt, perspective: distance } : {}) };
      // At the Scene level a panel entering settles: a damped spring through depth and tilt, sampled into keyframes.
      const settles = motion === "enter" && sceneLevel() && lower(strataLevel(element, options.level), cap) === "scene";
      const length = settles ? duration * 2 : duration;
      const settle = (t: number) => spring((t * length) / 1000);
      const keyframes = !settles ? (motion === "enter" ? [{ offset: 0, ...far }, { offset: 1 }] : [{ offset: 0 }, { offset: 1, ...far }])
        : Array.from({ length: 24 }, (_, index) => {
          const t = index / 23, x = index === 23 ? 1 : settle(t), scale = depth + (1 - depth) * x;
          return { offset: t, opacity: Math.min(1, t / 0.3), scaleX: scale, scaleY: scale, ...(tilt ? { tiltX: Math.max(-60, Math.min(60, tilt * (1 - x))), perspective: distance } : {}) };
        });
      let handle: ReturnType<StrataGpuController["transition"]>;
      try { handle = controller.transition(entry.id, { keyframes, timing: { duration: length, easing: settles ? "linear" : easing } }); }
      catch (error) { console.warn(`Strata GPU: ${entry.id} did not move: ${String(error)}`); return; }
      entry.motion = { start: performance.now(), duration: length, ease: settles ? settle : bezier(easing), from: motion === "enter" ? modal : own, to: motion === "enter" ? own : modal };
      schedule();
      try { await handle.finished; } finally { entry.motion = undefined; schedule(); }
    };
  }
  const events = ["pointerover", "pointerout", "pointerdown", "pointerup", "focusin", "focusout", "keydown", "keyup", "input", "change", "transitionrun", "transitionend"];
  for (const type of events) root.addEventListener(type, schedule, true);
  const mutation = new MutationObserver(schedule);
  mutation.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "disabled", "checked", "aria-checked",
    "aria-current", "aria-disabled", "aria-pressed", "aria-selected", "data-strata-closing", "data-strata-face", "data-strata-material", "data-strata-elevation", "data-strata-level", "data-strata-depth", "data-strata-theme", "data-strata-scope", "data-strata-preview", "hidden", "open"] });
  resize.observe(root);
  const poll = setInterval(schedule, options.poll ?? 500);
  forced.addEventListener("change", schedule);
  sync();
  const handle: StrataGpu = {
    burst,
    refresh: () => { if (frame) cancelAnimationFrame(frame); sync(); },
    scene: panel => { const key = panels.get(panel)?.scene; return key ? JSON.parse(key) as StrataScene | StrataInstrumentScene : undefined; },
    cap: () => cap,
    detach: () => {
      if (detached) return;
      detached = true;
      if (frame) cancelAnimationFrame(frame);
      if (meter) cancelAnimationFrame(meter);
      for (const type of events) root.removeEventListener(type, schedule, true);
      mutation.disconnect(); resize.disconnect(); clearInterval(poll); forced.removeEventListener("change", schedule);
      for (const element of [...panels.keys()]) releasePanel(element);
      for (const element of [...scrims.keys()]) releaseScrim(element);
      endParticles(); withdrawBackdrop();
      root.removeAttribute("data-strata-stage");
      delete (root as HTMLElement & { [strataStage]?: StagePresenter })[strataStage];
      attachedTo.delete(root);
    },
  };
  attachedTo.set(root, handle);
  return handle;
}
