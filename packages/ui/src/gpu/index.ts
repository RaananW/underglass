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
 * A Lamp's or StatusLight's lens is an emitter at every level (`gpu/lamp-forms.ts`, `gpu/instrument-lamp.ts`; design language
 * section 3): a panel with any lens takes a version 4 scene with its `emitters` (the lens's colour, strength and reach from
 * `--strata-lit` and the `emitter.*` tokens, read each frame, so a blink or a toggle is a uniform update), the `protected`
 * rects of its text and a `feather`, so core's face pool lights the page around the lens within the contrast guard.
 *
 * A Pad's rim of light is an emitter at every level (`gpu/pad-keypad.ts`, `gpu/pad-forms.ts`, `gpu/instrument-pad.ts`; design language section 3, `emitter.pad.*`),
 * lit by the `--strata-lit` the stylesheet gives it while held or latched, its whole cap among the protected rects; its cap travels on the CSS throw
 * (`--strata-push-t`). A Keypad has no light: Relief and Objects draw its caps and its plinth as raised faces or keys and a slab, and the Instrument level a
 * polished plinth object and a body with a captured cap per key.
 *
 * The indicator forms' lenses (a Rating's lamps, a Badge's LED, a ProgressBar's segments, a Spinner's ring; `gpu/indicator-forms.ts`) are the same lenses, one
 * emitter each, lit by the `--strata-lit` the stylesheet gives them (a hover preview, a value, a chase), drawn at every level as a Meter's segments are.
 *
 * A Meter's or Gauge's segments are the same LED lenses (`gpu/meter-forms.ts`, `gpu/instrument-meter.ts`; design language section 6): one
 * emitter each, in the colour of its zone, lit from the native meter's value (or the live value `driveStrataMeter` gave it) and its held
 * peak, so a value change is a uniform update at every level. A needle meter's and a gauge's window and bezel are Relief and Objects
 * primitives (fitted so their shadows stay in the native meter's box) with the needle as captured content; at the Instrument level the
 * needle is a part turned by its spring (`spring.meter`, `spring.gauge`), over a glass window that keeps the printed scale exact.
 *
 * A Display (`gpu/display-forms.ts`, `gpu/instrument-display.ts`; design language section 6) is a bezel and a window under its native
 * input or output, which covers all of it: a groove and a flat face at Relief, a slab and a flat face at Objects, and at the Instrument
 * level a polished bezel and a glass pane over the printed text. Its backlight is a few emitters along the window, lit by `--strata-lit`
 * (read each frame, so a toggle is a uniform write); the text's own box (the content box of an input, the text runs of an output) is a
 * protected rect, so the window's glass leaves the text exact and the backlight stays within the contrast guard over it.
 *
 * A Card's, Panel's or Dialog's plate and a tray (a Card's or Panel's recessed well, a Drawer) are a rim and a wall of parts at the
 * Instrument level (`gpu/instrument-plate.ts`, design language section 6): a mesh swept along the element's rounded outline inside its
 * box, rising out of the chassis with a Dialog's or Drawer's motion (`rise`, a uniform update), and at the other levels the
 * element's material (`material.roles.plate`, satin without a character) and its well.
 *
 * At the Instrument level (`instrument`, between `objects` and `scene` on the ladder, set like the others) a panel with
 * any element at that level takes core's `instrument` material and a version 4 scene (`gpu/instrument.ts`): its knobs
 * become the premium knob's parts, whose pointer turns on a spring as their value changes (uniform updates, no
 * recapture), its faders the premium fader's carriage (`gpu/instrument-fader.ts`), sliding its slot on `spring.fader`
 * while the slot stays a groove and the scale printed on the face, its Switch forms their moving parts and bezels
 * (`gpu/instrument-switch.ts`), posed by the CSS throw, its rotary selectors the knob's parts turned to the selected option
 * on `spring.detent`, its push buttons (`gpu/instrument-push.ts`) a polished bezel, a glass ring that is an emitter and a captured
 * cap on the CSS throw, and its other buttons keys with captured caps; every other component stays a Relief primitive on the face.
 * The Scene level still draws its panels at the Objects level, so the adjust policy steps a Scene page over
 * `instrument`.
 *
 * Material cap (issue #173): core draws an Instrument layer with at most 16 materials (`INSTRUMENT_MATERIALS`); a scene naming more is valid
 * but its layer is drawn at Relief, reported in core's `state().instrument.layers[]` (`status` stepped-down, `reason` budget, `materials`).
 * The helper keeps its own scenes under the cap with two rules, now named and reported: a key body of the button's own colour is added
 * while the scene holds fewer than `INSTRUMENT_KEY_BODY_MATERIALS` (14) materials, a push button's parts while it holds fewer than
 * `INSTRUMENT_PUSH_MATERIALS` (12) (they need up to four more); past a rule the button is a Relief key. When a rule or the cap itself
 * triggers, `StrataGpu.diagnostics(panel)` says so (the count, the cap, the ids of the keys drawn at Relief) and the helper warns once
 * per panel with `console.warn`. Every key-like object must register its body so the cap conversion can trim it: a loop that makes keys takes the
 * registry (`createKeyRegistry`, `gpu/instrument-keys.ts`) and calls `registerKeyBody` and `keyAtRelief` (see that file's header).
 * A Select's `selector` form is the RotarySelector's object over the Select's own select, and its `display` form a Display over it (the select's
 * text is the window's) between two push buttons, so both are drawn by the paths above. A rail Tabs (`gpu/tabs-forms.ts`, `gpu/instrument-tabs.ts`;
 * anatomy page `tabs.md`, section 11) is a plinth (the tablist), a key on it for each tab's cap and an LED lens above it that is an emitter, lit while
 * its tab is selected: a raised face, a key and a ring or dome at Relief and Objects, and at the Instrument level one polished plinth part and, per
 * tab, a body with a captured cap travelling on the CSS throw and a glass LED.
 *
 * A JogWheel's wheel and a PatchPoint's jack are drawn at every level (`gpu/wave3.ts`; design language section 6): the wheel a disc in a recess with a
 * finger dimple, the jack a washer with a hole and, while it is connected, a plug and a cable stub. At the Instrument level the wheel is a
 * turned cap in a bearing collar whose dimple turns on its accumulated angle (`--strata-jog-angle`, on the knob's spring), and the jack a
 * washer and barrel whose plug rises out of the hole on `spring.patch`; both are uniform updates, so a turning frame or a rising frame recaptures nothing (core captures each native `input` event, as for a Knob).
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
import { liveStrataMeter } from "../dom/meter.ts";
import { switchFormEntries } from "./switch-forms.ts";
import { pushFormEntries } from "./push-forms.ts";
import { bankPlinthHeight, bankPlinthObject, pushHeight, pushMaterials, pushMaterialsOf, pushObject } from "./instrument-push.ts";
import { followSpring } from "./instrument-rotary.ts";
import { pushEmitterDefaults, pushPosition, ringEmitter, type PushEmitterTokens } from "../shared/push-button.ts";
import { rotaryFraction } from "../shared/rotary-selector.ts";
import { lampFormEntries } from "./lamp-forms.ts";
import { lampHeight, lampMaterialsOf, lampObject, lensMaterial, type LampKind } from "./instrument-lamp.ts";
import { emitterDefaults, lensEmitter, type EmitterTokens, type LampEmitter } from "../shared/lamp.ts";
import { claimPadKeypad, collectPads, padKeypadEntries, padKeypadObjects } from "./pad-keypad.ts";
import { meterFormEntries } from "./meter-forms.ts";
import { meterBarObject, meterDialObject, meterHeight, meterMaterials } from "./instrument-meter.ts";
import { advancePeak, meterFraction, meterSprings, meterZoneRoles, peakDefaults, peakIndex, segmentEmitterDefaults, segmentsLit, segmentZones, type PeakState } from "../shared/meter.ts";
import { DISABLED_LIGHT, INDICATOR_LENS, indicatorOf, roomAround } from "./indicator-forms.ts";
import { strataStage, type StagePresenter } from "../dom/stage.ts";
import type { EnvironmentMap, StageScene } from "../tokens/stage.ts";
import { resetWave3, wave3Entries, wave3Objects } from "./wave3.ts";
import type { StudioTokens } from "../tokens/instrument.ts";
import { advance, asParticle, decodeHdr, environmentFrom, launch, spring, type BurstOptions, type Confetto } from "./scene.ts";
import { advanceSpring, depthScale, INSTRUMENT_CAMERA, keyObject, knobObject, knobSprings, premiumMaterials, profileKey, type CustomPartSource, type InstrumentObject,
  type InstrumentProfile, type InstrumentRecipe, type KnobSpring } from "./instrument.ts";
import { characterMaterials } from "./instrument-character.ts";
import { faderMaterials, faderObject, faderParts, faderSpring } from "./instrument-fader.ts";
import { switchHeight, switchMaterials, switchObject } from "./instrument-switch.ts";
import { plateMargin, plateMaterials, plateObject, plateParts, plateTokenDefaults, type PlateForm, type PlateOpen } from "./instrument-plate.ts";
import type { StrataSwitchForm } from "../shared/switch-forms.ts";
import { displayFormEntries } from "./display-forms.ts";
import { bezelCaster, displayHeight, displayMaterials, displayObject } from "./instrument-display.ts";
import { displayEmitterDefaults, displayEmitters, finishAllowed, type DisplayEmitterTokens } from "../shared/display.ts";
import { tabFormEntries, tabState } from "./tabs-forms.ts";
import { railHeight, railKeyMaterials, railKeyObject, railMaterials, railPlinthObject } from "./instrument-tabs.ts";

export type { CustomPartInput, CustomPartSource, InstrumentMeshProfile, InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentRecipe, KnobSpring } from "./instrument.ts";
export { customPart } from "./instrument.ts";
export { INSTRUMENT_KEY_BODY_MATERIALS, INSTRUMENT_PUSH_MATERIALS, STRATA_INSTRUMENT_MATERIAL_CAP, createKeyRegistry } from "./instrument-keys.ts";
export type { KeyBody, KeyRegistry, StrataGpuDiagnostics } from "./instrument-keys.ts";
import { createKeyRegistry, INSTRUMENT_KEY_BODY_MATERIALS, INSTRUMENT_PUSH_MATERIALS, type StrataGpuDiagnostics } from "./instrument-keys.ts";

export { decodeHdr, environmentFrom, launch, advance, spring } from "./scene.ts";
export type { BurstOptions, Confetto, HdrImage } from "./scene.ts";

/** What the helper needs from an Underglass controller (`CanvasController` from `@underglass/core`). */
export interface StrataGpuController {
  readonly container: HTMLElement;
  enroll(element: HTMLElement, options: { id: string; origin?: "center"; decorative?: boolean }): () => void;
  setMaterial(id: string, descriptor: StrataSceneMaterial | StrataStageMaterial): {
    update(scene: StrataScene | StrataLightScene | StrataInstrumentScene | StageScene): void; cancel(): void;
    /** Core's per-frame path for the lights alone (uniform writes only); absent in a controller that has none. */
    setEmitters?(emitters: LampEmitter[]): void;
  };
  transition(id: string, motion: StrataPanelMotion): { finished: Promise<{ status: string; reason: string }>; cancel(): void };
  state(): { mode: string };
}
/** A panel motion as core's typed motion: numeric keyframes and timing. */
export interface StrataPanelMotion {
  keyframes: { offset: number; opacity?: number; scaleX?: number; scaleY?: number; tiltX?: number; perspective?: number; x?: number; y?: number }[];
  timing: { duration: number; easing: string };
}
/**
 * The material descriptor the helper hands to `setMaterial`: `relief` for a version 1 scene, `objects` for version 2
 * and 3, `instrument` for version 4 of kind `instrument`; a version 4 scene of kind `relief` (a scene with lights) goes to
 * `relief`, or to `objects` when it has a camera.
 */
export type StrataSceneMaterial = StrataMaterialBase & ({ kind: "relief" | "objects"; scene: StrataScene | StrataLightScene } | { kind: "instrument"; scene: StrataInstrumentScene });
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
  /** At the Instrument level, glBs for named parts of the built-in components (see `StrataSceneOptions.parts`). */
  parts?: StrataSceneOptions["parts"];
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
  /** What the helper reports of a panel's Instrument scene: its material count against core's cap and the keys drawn at Relief; undefined for other panels. */
  diagnostics(panel: HTMLElement): StrataGpuDiagnostics | undefined;
  /** The scene last given to a panel, for inspection and tests. */
  scene(panel: HTMLElement): StrataScene | StrataLightScene | StrataInstrumentScene | undefined;
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
  // A rail Tabs' plinth (its tablist) is polished metal, the knob's.
  if (element.matches(".ug-tabs[data-strata-form='rail'] > .ug-tabs__list")) return "knob";
  // A push button's bezel, and a rotary selector's skirt and cap, are the knob's metal; a push button's cap takes the button's variant.
  if (element.matches(".ug-push__bezel, .ug-bank__plinth, .ug-rotary__skirt, .ug-rotary__cap")) return "knob";
  if (element.matches(".ug-push__cap")) return element.closest(".ug-button--accent, .ug-button--primary") ? "buttonPrimary" : "control";
  // A knob's skirt and cap, and a fader's carriage, are raised faces in the knob's material (a fader's slot is a
  // groove, a rail).
  if (element.matches(".ug-knob__skirt, .ug-knob__cap, .ug-fader__carriage, .ug-lamp__bezel")) return "knob";
  if (face === "raised") return element.matches(".ug-button--accent, .ug-button--primary") ? "buttonPrimary" : "control";
  // A display's bezel is the polished metal of the knob's; its window is a flat face on the field.
  if (element.matches(".ug-display__bezel")) return "knob";
  if (element.matches(".ug-display__window")) return "field";
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

/** The emitters a scene may carry (core's format: 1,024; it draws the 64 with the most reach into each layer, and reports the rest). */
const MAX_EMITTERS = 1024;
/** The outset a panel with lights draws at least, px (design language section 3). */
const EMITTER_OUTSET = 48;
/** Protected rects a scene may carry (core's format: 4,096); a panel with more protects its whole box. */
const MAX_PROTECTED = 4096;
/** A visible lens now: what the Lamp and StatusLight parts need of it. */
interface LampInfo {
  kind: LampKind;
  /** The role colour, `#rrggbb`, and how lit it is (`--strata-lit`, 0–1). */
  role: string;
  lit: number;
  /** The lens's diameter, and its place in the scene's `emitters`. */
  lens: number;
  index: number;
  /** The native control's box in the panel (a lamp's input, a StatusLight's object) and the control itself. */
  box: [number, number, number, number];
  control: HTMLElement;
  feather: number;
}

/** A visible Display now: its native element and box, and the pane's, for its Instrument object. */
interface DisplayInfo {
  native: HTMLElement;
  box: [number, number, number, number];
  pane: [number, number, number, number];
  /** Whether the finish zone may draw: no text can reach it. */
  finish: boolean;
}
/** What a scene's faces loop found for the displays of a panel, for its Instrument scene. */
const foundDisplays = new WeakMap<HTMLElement, { infos: Map<HTMLElement, DisplayInfo>; instrument: Set<HTMLElement> }>();

/** What a scene's faces loop found for the rail Tabs of a panel, for its Instrument scene: each tablist (the plinth) and each tab (a key with its LED). */
const foundTabs = new WeakMap<HTMLElement, { lists: Set<HTMLElement>; keys: Set<HTMLElement> }>();

/** A visible Meter or Gauge now: its form, its native meter and the meter's box in the panel. */
interface MeterInfo {
  form: "bar" | "needle" | "dial";
  native: HTMLMeterElement;
  box: [number, number, number, number];
}

/**
 * The layer's protected rects for the contrast guard (design language section 3, Rendering Model 2D.4): the client rects
 * of every text run in `panel`, and the boxes of its text fields, grown by 2 px (`display.textGrow`), and the whole cap of each pad. Past 4,096
 * the whole box is protected, which core also does for more than 64 rects a layer.
 */
function protectedRects(panel: HTMLElement, grow = 2): [number, number, number, number][] | "extent" {
  const outer = panel.getBoundingClientRect(), scale = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  const rects: [number, number, number, number][] = [];
  const add = (box: DOMRect) => {
    if (box.width > 0 && box.height > 0) rects.push([(box.left - outer.left) / scale - grow, (box.top - outer.top) / scale - grow, box.width / scale + 2 * grow, box.height / scale + 2 * grow]);
  };
  // A pad's cap is protected whole (its label is on it): the pad's own light would otherwise leave the label's box dark in a lit cap, a patch. The labels in
  // those caps are not listed again, so a grid of pads stays far under core's 64 rects a layer.
  const caps = [...panel.querySelectorAll<HTMLElement>(".ug-pad__cap")].filter(cap => cap.checkVisibility({ visibilityProperty: true })).map(cap => cap.getBoundingClientRect());
  const inCap = (box: DOMRect) => caps.some(cap => box.left >= cap.left - 0.5 && box.right <= cap.right + 0.5 && box.top >= cap.top - 0.5 && box.bottom <= cap.bottom + 0.5);
  for (const cap of caps) add(new DOMRect(cap.left + grow, cap.top + grow, Math.max(0, cap.width - 2 * grow), Math.max(0, cap.height - 2 * grow)));
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node && rects.length <= MAX_PROTECTED; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || parent.closest("option, script, style") || !parent.checkVisibility({ visibilityProperty: true })) continue;
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (!inCap(box)) add(box);
  }
  for (const field of panel.querySelectorAll("input:not([type='checkbox'], [type='radio'], [type='range'], [type='button'], [type='submit'], [type='reset'], [type='image'], [type='file'], [type='hidden'], [type='color'], .ug-display__text), textarea, select:not(.ug-display__text)")) {
    if (field.checkVisibility({ visibilityProperty: true })) add(field.getBoundingClientRect());
  }
  // A display's native element covers the whole display, bezel included: only its content box (the text's room, the window's inside) is
  // protected, an output's as an input's, so the window is one even colour and the bezel and the padding round it take the backlight in full.
  for (const field of panel.querySelectorAll<HTMLElement>(".ug-display__text")) {
    if (!field.checkVisibility({ visibilityProperty: true })) continue;
    const box = field.getBoundingClientRect(), style = getComputedStyle(field), edge = (name: string) => (Number.parseFloat(style.getPropertyValue(name)) || 0) * scale;
    const left = edge("border-left-width") + edge("padding-left"), right = edge("border-right-width") + edge("padding-right");
    const top = edge("border-top-width") + edge("padding-top"), bottom = edge("border-bottom-width") + edge("padding-bottom");
    add(new DOMRect(box.left + left, box.top + top, Math.max(0, box.width - left - right), Math.max(0, box.height - top - bottom)));
  }
  return rects.length > MAX_PROTECTED ? "extent" : rects;
}

/** A visible push button now: what its parts need of its ring and LED (`--strata-lit`, `--strata-led` are read for their emitters). */
interface PushInfo {
  form: "momentary" | "latching";
  /** The role colour, `#rrggbb`. */
  role: string;
  /** Whether the host is a latching form's key (a Checkbox's, a bank's: `.ug-latch`) and not a `<button>`. */
  latch: boolean;
  /** The ring's place in the scene's `emitters` (a bank key has no ring), and the LED's (latching). */
  ring?: number;
  led?: number;
}
/** The hosts of push-button parts: a push `<button>`, and the key of a latching form (a Checkbox's or a bank's). */
const pushHosts = "button.ug-push, .ug-latch";
/** What a scene's faces loop found for the push buttons and rotary selectors of a panel, for its Instrument scene. */
const found = new WeakMap<HTMLElement, { pushes: Map<HTMLElement, PushInfo>; instrumentPushes: Set<HTMLElement>; rotaries: Set<HTMLElement>; banks: Set<HTMLElement> }>();

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
  /** A bar meter's held peak, kept between scenes (`ug-meter--peak`); the meters whose peak is still falling are added to `moving`. */
  peaks?: WeakMap<Element, PeakState>;
  /**
   * At the Instrument level, glBs for named parts of the built-in components (`parts: { knobCap }`, the plan's custom slot):
   * the part is replaced by core's custom part (`docs/ui-library/instrument-phase2.md`, item 5). Absent, every component
   * looks as it always did. While the file loads (and if it fails or does not fit its box) the part is not drawn.
   */
  parts?: { knobCap?: CustomPartSource };
  /** The time the springs advance to (ms, `performance.now()` by default). */
  now?: number;
  /** How far a Dialog's plate or a Drawer's tray stands out of the chassis now, 0–1 (the panel motion's eased progress; 1 at rest). */
  rise?: number;
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
export function strataScene(panel: HTMLElement, options: StrataSceneOptions = {}): StrataScene | StrataLightScene | StrataInstrumentScene {
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
    // A plate (a Card, Panel or Dialog) and a Drawer's tray are machined: the plate role, satin without a character that has one.
    const machined = element.getAttribute("data-strata-form") === "plate" || (element.matches(".ug-drawer") && element.getAttribute("data-strata-form") === "tray");
    return material(named && panel.contains(named) ? named.getAttribute("data-strata-material")! : machined ? tokens.raw("material.roles.plate") || "satin" : tokens.raw(`material.roles.${roleOf(face, element, panel)}`) || "matte");
  };
  const states = (element: Element) => {
    // A knob's skirt and cap are its input's object: they take its hover, press and disabled state. A fader's slot and
    // carriage are its input's object too: they take its hover and disabled state (a carriage does not sink while it is
    // dragged, as hardware does not). Their focus ring is the CSS outline round the skirt or the track (captured
    // content), so the GPU adds no focus edge of its own.
    const knob = element.closest(".ug-knob__dial")?.querySelector(".ug-knob__input");
    const fader = element.closest(".ug-fader__track")?.querySelector(".ug-fader__input");
    // A lamp's bezel and lens are its input's object too (hover and disabled; a lamp does not sink when it is pressed).
    const lampRow = element.closest(".ug-lamp");
    const lamp = lampRow?.matches(".ug-lamp--momentary") ? lampRow : lampRow?.querySelector(":scope > .ug-lamp__input");
    // A rotary selector's skirt and cap are its select's object, as a knob's are its input's; a push button's bezel and cap are its button's.
    const rotary = element.closest(".ug-rotary__dial")?.querySelector(".ug-rotary__select");
    const push = element.closest("button.ug-push");
    // A latching form's key (a Checkbox's, a bank's): its parts are its native input's object.
    const latchHost = element.closest(".ug-latch"), latch = latchHost?.querySelector(":scope > input");
    const owner = knob ?? fader ?? lamp ?? rotary ?? push ?? latch;
    const control = element.matches(interactive) ? element : owner ?? element.closest("label")?.querySelector("input, select, textarea") ?? element;
    const target = control.closest("label") ?? control;
    const preview = `${element.getAttribute("data-strata-preview") ?? ""} ${control.getAttribute("data-strata-preview") ?? ""}`.split(/\s+/);
    // Only a control takes hover and press: a card, a plinth or any other surface under the pointer stays where it is.
    const isControl = control.matches(interactive);
    return {
      hover: (isControl && target.matches(":hover")) || preview.includes("hover"),
      // A toggle that is on, the current page of a Pagination, or a SegmentedControl's selected key holds its key down (design language section 6: it
      // latches at its travel).
      pressed: !fader && !lamp && (isControl && control.matches(":active:not([data-strata-down='false']), [aria-pressed='true'], [data-strata-down='true'], [aria-current]:not([aria-current='false']), .ug-segmented__input:checked, .ug-latch > input:checked")) || (!!latchHost?.matches("[data-strata-down='true']") && isControl && !control.matches(":disabled")) || preview.includes("active"),
      focus: !owner && (control.matches(":focus-visible") || preview.includes("focus")),
      disabled: control.matches(":disabled, [aria-disabled='true']"),
    };
  };
  const effective = (element: Element) => lower(strataLevel(element, options.level), options.cap ?? "scene");
  // The Instrument level, per layer (design language section 16): a panel with any element at `instrument` is drawn
  // with core's `instrument` material. Its knobs and buttons become parts; everything else stays on the face as Relief.
  const instrumentLayer = [panel, ...panel.querySelectorAll("[data-strata-level]")].some(element => effective(element) === "instrument");
  const objects = (element: Element) => !instrumentLayer && effective(element) !== "relief";
  const knobs = new Set<HTMLElement>(), faders = new Set<HTMLElement>(), switches = new Set<HTMLElement>(), instrumentMeters = new Set<HTMLElement>(), keys: HTMLElement[] = [];
  resetWave3(panel);
  // Plates and trays at the Instrument level: a Card's, Panel's or Dialog's plate, a Card's or Panel's recessed tray, a Drawer's tray.
  const plates: PlateInfo[] = [];
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
  // Lamps and LEDs (design language section 3): each visible lens is an emitter, in document order, so the lens parts' indices
  // never depend on the state. How lit it is, `--strata-lit`, is read from the lamp now (a toggle, a held button, a blink).
  const lamps = new Map<HTMLElement, LampInfo>(), emitters: LampEmitter[] = [], instrumentLamps = new Set<HTMLElement>();
  const moreContrast = typeof matchMedia === "function" && matchMedia("(prefers-contrast: more)").matches;
  // Push buttons (design language section 3): the lit ring is an emitter, and a latching button's LED another, lit by `--strata-lit` and
  // `--strata-led` now (held or latched, latched), so a press is a uniform write, not a capture. Each is also a `lamps` entry for its
  // ring, so the panel takes the lights and their outset as a lamp's does.
  const mine = { pushes: new Map<HTMLElement, PushInfo>(), instrumentPushes: new Set<HTMLElement>(), rotaries: new Set<HTMLElement>(), banks: new Set<HTMLElement>() };
  found.set(panel, mine);
  for (const root of panel.querySelectorAll<HTMLElement>(pushHosts)) {
    const cap = root.querySelector<HTMLElement>(".ug-push__cap"), led = root.querySelector<HTMLElement>(".ug-push__led"), ringElement = root.querySelector<HTMLElement>(".ug-push__ring");
    if (!cap || emitters.length >= MAX_EMITTERS - 1 || !root.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const capBox = rectWithin(cap, panel);
    if (capBox[2] <= 0 || capBox[3] <= 0) continue;
    const style = getComputedStyle(root), pushTokens = reader(root);
    const number = (name: string) => { const read = Number.parseFloat(style.getPropertyValue(name)); return Number.isFinite(read) ? Math.min(1, Math.max(0, read)) : 0; };
    const role = hex(style.getPropertyValue("--_c").trim() || "#ff9228");
    const own: PushEmitterTokens = { radius: pushTokens.number("emitter.pushButton.radius", pushEmitterDefaults.radius), height: pushTokens.number("emitter.pushButton.height", pushEmitterDefaults.height),
      strength: pushTokens.number("emitter.pushButton.strength", pushEmitterDefaults.strength) };
    const latch = root.classList.contains("ug-latch");
    const info: PushInfo = { form: latch || root.getAttribute("data-strata-form") === "latching" ? "latching" : "momentary", role, latch };
    const feather = pushTokens.number("emitter.guardFeather", emitterDefaults.guardFeather);
    // A bank key has no ring (the plinth is its frame): its LED is its only light.
    if (!latch || ringElement) {
      info.ring = emitters.length;
      lamps.set(root, { kind: "lamp", role, lit: number("--strata-lit"), lens: capBox[3], index: emitters.length, box: rectWithin(root, panel), control: root, feather });
      emitters.push(ringEmitter([capBox[0] + capBox[2] / 2, capBox[1] + capBox[3] / 2], capBox[3], moreContrast ? 0 : number("--strata-lit"), role, own));
    }
    if (info.form === "latching" && led) {
      const ledBox = rectWithin(led, panel);
      info.led = emitters.length;
      if (info.ring === undefined) lamps.set(root, { kind: "led", role, lit: number("--strata-led"), lens: ledBox[2], index: emitters.length, box: rectWithin(root, panel), control: root, feather });
      const ledTokens: EmitterTokens = { radius: pushTokens.number("emitter.led.radius", emitterDefaults.led.radius), height: pushTokens.number("emitter.led.height", emitterDefaults.led.height), strength: pushTokens.number("emitter.led.strength", emitterDefaults.led.strength) };
      emitters.push(lensEmitter("led", [ledBox[0] + ledBox[2] / 2, ledBox[1] + ledBox[3] / 2], ledBox[2], moreContrast ? 0 : number("--strata-led"), role, ledTokens));
    }
    mine.pushes.set(root, info);
  }
  for (const lens of panel.querySelectorAll<HTMLElement>(".ug-lamp__lens, .ug-status-light__lens")) {
    const lampRoot = lens.closest<HTMLElement>(".ug-lamp, .ug-status-light");
    if (!lampRoot || emitters.length >= MAX_EMITTERS || !lens.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const kind: LampKind = lampRoot.matches(".ug-lamp") ? "lamp" : "led", rect = rectWithin(lens, panel);
    // The control: a toggle lamp's input (its box is the object's), a momentary lamp's button (its box is the whole row, the object drawn in it), a StatusLight's object.
    const control = kind === "lamp" ? (lampRoot.matches(".ug-lamp--momentary") ? lampRoot : lampRoot.querySelector<HTMLElement>(":scope > .ug-lamp__input")) : lampRoot.querySelector<HTMLElement>(".ug-status-light__object");
    if (!control || rect[2] <= 0 || rect[3] <= 0) continue;
    const style = getComputedStyle(lampRoot), lampTokens = reader(lampRoot);
    const read = Number.parseFloat(style.getPropertyValue("--strata-lit")), lit = Number.isFinite(read) ? Math.min(1, Math.max(0, read)) : 0;
    const role = hex(style.getPropertyValue("--_c").trim() || "#ff9228");
    const given: EmitterTokens = emitterDefaults[kind];
    const own: EmitterTokens = { radius: lampTokens.number(`emitter.${kind}.radius`, given.radius), height: lampTokens.number(`emitter.${kind}.height`, given.height), strength: lampTokens.number(`emitter.${kind}.strength`, given.strength) };
    lamps.set(lampRoot, { kind, role, lit, lens: rect[2], index: emitters.length, box: rectWithin(kind === "lamp" ? lampRoot.querySelector<HTMLElement>(".ug-lamp__object") ?? control : control, panel), control, feather: lampTokens.number("emitter.guardFeather", emitterDefaults.guardFeather) });
    // More contrast turns emitters off (design language section 3): the lens is flat colour, and the face has no light.
    emitters.push(lensEmitter(kind, [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2], rect[2], moreContrast ? 0 : lit, role, own));
  }
  // Meters and Gauges (design language section 6): a bar's segments are LEDs, each an emitter in its zone's colour, lit from the
  // native meter's value (and its held peak) read here, so a live level is a uniform update. The needle and the scale are not lights.
  const meterInfos = new Map<HTMLElement, MeterInfo>(), segmentInfos = new Map<HTMLElement, LampInfo>(), now = options.now ?? performance.now();
  // The indicator forms' lenses (a Rating's lamps, a Badge's LED, a ProgressBar's segments, a Spinner's ring; `gpu/indicator-forms.ts`) are the
  // same LED lenses, each an emitter, lit by the `--strata-lit` the stylesheet gives it now (a hover preview, a value, a chase), so they join
  // the segments' infos and are drawn as those are; at the Instrument level the ones drawn as objects are collected as they are met.
  const instrumentIndicators = new Set<HTMLElement>();
  for (const lens of panel.querySelectorAll<HTMLElement>(INDICATOR_LENS)) {
    const place = indicatorOf(lens), rect = rectWithin(lens, panel);
    if (!place || emitters.length >= MAX_EMITTERS || rect[2] <= 0 || rect[3] <= 0 || !lens.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const whole = rectWithin(place.box, panel), box = place.tight ? roomAround(rect, whole) : whole;
    if (box[2] <= 0 || box[3] <= 0) continue;
    const style = getComputedStyle(lens), lensTokens = reader(lens), read = Number.parseFloat(style.getPropertyValue("--strata-lit"));
    const lit = Number.isFinite(read) ? Math.min(1, Math.max(0, read)) : 0, role = hex(style.getPropertyValue("--_c").trim() || "#ff9228");
    const given: EmitterTokens = place.emitter === "segment" ? segmentEmitterDefaults : emitterDefaults[place.emitter];
    const own: EmitterTokens = { radius: lensTokens.number(`emitter.${place.emitter}.radius`, given.radius), height: lensTokens.number(`emitter.${place.emitter}.height`, given.height), strength: lensTokens.number(`emitter.${place.emitter}.strength`, given.strength) };
    // A disabled control keeps its lit lenses, dimmed, so what it is set to is still said; more contrast turns the light off.
    const dim = place.control.matches(":disabled") ? DISABLED_LIGHT : 1;
    segmentInfos.set(lens, { kind: "led", role, lit, lens: rect[2], index: emitters.length, box, control: place.control, feather: lensTokens.number("emitter.guardFeather", emitterDefaults.guardFeather) });
    emitters.push(lensEmitter(place.emitter === "lamp" ? "lamp" : "led", [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2], rect[2], moreContrast ? 0 : lit * dim, role, own));
  }
  for (const root of panel.querySelectorAll<HTMLElement>(".ug-meter")) {
    const native = root.querySelector<HTMLMeterElement>("meter.ug-meter__native");
    if (!native || !root.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const box = rectWithin(native, panel), form = root.matches(".ug-meter--bar") ? "bar" : root.matches(".ug-meter--dial") ? "dial" : "needle";
    if (box[2] <= 0 || box[3] <= 0) continue;
    meterInfos.set(root, { form, native, box });
    if (form !== "bar") continue;
    const segments = [...root.querySelectorAll<HTMLElement>(".ug-meter__segment")], meterTokens = reader(root);
    const fraction = meterFraction(liveStrataMeter(native) ?? native.value, native), count = segments.length;
    // The held peak: the highest segment lit, kept between scenes and let fall on `meter.peakHold` and `meter.peakDecay`.
    let held = -1;
    if (root.matches(".ug-meter--peak") && options.peaks) {
      const hold = milliseconds(meterTokens.raw("meter.peakHold")), next = advancePeak(options.peaks.get(native), fraction, now,
        { hold: Number.isFinite(hold) ? hold : peakDefaults.hold, decay: meterTokens.number("meter.peakDecay", peakDefaults.decay) });
      options.peaks.set(native, next.state);
      if (next.falling) options.moving?.add(native);
      held = peakIndex(next.value, count);
    }
    const lit = segmentsLit(fraction, count), zones = segmentZones(count, native), feather = meterTokens.number("emitter.guardFeather", emitterDefaults.guardFeather);
    const own: EmitterTokens = { radius: meterTokens.number("emitter.segment.radius", segmentEmitterDefaults.radius), height: meterTokens.number("emitter.segment.height", segmentEmitterDefaults.height),
      strength: meterTokens.number("emitter.segment.strength", segmentEmitterDefaults.strength) };
    segments.forEach((segment, index) => {
      const rect = rectWithin(segment, panel);
      if (emitters.length >= MAX_EMITTERS || rect[2] <= 0 || rect[3] <= 0 || !segment.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
      const role = meterTokens.colour(meterZoneRoles[zones[index]!]), on = index < lit || index === held ? 1 : 0;
      segmentInfos.set(segment, { kind: "led", role, lit: on, lens: rect[2], index: emitters.length, box, control: native, feather });
      emitters.push(lensEmitter("led", [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2], rect[2], moreContrast ? 0 : on, role, own));
    });
  }
  // Pads (design language section 3): a lit pad is an emitter over its cap, lit by `--strata-lit` now (held or latched); the pads' and keypads' parts are `pad-keypad.ts`'s.
  collectPads(panel, { emitters, lamps, max: MAX_EMITTERS, moreContrast, guardFeather: emitterDefaults.guardFeather, helpers: { hex, reader, rectWithin, radiusOf } });
  // Displays (design language section 3): the backlight is a few emitters along the window, lit by `--strata-lit` as the CSS has it now (on,
  // off, disabled), so a toggle is a uniform write. Each is also a `lamps` entry, so the panel takes the lights and their outset as a lamp's does.
  const mineDisplays = { infos: new Map<HTMLElement, DisplayInfo>(), instrument: new Set<HTMLElement>() };
  foundDisplays.set(panel, mineDisplays);
  const mineTabs = { lists: new Set<HTMLElement>(), keys: new Set<HTMLElement>() };
  foundTabs.set(panel, mineTabs);
  for (const root of panel.querySelectorAll<HTMLElement>(".ug-display")) {
    const native = root.querySelector<HTMLElement>(".ug-display__text"), pane = root.querySelector<HTMLElement>(".ug-display__window");
    if (!native || !pane || !root.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const box = rectWithin(native, panel), paneBox = rectWithin(pane, panel);
    if (box[2] <= 0 || box[3] <= 0 || paneBox[2] <= 0 || paneBox[3] <= 0) continue;
    const style = getComputedStyle(root), displayTokens = reader(root), read = Number.parseFloat(style.getPropertyValue("--strata-lit"));
    const lit = Number.isFinite(read) ? Math.min(1, Math.max(0, read)) : 0, role = hex(style.getPropertyValue("--_c").trim() || "#ff9228");
    const own: DisplayEmitterTokens = { radius: displayTokens.number("emitter.display.radius", displayEmitterDefaults.radius), height: displayTokens.number("emitter.display.height", displayEmitterDefaults.height),
      strength: displayTokens.number("emitter.display.strength", displayEmitterDefaults.strength) };
    const lights = displayEmitters(paneBox, moreContrast ? 0 : lit, role, own);
    if (emitters.length + lights.length > MAX_EMITTERS) continue;
    lamps.set(root, { kind: "led", role, lit, lens: paneBox[3], index: emitters.length, box, control: native, feather: displayTokens.number("emitter.guardFeather", emitterDefaults.guardFeather) });
    emitters.push(...lights);
    // The finish zone is for a window no text can reach: an input's text can be anywhere in its content box, an output's is its first run.
    let textTop = 0;
    if (!(native instanceof HTMLInputElement || native instanceof HTMLSelectElement)) {
      const range = document.createRange();
      range.selectNodeContents(native);
      const [run] = range.getClientRects(), scale = panel.getBoundingClientRect().width / Math.max(panel.offsetWidth, 1) || 1;
      textTop = run ? (run.top - panel.getBoundingClientRect().top) / scale - paneBox[1] : Number.POSITIVE_INFINITY;
    }
    mineDisplays.infos.set(root, { native, box, pane: paneBox, finish: finishAllowed(paneBox[3], textTop) });
  }
  if (objects(panel)) {
    entries.push({ object: "slab", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: panelHeight, taper, material: materialFor(panel, "raised") });
    tops.set(panel, panelHeight);
  } else entries.push({ face: "raised", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: panelHeight, material: materialFor(panel, "raised") });
  // The panel itself, when it is a plate (a Panel, a Dialog) or a Drawer's tray: its rim or walls stand inside its box.
  const panelForm = panel.getAttribute("data-strata-form");
  if (instrumentLayer && effective(panel) !== "relief") {
    if (panelForm === "plate") plates.push({ element: panel, form: "plate", rises: panel.matches(".ug-dialog") });
    else if (panelForm === "tray" && panel.matches(".ug-drawer")) plates.push({ element: panel, form: "tray", rises: true, open: drawerEdge(panel) });
  }
  for (const element of panel.querySelectorAll<HTMLElement>("[data-strata-face]")) {
    if (entries.length >= 254) break;
    const face = element.getAttribute("data-strata-face") as SceneFace;
    // The slide's flag is invisible (opacity 0) while the switch is off, but the object draws it: hide its CSS paint all the same.
    if (instrumentLayer && element.matches(".ug-switch[data-strata-form] .ug-switch__object .ug-switch__flag") && effective(element) !== "relief") options.domes?.add(element);
    if (!faces.includes(face) || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    // A JogWheel's and a PatchPoint's parts (`gpu/wave3.ts`): scene entries at Relief and Objects, the Instrument object's claims otherwise.
    if (element.closest(".ug-jog-wheel, .ug-patch-point")) {
      const parts = wave3Entries(element, panel, { instrument: instrumentLayer && effective(element) !== "relief", objects: objects(element), base: baseOf(element), rect: rectWithin(element, panel),
        rectOf: part => rectWithin(part, panel), states, material: materialFor, knob: { material: material(tokens.raw("material.roles.knob") || "satin"), colour: tokens.colour("knob") },
        well: level(element, "well"), light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, hoverHeight: tokens.number("state.hoverHeight", 1.6), domes: options.domes,
        follow: { now: options.now ?? performance.now(), instant: reducedMotion(), springs: options.springs, moving: options.moving } });
      if (parts) { entries.push(...parts); continue; }
    }
    // A Card's plate, and a Card's or Panel's tray (its body, or the wrapper after its title): the face is drawn as ever, with the rim or the wall of parts on it.
    if (instrumentLayer && effective(element) !== "relief") {
      if (element.matches(".ug-card") && element.getAttribute("data-strata-form") === "plate") plates.push({ element, form: "plate", rises: false });
      else if (element.matches(".ug-card__body, .ug-panel__tray") && face === "well") plates.push({ element, form: "tray", rises: false });
    }
    // A Display's bezel is drawn as its Instrument object's polished part, with the glass pane over its window (the window stays a flat face).
    const displayRoot = element.matches(".ug-display__bezel, .ug-display__window") ? element.closest<HTMLElement>(".ug-display") : null;
    if (displayRoot && mineDisplays.infos.has(displayRoot) && instrumentLayer && effective(element) !== "relief") {
      mineDisplays.instrument.add(displayRoot);
      if (element.matches(".ug-display__bezel")) { options.domes?.add(element); continue; }
    }
    // A rail Tabs (`tabs-forms.ts`, `instrument-tabs.ts`): the tablist is a plinth, each tab's cap a key on it and its LED a lens on it. At the Instrument
    // level they are the rail's objects (the cap's CSS paint stays: the capture of it is the key's cap); below it the cap is drawn just after.
    const railTab = element.closest<HTMLElement>(".ug-tabs[data-strata-form='rail'] .ug-tab");
    if (instrumentLayer && effective(element) !== "relief") {
      if (element.matches(".ug-tabs[data-strata-form='rail'] > .ug-tabs__list")) { mineTabs.lists.add(element); options.domes?.add(element); continue; }
      if (railTab && element.matches(".ug-tab__cap")) { mineTabs.keys.add(railTab); options.domes?.add(railTab); continue; }
      if (railTab && element.matches(".ug-tab__led") && segmentInfos.has(element)) { mineTabs.keys.add(railTab); options.domes?.add(element); continue; }
    }
    // A Meter's or Gauge's segments, hub and a Gauge's bezel are drawn as its Instrument object (its window stays the well of the face).
    const meterRoot = element.closest<HTMLElement>(".ug-meter"), meter = meterRoot && meterInfos.get(meterRoot);
    if (meterRoot && meter && instrumentLayer && effective(element) !== "relief") {
      if (segmentInfos.has(element) || element.matches(".ug-meter__hub") || (element.matches(".ug-meter__bezel") && meter.form === "dial")) { instrumentMeters.add(meterRoot); options.domes?.add(element); options.domes?.add(meterRoot); continue; }
      if (element.matches(".ug-meter__window")) { instrumentMeters.add(meterRoot); options.domes?.add(meterRoot); }
    }
    if (instrumentLayer && effective(element) !== "relief") {
      // A knob's skirt and cap, and a fader's carriage, are drawn as its Instrument object (a fader's slot stays a
      // groove on the face); a button as a key with a captured cap.
      const knob = element.matches(".ug-knob__skirt, .ug-knob__cap") ? element.closest<HTMLElement>(".ug-knob") : null;
      if (knob) { knobs.add(knob); continue; }
      // A rotary selector's skirt and cap are the knob's parts (its printed labels stay on the face); a push button's bezel and cap are its object's.
      const rotary = element.matches(".ug-rotary__skirt, .ug-rotary__cap") ? element.closest<HTMLElement>(".ug-rotary") : null;
      if (rotary) { mine.rotaries.add(rotary); continue; }
      const push = element.matches(".ug-push__bezel, .ug-push__cap") ? element.closest<HTMLElement>(pushHosts) : null;
      if (push && mine.pushes.has(push)) { mine.instrumentPushes.add(push); continue; }
      // A bank's plinth is its own object (one polished part the keys stand on); the group keeps its room round it.
      if (element.matches(".ug-bank__plinth")) { mine.banks.add(element); options.domes?.add(element); continue; }
      const fader = element.matches(".ug-fader__carriage") ? element.closest<HTMLElement>(".ug-fader") : null;
      if (fader) { faders.add(fader); continue; }
      // A Switch form's parts, the slot apart (a groove on the face), are drawn as its Instrument object; the CSS paint of
      // the ones it draws is hidden while it does.
      const form = element.closest<HTMLElement>(".ug-switch[data-strata-form]");
      if (form && element.closest(".ug-switch__object") && !element.matches(".ug-switch__slot")) { switches.add(form); options.domes?.add(element); continue; }
      // A lamp's or LED's bezel and lens are drawn as its Instrument object (the socket under the lens stays printed on the face).
      const lampRoot = element.matches(".ug-lamp__bezel, .ug-lamp__lens, .ug-status-light__lens") ? element.closest<HTMLElement>(".ug-lamp, .ug-status-light") : null;
      if (lampRoot && lamps.has(lampRoot)) { instrumentLamps.add(lampRoot); options.domes?.add(element); continue; }
      // An indicator form's lens (a Rating's lamp, a Badge's LED, a bar's segment, a ring's LED) is an LED object of its own.
      if (element.matches(INDICATOR_LENS) && segmentInfos.has(element)) { instrumentIndicators.add(element); options.domes?.add(element); continue; }
      // A pad's or a keypad key's cap and a keypad's plinth are drawn as their Instrument objects (`pad-keypad.ts`).
      if (claimPadKeypad(element, panel, options.domes)) continue;
      if (face === "raised" && element.matches("button")) { keys.push(element); continue; }
    }
    let rect = rectWithin(element, panel);
    if (rect[2] <= 0 || rect[3] <= 0) continue;
    const state = states(element);
    const radius = radiusOf(element, rect[2]);
    // A Pad's or a Keypad's cap, and a keypad's plinth (`pad-forms.ts`): inside the control's box, shadows included.
    const padParts = padKeypadEntries(element, panel, { objects: objects(element), base: baseOf(element), rect, helpers: { hex, reader, rectWithin, radiusOf }, material: materialFor, knob: material(tokens.raw("material.roles.knob") || "satin"),
      light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, hoverHeight: tokens.number("state.hoverHeight", 1.6), keyTravel });
    if (padParts) {
      entries.push(...padParts);
      // A keypad's plinth is a slab the keys stand on.
      const slab = padParts[0];
      if (element.matches(".ug-keypad__plinth") && slab && isSceneObject(slab) && slab.object === "slab") tops.set(element, (slab.base ?? 0) + slab.height);
      continue;
    }
    // A Switch's hardware form (`switch-forms.ts`): its parts, inside the input's box, shadows included.
    const form = switchFormEntries(element, { rect, radius, state, objects: objects(element), base: baseOf(element), rectOf: part => rectWithin(part, panel), material: materialFor, well: level(element, "well"),
      knob: { material: material(tokens.raw("material.roles.knob") || "satin"), colour: tokens.colour("knob") }, hoverHeight: tokens.number("state.hoverHeight", 1.6),
      light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, domes: options.domes });
    if (form) { entries.push(...form); continue; }
    // A push button's bezel and cap (`push-forms.ts`): inside the button's box, shadows included.
    const isPlinth = element.matches(".ug-bank__plinth");
    const pushRoot = isPlinth ? element.closest<HTMLElement>("fieldset") : element.matches(".ug-push__bezel, .ug-push__cap") ? element.closest<HTMLElement>(pushHosts) : null;
    if (pushRoot) {
      const bezelElement = pushRoot.querySelector(".ug-push__bezel");
      const parts = pushFormEntries(element, { rect, state, objects: objects(element), base: baseOf(element), box: rectWithin(pushRoot, panel), ...(isPlinth || pushRoot.classList.contains("ug-latch") ? { radius } : {}),
        bezel: bezelElement ? rectWithin(bezelElement, panel) : pushRoot.matches("button") ? rectWithin(pushRoot, panel) : undefined,
        material: materialFor, light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, hoverHeight: tokens.number("state.hoverHeight", 1.6), keyTravel });
      if (parts) {
        entries.push(...parts);
        // A bank's plinth is a slab the keys stand on.
        const slab = parts[0];
        if (isPlinth && slab && isSceneObject(slab) && slab.object === "slab") tops.set(element, (slab.base ?? 0) + slab.height);
        continue;
      }
    }
    // A Lamp's or StatusLight's bezel and lens (`lamp-forms.ts`): inside the control's box, shadows included.
    const lampRoot = element.matches(".ug-lamp__bezel, .ug-lamp__lens, .ug-status-light__lens") ? element.closest<HTMLElement>(".ug-lamp, .ug-status-light") : null;
    const lamp = lampRoot && lamps.get(lampRoot);
    if (lamp) {
      const parts = lampFormEntries(element, { rect, state, objects: objects(element), base: baseOf(element), box: lamp.box, role: lamp.role, lit: lamp.lit, domes: options.domes,
        material: (part, role, partFace) => {
          const named = part.closest("[data-strata-material]");
          if (named && panel.contains(named)) return material(named.getAttribute("data-strata-material")!);
          return role === "bezel" ? materialFor(part, partFace) : material(tokens.raw(`material.roles.${role}`) || (role === "lens" ? "glass" : "emissive"));
        },
        light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, hoverHeight: tokens.number("state.hoverHeight", 1.6) });
      if (parts) { entries.push(...parts); continue; }
    }
    // A Meter's segment is an LED lens (`lamp-forms.ts`), sunk in its window's well at the Objects level; its window and bezel are
    // `meter-forms.ts`'s, fitted so their shadows stay in the native meter's box.
    const segment = segmentInfos.get(element as HTMLElement);
    if (segment) {
      // The segments are drawn from the native meter's value at every level, so a live value needs no write to the DOM (`driveStrataMeter`).
      if (meterRoot) options.domes?.add(meterRoot);
      const floor = baseOf(element) - (objects(element) && meterRoot ? Math.max(1, level(element.closest(".ug-meter__window") ?? element, "well")) : 0);
      const parts = lampFormEntries(element, { rect, state, objects: objects(element), base: floor, box: segment.box, role: segment.role, lit: segment.lit, domes: options.domes,
        material: (part, role, partFace) => {
          const named = part.closest("[data-strata-material]");
          if (named && panel.contains(named)) return material(named.getAttribute("data-strata-material")!);
          return role === "bezel" ? materialFor(part, partFace) : material(tokens.raw(`material.roles.${role}`) || (role === "lens" ? "glass" : "emissive"));
        },
        light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, hoverHeight: tokens.number("state.hoverHeight", 1.6) });
      if (parts) { entries.push(...parts); continue; }
    }
    const meterBox = meter?.box;
    const meterParts = meterBox && meterFormEntries(element, { rect, radius, objects: objects(element), base: baseOf(element), box: meterBox, well: level(element, "well"), raised: level(element, "raised"), taper,
      material: materialFor, light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) } });
    if (meterParts) {
      entries.push(...meterParts);
      const slab = meterParts[0];
      if (slab && isSceneObject(slab) && slab.object === "slab") tops.set(element, (slab.base ?? 0) + slab.height);
      continue;
    }
    // A rail tab's cap (`tabs-forms.ts`): a raised face or a key on the plinth, inside the tab's box, its shadow included.
    if (railTab && element.matches(".ug-tab__cap")) {
      const parts = tabFormEntries(element, { rect, radius, tab: railTab, box: rectWithin(railTab, panel), objects: objects(element), base: baseOf(element), material: materialFor,
        light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) }, hoverHeight: tokens.number("state.hoverHeight", 1.6), keyTravel });
      if (parts) { entries.push(...parts); continue; }
    }
    // A Display's bezel and window (`display-forms.ts`): inside the native element's box, shadows included.
    const display = displayRoot && mineDisplays.infos.get(displayRoot);
    if (display) {
      const parts = displayFormEntries(element, { rect, radius, objects: objects(element), base: baseOf(element), box: display.box, well: level(element, "well"), raised: level(element, "raised"), taper,
        disabled: display.native.matches(":disabled, [aria-disabled='true']"), material: materialFor, light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) } });
      if (parts) {
        entries.push(...parts);
        const slab = parts[0];
        if (slab && isSceneObject(slab) && slab.object === "slab") tops.set(element, (slab.base ?? 0) + slab.height);
        continue;
      }
    }
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
  const shadowReach = Math.min(128, Math.ceil(tallest / Math.tan(elevation) + 1.5 * tallest + 1));
  // A panel with lights draws at least the emitters' outset (48 px), so a lamp near its edge lights the page past it.
  const reach = emitters.length ? Math.max(shadowReach, EMITTER_OUTSET) : shadowReach;
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
  // The lights of the panel's lenses, with the text they must not wash out (the guard, design language section 3).
  const lights = emitters.length ? { emitters, protected: protectedRects(panel), feather: Math.max(...[...lamps.values(), ...segmentInfos.values()].map(info => info.feather)) } : undefined;
  if (instrumentLayer) return instrumentScene(panel, options, { settings, entries: entries as ScenePrimitive[], knobs, faders, switches, keys, plates, states, materialFor, tokens, reach, lamps, instrumentLamps, lights, instrumentMeters, meterInfos, segmentInfos, instrumentIndicators });
  if (!entries.some(isSceneObject)) return lights ? { format: "strata-scene", version: 4, ...settings, primitives: entries as ScenePrimitive[], ...lights } : { format: "strata-scene", version: 1, ...settings, primitives: entries };
  // The camera (design language section 2): centred on the stage, at D = max(camera.distance, r · h / taper + h),
  // with r the stage's half-diagonal, so every solid keeps the taper rule wherever its panel sits.
  const outer = panel.getBoundingClientRect(), stage = (options.stage ?? panel.parentElement ?? panel).getBoundingClientRect();
  const scale = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  const steepest = Math.max(0, ...entries.filter(isSceneObject).filter(entry => entry.taper).map(entry => entry.height / entry.taper!));
  const highest = Math.max(0, ...entries.map(top));
  const distance = Math.max(tokens.number("camera.distance", 1600), Math.ceil(Math.hypot(stage.width, stage.height) / 2 / scale * steepest + highest + 1));
  return {
    format: "strata-scene", version: lights ? 4 : options.environment ? 3 : 2, ...(options.environment ? { environment: options.environment } : {}),
    camera: { distance, vanish: [(stage.left + stage.width / 2 - outer.left) / scale, (stage.top + stage.height / 2 - outer.top) / scale] },
    ...settings, primitives: entries, ...lights,
  } as StrataScene | StrataLightScene;
}

/**
 * A version 4 scene of kind `relief` (Rendering Model 2D.1 and 2D.4), as the helper writes it for a panel with lights at
 * the Relief level (no camera) or the Objects level (a camera): the version 1 or 2 scene's fields, with the lights of its
 * lamps and LEDs (`emitters`), the text they must not wash out (`protected`) and the guard's `feather`.
 */
export interface StrataLightScene extends Omit<StrataScene, "version"> {
  version: 4;
  emitters: LampEmitter[];
  protected: [number, number, number, number][] | "extent";
  feather: number;
}

/** The report of the Instrument scene `strataScene` built last (read synchronously by the caller). */
let instrumentReport: StrataGpuDiagnostics | undefined;

/**
 * A version 4 scene for core's `instrument` material (Rendering Model part 2D), as the helper writes it: the face's
 * relief primitives, and the knobs, keys, switches, lamps and LEDs as objects of parts, with the lights of the lenses.
 */
export interface StrataInstrumentScene extends Omit<StrataScene, "version" | "primitives" | "materials" | "environment" | "light"> {
  version: 4;
  kind: "instrument";
  camera: { distance: number; vanish: [number, number] };
  environment: { source: "studio"; strength: number; studio?: Partial<StudioTokens> };
  light: { azimuth: number; elevation: number; intensity: number };
  materials: Record<string, InstrumentRecipe>;
  primitives: ScenePrimitive[];
  profiles: Record<string, InstrumentProfile>;
  objects: InstrumentObject[];
  /** Present when the panel has a lens: its lights, the text they must not wash out, and the guard's feather. */
  emitters?: LampEmitter[];
  protected?: [number, number, number, number][] | "extent";
  feather?: number;
}

/** Whether a version 4 scene is for the `instrument` material (a lights-only scene is of kind `relief`). */
export const isInstrumentScene = (scene: { version: number; kind?: string }): scene is StrataInstrumentScene => scene.version === 4 && scene.kind === "instrument";
/** The material kind a scene goes to: `relief`, `objects` (a scene with a camera) or `instrument`. */
function materialKind(scene: StrataScene | StrataLightScene | StrataInstrumentScene): "relief" | "objects" | "instrument" {
  if (isInstrumentScene(scene)) return "instrument";
  return scene.version === 1 || (scene.version === 4 && !scene.camera) ? "relief" : "objects";
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The Instrument scene of a panel (design language section 16, `gpu/instrument.ts`): the face as the Relief level
 * draws it (its primitives), each knob at the Instrument level as the premium knob, its pointer turned by its spring,
 * each fader's carriage as the premium fader's, slid by its spring, and each button at the Objects level or above as a
 * key with a captured cap. Everything else stays a Relief primitive.
 */
function instrumentScene(panel: HTMLElement, options: StrataSceneOptions, context: {
  settings: Omit<StrataScene, "format" | "version" | "primitives">; entries: ScenePrimitive[]; knobs: Set<HTMLElement>; faders: Set<HTMLElement>; switches: Set<HTMLElement>; keys: HTMLElement[]; plates: PlateInfo[];
  /** The lamps and StatusLights at the Instrument level, every visible lens's info, and the panel's lights. */
  instrumentLamps: Set<HTMLElement>; lamps: Map<HTMLElement, LampInfo>; lights?: { emitters: LampEmitter[]; protected: [number, number, number, number][] | "extent"; feather: number };
  /** The Meters and Gauges at the Instrument level, every visible meter's info and every visible segment's. */
  instrumentMeters: Set<HTMLElement>; meterInfos: Map<HTMLElement, MeterInfo>; segmentInfos: Map<HTMLElement, LampInfo>;
  /** The indicator forms' lenses drawn as objects (their infos are in `segmentInfos`). */
  instrumentIndicators: Set<HTMLElement>;
  states: (element: Element) => { hover: boolean; pressed: boolean; focus: boolean; disabled: boolean };
  materialFor: (element: Element, face: SceneFace) => string; tokens: ReturnType<typeof reader>; reach: number;
}): StrataInstrumentScene {
  const { settings, entries, tokens } = context;
  // Every key-like object registers its body here (`gpu/instrument-keys.ts`), so the scene can trim it to fit core's cap.
  const keyCaps = createKeyRegistry();
  instrumentReport = keyCaps.report;
  const materials: Record<string, InstrumentRecipe> = {};
  for (const [name, layers] of Object.entries(settings.materials)) {
    materials[name] = { base: { roughness: layers.base?.roughness ?? 1, metallic: layers.base?.metallic ?? 0 }, coat: { ...layers.coat }, emissive: { strength: layers.emissive?.strength ?? 0 } };
  }
  const profiles: Record<string, InstrumentProfile> = {};
  const profile = (name: string, shape: InstrumentProfile) => {
    const key = profileKey(name, shape);
    profiles[key] ??= shape;
    return key;
  };
  // A character on the page (`data-strata-character`) names the part materials; without one the premium tables stand.
  const character = characterMaterials(path => tokens.raw(path), tokens.colour("glowOn"));
  const springOf = (name: string, fallback: { stiffness: number; damping: number }) =>
    ({ stiffness: tokens.number(`spring.${name}.stiffness`, fallback.stiffness), damping: tokens.number(`spring.${name}.damping`, fallback.damping) });
  const use = (name: string) => { materials[name] ??= character?.[name] ?? premiumMaterials[name] ?? faderMaterials[name as keyof typeof faderMaterials] ?? switchMaterials[name as keyof typeof switchMaterials] ?? meterMaterials[name as keyof typeof meterMaterials] ?? plateMaterials[name as keyof typeof plateMaterials]; return name; };
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
  const follow = (input: HTMLInputElement | HTMLMeterElement, constants: { stiffness: number; damping: number }, live?: number) => {
    const min = Number.parseFloat(String(input.min)) || 0, max = Number.isFinite(Number.parseFloat(String(input.max))) ? Number.parseFloat(String(input.max)) : 100;
    const target = max > min ? Math.min(1, Math.max(0, ((live ?? Number(input.value)) - min) / (max - min))) : 0;
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
    const t = follow(input, root.matches(".ug-knob--detented") ? springOf("detent", knobSprings.detent) : springOf("knob", knobSprings.knob));
    const state = context.states(skirt);
    const sweep = reader(root).number("knob.sweep", 270);
    objects.push(knobObject({ id: idOf(input, "knob"), box: rectWithin(input, panel), skirt: halfPx(rectWithin(skirt, panel)[2]), cap: halfPx(rectWithin(cap, panel)[2]), t, sweep, scale,
      state: { hover: state.hover, disabled: state.disabled }, relief: { height: raised, material: use("knobCap") },
      ...(tokens.raw("knob.pointer.width") ? { pointerWidth: tokens.number("knob.pointer.width", 2.2) } : {}),
      ...(options.parts?.knobCap ? { customCap: options.parts.knobCap } : {}) }, profile));
    for (const name of ["knobSkirt", "knobChamfer", "knobInk"]) use(name);
    options.domes?.add(skirt); options.domes?.add(cap);
    tallest = Math.max(tallest, options.parts?.knobCap ? 2.5 * scale + options.parts.knobCap.bounds.high[2] + 1 : (2.5 + 16 + 1.2) * scale);
  }
  const light = { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) };
  for (const root of context.faders) {
    const input = root.querySelector<HTMLInputElement>(".ug-fader__input"), slot = root.querySelector(".ug-fader__slot"), carriage = root.querySelector(".ug-fader__carriage");
    if (!input || !slot || !carriage || objects.length + entries.length >= 255) continue;
    // The carriage slides with the value on `spring.fader`; the slot stays a groove and the scale captured on the face.
    const t = follow(input, springOf("fader", faderSpring));
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
  for (const root of context.switches) {
    const input = root.querySelector<HTMLInputElement>(":scope > .ug-switch__input"), part = root.querySelector(".ug-switch__block, .ug-switch__bezel, .ug-switch__plate, .ug-switch__nut");
    if (!input || !part || objects.length + entries.length >= 255) continue;
    const box = rectWithin(input, panel), form = root.getAttribute("data-strata-form") as StrataSwitchForm;
    if (box[2] <= 0 || box[3] <= 0) continue;
    // The throw's position as the CSS transition has it this frame (`--strata-switch-t`, on the form's spring), the same
    // number the Relief and Objects levels follow; the checked state where the stylesheet is absent.
    const read = Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-switch-t"));
    const t = Math.min(1, Math.max(0, Number.isFinite(read) ? read : input.checked ? 1 : 0)), state = context.states(part);
    // The wall plate is gunmetal on a dark faceplate.
    const [red = 1, green = 1, blue = 1] = [1, 3, 5].map(at => Number.parseInt(tokens.colour("panel").slice(at, at + 2), 16) / 255);
    const object = switchObject({ id: idOf(input, "switch"), form, box, t, checked: input.checked, scale, light, dark: 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.4,
      state: { hover: state.hover, disabled: state.disabled }, relief: { rect: rectWithin(part, panel), height: raised, material: use("switchCap") } }, profile);
    objects.push(object as unknown as InstrumentObject);
    for (const switchPart of object.parts) use(switchPart.material);
    tallest = Math.max(tallest, switchHeight(form, scale));
  }
  // Lamps and LEDs: a polished bezel and a glass lens whose emitter (index `info.index`) is lit by `--strata-lit`, read this
  // frame. The parts never depend on the state, so a toggle or a blink changes the emitter alone: no rebuild, no capture.
  const opaque = typeof matchMedia === "function" && matchMedia("(prefers-reduced-transparency: reduce)").matches;
  for (const root of context.instrumentLamps) {
    const info = context.lamps.get(root), part = root.querySelector(".ug-lamp__bezel, .ug-status-light__lens");
    if (!info || !part || objects.length + entries.length >= 255 || info.box[2] <= 0 || info.box[3] <= 0) continue;
    const state = context.states(part), bezel = root.querySelector(".ug-lamp__bezel") ?? root.querySelector(".ug-status-light__lens")!;
    const input = { id: idOf(info.control.id ? info.control : root, info.kind), kind: info.kind, box: info.box, lens: info.lens, scale, role: info.role, emitter: info.index, opaque,
      state: { hover: state.hover, disabled: state.disabled }, light, relief: { rect: rectWithin(bezel, panel), height: raised } };
    objects.push(lampObject(input, profile) as unknown as InstrumentObject);
    Object.assign(materials, lampMaterialsOf(input));
    tallest = Math.max(tallest, lampHeight(info.kind, info.lens, scale));
  }
  // The indicator forms' lenses: a glass LED lens each, its emitter (index `info.index`) lit by the `--strata-lit` read this frame, so a chase, a
  // hover preview or a value changes the emitter alone: no rebuild, no capture.
  for (const lens of context.instrumentIndicators) {
    const info = context.segmentInfos.get(lens);
    if (!info || objects.length + entries.length >= 255 || info.box[2] <= 0 || info.box[3] <= 0) continue;
    const state = context.states(lens), place = rectWithin(lens, panel);
    const input = { id: idOf(info.control.id ? info.control : lens, "led"), kind: "led" as const, box: info.box, lens: info.lens, centre: [place[0] + place[2] / 2, place[1] + place[3] / 2] as [number, number], scale, role: info.role, emitter: info.index, opaque,
      state: { hover: state.hover, disabled: state.disabled }, light, relief: { rect: place, height: raised } };
    objects.push(lampObject(input, profile) as unknown as InstrumentObject);
    Object.assign(materials, lampMaterialsOf(input));
    tallest = Math.max(tallest, lampHeight("led", info.lens, scale));
  }
  // Meters and Gauges: a bar is a glass window and an LED lens per segment (lit by its emitter, so the parts never depend on the
  // value); a needle meter or gauge is a window, a needle turned by its value's place on its spring, and its hub (a gauge: a bezel).
  for (const root of context.instrumentMeters) {
    const info = context.meterInfos.get(root), windowElement = root.querySelector<HTMLElement>(".ug-meter__window");
    if (!info || !windowElement || objects.length + entries.length >= 255) continue;
    const pane = rectWithin(windowElement, panel), paneRadius = radiusOf(windowElement, pane[2]);
    if (pane[2] <= 0 || pane[3] <= 0) continue;
    const id = idOf(info.native.id ? info.native : root, "meter");
    if (info.form === "bar") {
      const segments = [...root.querySelectorAll<HTMLElement>(".ug-meter__segment")].flatMap(element => {
        const segment = context.segmentInfos.get(element), emitter = segment && context.lights?.emitters[segment.index];
        return segment && emitter ? [{ centre: [emitter.position[0], emitter.position[1]] as [number, number], lens: segment.lens, emitter: segment.index,
          material: opaque ? lensMaterial({ role: segment.role, opaque }) : "meterGlass", role: segment.role }] : [];
      });
      if (!segments.length) continue;
      // The glass pane covers the printed scale under the LEDs (its text is exact), not the LEDs: core's glass parts do not write depth,
      // so a pane over an opaque capture would hide the lenses and the light of the lit ones.
      const scaleElement = root.querySelector<HTMLElement>(".ug-meter__scale"), strip = scaleElement && rectWithin(scaleElement, panel);
      const glass: [number, number, number, number] = strip ? [pane[0] + 4, strip[1] - 2, pane[2] - 8, pane[1] + pane[3] - 4 - (strip[1] - 2)] : pane;
      objects.push(meterBarObject({ id, box: info.box, window: glass, windowRadius: strip ? 4 : paneRadius, scale, segments, opaque, relief: { height: raised, material: use("meterGlass") } }, profile) as unknown as InstrumentObject);
      use("meterGlass");
      for (const segment of segments) if (opaque) Object.assign(materials, lampMaterialsOf({ kind: "led", role: segment.role, opaque }));
      tallest = Math.max(tallest, meterHeight("bar", segments[0]!.lens, scale));
    } else {
      const needle = root.querySelector<HTMLElement>(".ug-meter__needle"), hub = root.querySelector<HTMLElement>(".ug-meter__hub"), bezel = root.querySelector<HTMLElement>(".ug-meter__bezel");
      if (!needle || !hub) continue;
      const pivotBox = rectWithin(hub, panel), dial = info.form === "dial";
      // The needle's reach from the pivot is the CSS blade less its 12 px tail; it turns on `spring.meter` or `spring.gauge`.
      const length = Number.parseFloat(getComputedStyle(needle).height) - 12, sweep = reader(root).number(dial ? "gauge.sweep" : "meter.sweep", dial ? 240 : 100);
      const t = follow(info.native, dial ? meterSprings.gauge : meterSprings.meter, liveStrataMeter(info.native));
      if (!(length > 4) || pivotBox[2] <= 0) continue;
      objects.push(meterDialObject({ id, box: info.box, window: pane, windowRadius: paneRadius, ...(dial && bezel ? { bezel: rectWithin(bezel, panel) } : {}), pivot: [pivotBox[0] + pivotBox[2] / 2, pivotBox[1] + pivotBox[3] / 2],
        length, sweep, t, scale, relief: { height: raised, material: use("knobSkirt") } }, profile) as unknown as InstrumentObject);
      for (const name of ["knobSkirt", "knobCap", "knobInk", "meterGlass"]) use(name);
      options.domes?.add(needle);
      tallest = Math.max(tallest, meterHeight(info.form, 0, scale));
    }
  }
  // Plates and trays: a rim or a wall of parts inside each element's box, rising with a Dialog's or Drawer's motion.
  const panelColour = tokens.colour("panel"), [pr = 1, pg = 3, pb = 5] = [1, 3, 5].map(at => Number.parseInt(panelColour.slice(at, at + 2), 16) / 255);
  const dark = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb < 0.4;
  const plateTokens = { rim: tokens.number("plate.rim", plateTokenDefaults.rim), height: tokens.number("plate.height", plateTokenDefaults.height), chamfer: tokens.number("plate.chamfer", plateTokenDefaults.chamfer),
    wall: tokens.number("plate.wall", plateTokenDefaults.wall), slope: tokens.number("plate.slope", plateTokenDefaults.slope) };
  for (const plate of context.plates) {
    if (objects.length + entries.length >= 255) break;
    const box = plate.element === panel ? [0, 0, panel.offsetWidth, panel.offsetHeight] as [number, number, number, number] : rectWithin(plate.element, panel);
    const parts = plateParts(plate.form, scale, plateTokens);
    // Room for the margin, the part and some of the face inside it; a smaller element stays a Relief slab or well.
    if (Math.min(box[2], box[3]) < 2 * (plateMargin(plate.form, scale, stage, plateTokens) + parts.width) + 8) continue;
    const state = context.states(plate.element), name = plate.form === "plate" ? (dark ? "plateEdgeDark" : "plateEdge") : dark ? "trayWallDark" : "trayWall";
    objects.push(plateObject({ id: idOf(plate.element, plate.form), box, radii: radiiOf(plate.element, box[2]), form: plate.form, t: options.rise ?? 1, rises: plate.rises, ...(plate.open ? { open: plate.open } : {}),
      scale, stage, dark, disabled: state.disabled, tokens: plateTokens,
      relief: { height: plate.form === "plate" ? raised : tokens.number("elevation.well", 2), material: context.materialFor(plate.element, plate.form === "plate" ? "raised" : "well") } }, profile) as unknown as InstrumentObject);
    use(name);
    tallest = Math.max(tallest, parts.height + 0.5);
  }
  // Displays: a polished bezel and a glass pane over the window (the printed text is exact under it); the backlight is the emitters, lit by
  // `--strata-lit`, so the parts never depend on the state and a toggle is a uniform write.
  for (const root of foundDisplays.get(panel)?.instrument ?? []) {
    const info = foundDisplays.get(panel)!.infos.get(root), bezel = root.querySelector<HTMLElement>(".ug-display__bezel"), pane = root.querySelector<HTMLElement>(".ug-display__window");
    if (!info || !bezel || !pane || objects.length + entries.length >= 255) continue;
    const bezelBox = rectWithin(bezel, panel), bezelRadius = radiusOf(bezel, bezelBox[2]), paneRadius = radiusOf(pane, info.pane[2]), displayTokens = reader(root);
    if (bezelBox[2] <= 0 || bezelBox[3] <= 0) continue;
    const caster = bezelCaster(bezelBox, info.box, bezelRadius, scale, light);
    objects.push(displayObject({ id: idOf(info.native.id ? info.native : root, "display"), box: info.box, bezel: bezelBox, bezelRadius, window: info.pane, windowRadius: paneRadius, scale,
      ...(info.finish ? { finish: { band: displayTokens.number("display.finish.band", 0.3), horizon: displayTokens.number("display.finish.horizon", 0.25) } } : {}), opaque, ...(caster ? { caster } : {}),
      relief: { height: raised, material: "displayBezel" } }, profile) as unknown as InstrumentObject);
    for (const name of ["displayBezel", "displayGlass"] as const) materials[name] ??= displayMaterials[name];
    tallest = Math.max(tallest, displayHeight(scale));
  }
  // A rail Tabs: the plinth (the tablist, one polished part), then each tab's key standing on it with its LED lens (its emitter lit by `--strata-lit`).
  const rails = foundTabs.get(panel);
  for (const list of rails?.lists ?? []) {
    const box = rectWithin(list, panel);
    if (box[2] <= 0 || box[3] <= 0 || objects.length + entries.length >= 255) continue;
    materials.tabPlinth ??= railMaterials.tabPlinth;
    objects.push(railPlinthObject({ id: idOf(list, "rail"), box, radius: radiusOf(list, box[2]), scale, stage, state: { hover: false, pressed: false, disabled: false }, light,
      relief: { height: raised, material: "tabPlinth" } }, profile) as unknown as InstrumentObject);
    tallest = Math.max(tallest, railHeight(scale));
  }
  for (const tab of rails?.keys ?? []) {
    const cap = tab.querySelector<HTMLElement>(".ug-tab__cap"), led = tab.querySelector<HTMLElement>(".ug-tab__led");
    if (!cap || objects.length + entries.length >= 255) continue;
    const box = rectWithin(tab, panel), capBox = rectWithin(cap, panel);
    if (box[2] <= 0 || box[3] <= 0 || capBox[2] <= 0 || capBox[3] <= 0) continue;
    const info = led ? context.segmentInfos.get(led) : undefined, state = tabState(tab);
    const colour = hex(getComputedStyle(cap).backgroundColor), name = `key ${colour}`;
    // The throw's position as the CSS transition has it this frame (`--strata-push-t`: 0.45 selected, 1 held), the number the other levels follow.
    const read = Number.parseFloat(getComputedStyle(tab).getPropertyValue("--strata-push-t"));
    const t = Math.min(1, Math.max(0, state.disabled && !state.pressed ? 0 : Number.isFinite(read) ? read : state.pressed ? 0.45 : 0));
    const relief = { face: "raised" as const, rect: capBox, radius: radiusOf(cap, capBox[2]), height: raised, material: context.materialFor(cap, "raised"), state };
    if (!materials[name] && Object.keys(materials).length >= INSTRUMENT_PUSH_MATERIALS) { keyCaps.keyAtRelief(tab); entries.push(relief); continue; }
    const layers = settings.materials[context.materialFor(cap, "raised")];
    materials[name] ??= { base: { colour, roughness: layers?.base?.roughness ?? 0.45, metallic: layers?.base?.metallic ?? 0 }, coat: { ...layers?.coat } };
    const keyInput = { id: idOf(tab, "tab"), box, cap: capBox, capRadius: radiusOf(cap, capBox[2]), ...(led && info ? { led: rectWithin(led, panel), emitter: info.index } : {}),
      scale, role: info?.role ?? "#ff9228", t, material: name, opaque, state: { hover: !!state.hover, pressed: !!state.pressed, disabled: !!state.disabled }, light, relief: { height: raised, material: use("keyCap") } };
    const railKey = railKeyObject(keyInput, profile) as unknown as InstrumentObject;
    objects.push(railKey);
    keyCaps.registerKeyBody({ element: tab, object: railKey, name, height: railHeight(scale) + 1, relief });
    Object.assign(materials, railKeyMaterials(keyInput));
    materials.tabPlinth ??= railMaterials.tabPlinth;
    tallest = Math.max(tallest, railHeight(scale));
  }
  // Pads and keypads (`gpu/instrument-pad.ts`): a pad's glass rim with its emitter, body and captured cap; a keypad's plinth and, per key, a body and a captured cap.
  const padded = padKeypadObjects(panel, { scale, light, raised, opaque, profile, materials, layers: settings.materials, materialFor: context.materialFor, use, idOf, room: () => objects.length + entries.length < 255,
    helpers: { hex, reader, rectWithin, radiusOf }, domes: options.domes, entries });
  objects.push(...padded.objects);
  tallest = Math.max(tallest, padded.tallest);
  for (const element of context.keys) {
    if (objects.length + entries.length >= 255) break;
    const colour = hex(getComputedStyle(element).backgroundColor), name = `key ${colour}`;
    const box = rectWithin(element, panel), state = context.states(element), height = 5 * scale;
    // A body per colour (the button's own face colour, in its material's roughness), within core's 16 materials.
    const key = materials[name] || Object.keys(materials).length < INSTRUMENT_KEY_BODY_MATERIALS
      ? keyObject({ id: idOf(element, "key"), box, radius: radiusOf(element, box[2]), material: name, height, travel: 2.5 * scale, pressed: state.pressed,
        state: { hover: state.hover, pressed: state.pressed, disabled: state.disabled }, stage, relief: { height: raised, material: use("keyCap") } }, profile)
      : undefined;
    if (!key) { keyCaps.keyAtRelief(element); entries.push({ face: "raised", rect: box, radius: radiusOf(element, box[2]), height: raised, material: context.materialFor(element, "raised"), state }); continue; }
    const layers = settings.materials[context.materialFor(element, "raised")];
    materials[name] ??= { base: { colour, roughness: layers?.base?.roughness ?? 0.45, metallic: layers?.base?.metallic ?? 0 }, coat: { ...layers?.coat } };
    objects.push(key);
    keyCaps.registerKeyBody({ element, object: key, name, height: height + 1, relief: { face: "raised", rect: box, radius: radiusOf(element, box[2]), height: raised, material: context.materialFor(element, "raised"), state } });
  }
  // The JogWheel's wheel and the PatchPoint's jack (`gpu/wave3.ts`): parts on the knob's spring and `spring.patch`.
  const wave3 = wave3Objects(panel, { now, instant, springs: options.springs, moving: options.moving, scale, light, raised, room: () => objects.length + entries.length < 255,
    rectOf: part => rectWithin(part, panel), states: context.states, idOf, profile, materials });
  objects.push(...wave3.objects);
  tallest = Math.max(tallest, wave3.tallest);
  // Rotary selectors and push buttons (`gpu/instrument-rotary.ts`, `gpu/instrument-push.ts`). A rotary selector: the knob's parts, the pointer turned to the
  // selected option on `spring.detent` (one detent per option). A push button: a polished bezel, a glass ring with its emitter, the cap on the
  // CSS throw (`--strata-push-t`), and a latching button's LED.
  const mine = found.get(panel);
  for (const root of mine?.rotaries ?? []) {
    const select = root.querySelector<HTMLSelectElement>(".ug-rotary__select"), skirt = root.querySelector(".ug-rotary__skirt"), cap = root.querySelector(".ug-rotary__cap");
    if (!select || !skirt || !cap || objects.length + entries.length >= 255) continue;
    const box = rectWithin(select, panel);
    if (box[2] <= 0 || box[3] <= 0) continue;
    const t = followSpring(options.springs, options.moving, select, rotaryFraction(Math.max(0, select.selectedIndex), select.options.length), knobSprings.detent, now, instant);
    const state = context.states(skirt);
    objects.push(knobObject({ id: idOf(select, "rotary"), box, skirt: rectWithin(skirt, panel)[2], cap: rectWithin(cap, panel)[2], t, sweep: reader(root).number("knob.sweep", 270), scale,
      state: { hover: state.hover, disabled: state.disabled }, relief: { height: raised, material: use("knobCap") } }, profile));
    for (const name of ["knobSkirt", "knobChamfer", "knobInk"]) use(name);
    options.domes?.add(skirt); options.domes?.add(cap);
    tallest = Math.max(tallest, (2.5 + 16 + 1.2) * scale);
  }
  // A bank's plinths first, then its keys: the group's native box holds the plinth and its shadow.
  for (const plinth of mine?.banks ?? []) {
    const group = plinth.closest<HTMLElement>("fieldset") ?? plinth, box = rectWithin(group, panel), at = rectWithin(plinth, panel);
    if (at[2] <= 0 || at[3] <= 0 || objects.length + entries.length >= 255) continue;
    const state = context.states(plinth);
    materials.pushBezel ??= pushMaterials.pushBezel;
    objects.push(bankPlinthObject({ id: idOf(group, "bank"), box, plinth: at, radius: radiusOf(plinth, at[2]), scale, state: { hover: state.hover, pressed: false, disabled: state.disabled }, light,
      relief: { height: raised, material: use("keyCap") } }, profile) as unknown as InstrumentObject);
    tallest = Math.max(tallest, bankPlinthHeight(scale) + 0.1);
  }
  for (const root of mine?.instrumentPushes ?? []) {
    const info = mine!.pushes.get(root), bezel = root.querySelector<HTMLElement>(".ug-push__bezel"), ring = root.querySelector<HTMLElement>(".ug-push__ring"), cap = root.querySelector<HTMLElement>(".ug-push__cap");
    const led = root.querySelector<HTMLElement>(".ug-push__led");
    if (!info || !cap || (!info.latch && (!bezel || !ring)) || objects.length + entries.length >= 255) continue;
    const box = rectWithin(root, panel), state = context.states(cap);
    if (box[2] <= 0 || box[3] <= 0) continue;
    const style = getComputedStyle(root), colour = hex(getComputedStyle(cap).backgroundColor), name = `key ${colour}`;
    const input = info.latch ? root.querySelector<HTMLInputElement>(":scope > input") : null;
    const disabled = input ? input.disabled : root.matches(":disabled, [aria-disabled='true']");
    // The throw's position as the CSS transition has it this frame, the same number the Relief and Objects levels follow. (A disabled
    // latching key keeps its latched place: a selected disabled radio is still the one that is down.)
    const read = Number.parseFloat(style.getPropertyValue("--strata-push-t"));
    const t = Math.min(1, Math.max(0, input ? (Number.isFinite(read) ? read : input.checked ? 0.45 : 0) : disabled ? 0 : Number.isFinite(read) ? read : pushPosition({ held: root.matches(":active:not([data-strata-down='false']), [data-strata-down='true']"), latched: root.getAttribute("aria-pressed") === "true", disabled })));
    // A bank key stands on its plinth.
    const plinth = root.closest(".ug-bank__plinth"), floor = plinth ? bankPlinthHeight(scale) : 0;
    if (!materials[name] && Object.keys(materials).length >= INSTRUMENT_PUSH_MATERIALS) { keyCaps.keyAtRelief(root); entries.push({ face: "raised", rect: box, radius: radiusOf(root, box[2]), height: raised, material: context.materialFor(cap, "raised"), state }); continue; }
    const layers = settings.materials[context.materialFor(cap, "raised")];
    materials[name] ??= { base: { colour, roughness: layers?.base?.roughness ?? 0.45, metallic: layers?.base?.metallic ?? 0 }, coat: { ...layers?.coat } };
    const pushInput = { id: idOf(input?.id ? input : root, "push"), form: info.form, box, ...(bezel ? { bezel: rectWithin(bezel, panel) } : {}), ...(ring && info.ring !== undefined ? { ring: rectWithin(ring, panel) } : {}), cap: rectWithin(cap, panel),
      ...(led && info.led !== undefined ? { led: rectWithin(led, panel) } : {}),
      ...(info.latch ? { radii: { box: radiusOf(root, box[2]), cap: radiusOf(cap, rectWithin(cap, panel)[2]), ...(bezel ? { bezel: radiusOf(bezel, rectWithin(bezel, panel)[2]) } : {}), ...(ring ? { ring: radiusOf(ring, rectWithin(ring, panel)[2]) } : {}) }, base: floor } : {}),
      scale, role: info.role, emitters: { ...(info.ring !== undefined ? { ring: info.ring } : {}), ...(info.led !== undefined ? { led: info.led } : {}) }, t, material: name, opaque,
      state: { hover: state.hover, pressed: state.pressed, disabled: state.disabled }, light, relief: { height: raised, material: use("keyCap") } };
    objects.push(pushObject(pushInput, profile) as unknown as InstrumentObject);
    Object.assign(materials, pushMaterialsOf(pushInput));
    for (const part of [root, bezel, ring, led]) if (part) options.domes?.add(part);
    tallest = Math.max(tallest, pushHeight(scale));
  }
  const elevation = (tokens.number("light.elevation", 41) * Math.PI) / 180;
  // The lamps' and push buttons' materials come after the key bodies, so a scene can still pass core's cap (which draws the whole layer at Relief):
  // the later colours' keys become Relief keys until it fits, and the diagnostics say which. The remaining bodies set the reach.
  tallest = Math.max(tallest, keyCaps.trim({ objects, entries, materials }));
  const reach = Math.min(128, Math.max(context.reach, Math.ceil(tallest / Math.tan(elevation) + 1.5 * tallest + 1)));
  // The application's character names the room (`studio.*`, declared on the root only); without one the defaults stand.
  const studio = Object.fromEntries((["key", "keyRadius", "fill", "front", "strip", "floor", "ceiling"] as const)
    .flatMap(key => (tokens.raw(`studio.${key}`) ? [[key, tokens.number(`studio.${key}`)] as const] : []))) as Partial<StudioTokens>;
  return {
    ...settings, format: "strata-scene", version: 4, kind: "instrument",
    outset: { top: reach, right: reach, bottom: reach, left: reach },
    camera: { distance: Math.max(INSTRUMENT_CAMERA, tokens.number("camera.distance", 1600)),
      vanish: [(stageBox.left + stageBox.width / 2 - outer.left) / zoom, (stageBox.top + stageBox.height / 2 - outer.top) / zoom] },
    environment: { source: "studio", strength: Math.min(3, Math.max(0, tokens.number("environment.intensity", 1))), ...(Object.keys(studio).length ? { studio } : {}) },
    light: { ...settings.light, intensity: 1.6 },
    materials: (instrumentReport.materials.count = Object.keys(materials).length, materials), primitives: entries, profiles, objects,
    ...(context.lights ?? {}),
  };
}

type Movable = HTMLElement & { [panelMotion]?: PanelMover };

/**
 * A JogWheel's input carries core's `data-underglass-gpu-value` (api.md, "Input events and captures") exactly while the GPU draws the dimple: its
 * thumb is never painted, so an `input` changes no pixel. Set and removed with the dimple's dome, so the mark is gone before the next `input` once the
 * dimple is CSS-painted again (a step-down, `releasePanel`, `detach`). The literal must match core's `GPU_VALUE_ATTRIBUTE` (`ui` does not import core).
 */
function markValue(element: Element, on: boolean) {
  if (!element.matches(".ug-jog-wheel__dimple")) return;
  const input = element.closest(".ug-jog-wheel")?.querySelector(".ug-jog-wheel__input");
  if (!input) return;
  if (on) input.setAttribute("data-underglass-gpu-value", ""); else input.removeAttribute("data-underglass-gpu-value");
}

/** A plate or tray at the Instrument level: its element, its form, whether the panel motion lifts it and a tray's open side. */
interface PlateInfo { element: HTMLElement; form: PlateForm; rises: boolean; open?: PlateOpen }

/**
 * A knob's diameter to half a px: the CSS sizes are even px, and a layer that moves (a Dialog entering through depth) reports them with float noise, which
 * would make a new knob profile, and so a rebuild of the layer, every frame.
 */
const halfPx = (value: number) => Math.round(value * 2) / 2;

/** The four corner radii of an element, clockwise from the top left, in px (a percentage is of the width). */
function radiiOf(element: Element, width: number): [number, number, number, number] {
  const style = getComputedStyle(element);
  const read = (value: string) => { const amount = Number.parseFloat(value); return value.endsWith("%") ? (amount / 100) * width : Number.isFinite(amount) ? amount : 0; };
  return [read(style.borderTopLeftRadius), read(style.borderTopRightRadius), read(style.borderBottomRightRadius), read(style.borderBottomLeftRadius)];
}

/** The edge of the stage a Drawer sits on, which its tray is open on (`start` and `end` follow the writing direction). */
function drawerEdge(drawer: Element): PlateOpen | undefined {
  const rtl = getComputedStyle(drawer).direction === "rtl";
  if (drawer.classList.contains("ug-drawer--top")) return "top";
  if (drawer.classList.contains("ug-drawer--bottom")) return "bottom";
  if (drawer.classList.contains("ug-drawer--start")) return rtl ? "right" : "left";
  if (drawer.classList.contains("ug-drawer--end")) return rtl ? "left" : "right";
  return undefined;
}

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
  type Motion = { start: number; duration: number; ease: (t: number) => number; from: number; to: number; kind: "enter" | "leave" };
  const panels = new Map<HTMLElement, { id: string; release: () => void; handle?: ReturnType<StrataGpuController["setMaterial"]>; kind?: StrataSceneMaterial["kind"];
    scene?: string; structure?: string; motion?: Motion; domes: Set<Element>; report?: StrataGpuDiagnostics; warned?: Set<string> }>();
  /** Shows the CSS paint of the elements a panel no longer draws as domes, and hides it on those it now does. */
  const markDomes = (entry: { domes: Set<Element> }, domes: Set<Element>) => {
    for (const element of entry.domes) if (!domes.has(element)) { element.removeAttribute("data-strata-dome"); markValue(element, false); }
    for (const element of domes) if (!element.hasAttribute("data-strata-dome")) { element.setAttribute("data-strata-dome", ""); markValue(element, true); }
    entry.domes = domes;
  };
  // Scrims under open dialogs: plain layers (no material) that the GPU fades in and out.
  const scrims = new Map<HTMLElement, { id: string; release: () => void; fade?: ReturnType<StrataGpuController["transition"]>; closing?: boolean }>();
  let serial = 0, frame = 0, detached = false;
  // Instrument knobs' springs, kept between scenes; the knobs still moving ask for another frame.
  const springs = new WeakMap<Element, KnobSpring>(), moving = new Set<Element>(), peaks = new WeakMap<Element, PeakState>();
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
    entry.handle?.cancel(); entry.release(); resize.unobserve(element); element.removeAttribute("data-strata-mode"); element.removeAttribute("data-strata-instrument"); panels.delete(element);
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
      if (element.getAttribute("data-strata-mode") !== "face") element.setAttribute("data-strata-mode", "face");
      if (element.hasAttribute("data-strata-closing") && !entry.closing) fadeScrim(element, true);
    }
    for (const [element, entry] of panels) {
      if (element.parentElement !== root) { releasePanel(element); continue; }
      if (!gpu) {
        // GPU is off: the CSS relief presents, and no material is kept.
        if (element.getAttribute("data-strata-mode") === "face") element.removeAttribute("data-strata-mode");
        element.removeAttribute("data-strata-instrument");
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
    // A StatusLight's blink and a chase (a Spinner ring, an indeterminate bar) are CSS animations of `--strata-lit`, which the scene reads: they need a scene each frame while they run.
    if (gpu && (root.getAnimations({ subtree: true }).some(animation => (animation instanceof CSSTransition || (animation instanceof CSSAnimation && /^ug-(blink|chase)/.test(animation.animationName))) && animation.playState === "running")
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

  /** One `console.warn` per panel and cause: the scene is past core's material cap, or a button became a Relief key (issue #173). */
  function warnOnce(element: HTMLElement, entry: { id: string; report?: StrataGpuDiagnostics; warned?: Set<string> }) {
    const report = entry.report!, warned = entry.warned ??= new Set();
    // A panel that fits again may overflow again later: its warnings re-arm.
    if (report.materials.count <= report.materials.cap) warned.delete("cap");
    if (!report.keysAtRelief.length) warned.delete("keys");
    if (report.materials.count > report.materials.cap && !warned.has("cap")) {
      warned.add("cap");
      console.warn(`Strata GPU: panel ${element.id || entry.id} names ${report.materials.count} materials, above core's cap of ${report.materials.cap}; its Instrument layer is drawn at the Relief level (state().instrument).`);
    }
    if (report.keysAtRelief.length && !warned.has("keys")) {
      warned.add("keys");
      console.warn(`Strata GPU: panel ${element.id || entry.id} holds ${report.materials.count} materials, so ${report.keysAtRelief.length} button(s) (${report.keysAtRelief.slice(0, 4).join(", ")}) are Relief keys, not Instrument parts (key bodies stop at ${INSTRUMENT_KEY_BODY_MATERIALS} materials, push buttons at ${INSTRUMENT_PUSH_MATERIALS}).`);
    }
  }

  /** Brings a presented panel's scene and material up to date. */
  function update(element: HTMLElement, entry: NonNullable<ReturnType<typeof panels.get>>) {
    if (element.getAttribute("data-strata-mode") !== "face") element.setAttribute("data-strata-mode", "face");
    const motion = entry.motion;
    const domes = new Set<Element>();
    // A Dialog's plate and a Drawer's tray come out of the chassis with the motion's eased progress, and go back into it as it leaves.
    const progress = motion ? Math.min(1, Math.max(0, motion.ease(Math.min(1, (performance.now() - motion.start) / motion.duration)))) : 1;
    instrumentReport = undefined;
    const scene = strataScene(element, { level: options.level, cap, stage: stageBox(), domes, environment, springs, moving, peaks, ...(options.parts ? { parts: options.parts } : {}),
      ...(motion ? { height: motion.from + (motion.to - motion.from) * motion.ease(Math.min(1, (performance.now() - motion.start) / motion.duration)), rise: motion.kind === "enter" ? progress : 1 - progress } : {}) });
    markDomes(entry, domes);
    entry.report = isInstrumentScene(scene) ? instrumentReport : undefined;
    if (entry.report) warnOnce(element, entry);
    // A panel drawn with the instrument material says so, so the CSS can hold the motion of the parts it draws.
    if (element.hasAttribute("data-strata-instrument") !== (scene.version === 4)) element.toggleAttribute("data-strata-instrument", scene.version === 4);
    const key = JSON.stringify(scene);
    if (entry.scene === key) return;
    const kind = materialKind(scene);
    // The lights apart from the rest: when only they moved (a lamp turned on, an LED blinked), core's uniform path is enough.
    const lights = "emitters" in scene ? scene.emitters : undefined;
    const structure = lights ? JSON.stringify({ ...scene, emitters: undefined }) : undefined;
    try {
      // A change of level changes the material's kind: the new material replaces the old one in one step.
      if (entry.handle && entry.kind === kind) {
        if (lights && structure === entry.structure && entry.handle.setEmitters) entry.handle.setEmitters(lights);
        else entry.handle.update(scene);
      } else {
        const base = { bounds: "layer", interaction: "material", media: "identity", fallback: "static" } as const;
        entry.handle = controller.setMaterial(entry.id, isInstrumentScene(scene) ? { kind: "instrument", scene, ...base } : { kind: kind as "relief" | "objects", scene, ...base });
      }
      entry.kind = kind;
      entry.scene = key;
      entry.structure = structure;
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
      // A Drawer's tray slides out of its chassis edge (and back into it): the layer travels its own width or height, fading as it goes.
      const edge = element.matches(".ug-drawer") && element.getAttribute("data-strata-form") === "tray" ? drawerEdge(element) : undefined;
      const slide = edge === "left" ? { x: -element.offsetWidth } : edge === "right" ? { x: element.offsetWidth } : edge === "top" ? { y: -element.offsetHeight } : edge === "bottom" ? { y: element.offsetHeight } : undefined;
      const far = slide ? { opacity: 0, ...slide } : { opacity: 0, scaleX: depth, scaleY: depth, ...(tilt ? { tiltX: tilt, perspective: distance } : {}) };
      // At the Scene level a panel entering settles: a damped spring through depth and tilt, sampled into keyframes.
      const settles = !slide && motion === "enter" && sceneLevel() && lower(strataLevel(element, options.level), cap) === "scene";
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
      entry.motion = { start: performance.now(), duration: length, ease: settles ? settle : bezier(easing), from: motion === "enter" ? modal : own, to: motion === "enter" ? own : modal, kind: motion };
      schedule();
      try { await handle.finished; } finally { entry.motion = undefined; schedule(); }
    };
  }
  const events = ["pointerover", "pointerout", "pointerdown", "pointerup", "focusin", "focusout", "keydown", "keyup", "input", "change", "transitionrun", "transitionend", "strata-meter-live"];
  // A JogWheel the GPU draws turns without a write to the DOM: its behaviour wakes the helper with this event instead.
  events.push("strata-jog-live");
  for (const type of events) root.addEventListener(type, schedule, true);
  const mutation = new MutationObserver(schedule);
  mutation.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "disabled", "checked", "aria-checked",
    "aria-current", "aria-disabled", "aria-pressed", "data-strata-lit", "data-strata-blink", "data-strata-colour", "aria-selected", "data-strata-closing", "data-strata-face", "data-strata-material", "data-strata-elevation", "data-strata-level", "data-strata-depth", "data-strata-theme", "data-strata-character", "data-strata-scope", "data-strata-preview", "hidden", "open", "value", "min", "max", "low", "high", "optimum", "data-strata-backlight"] });
  resize.observe(root);
  const poll = setInterval(schedule, options.poll ?? 500);
  forced.addEventListener("change", schedule);
  sync();
  const handle: StrataGpu = {
    burst,
    refresh: () => { if (frame) cancelAnimationFrame(frame); sync(); },
    scene: panel => { const key = panels.get(panel)?.scene; return key ? JSON.parse(key) as StrataScene | StrataInstrumentScene : undefined; },
    cap: () => cap,
    diagnostics: panel => { const report = panels.get(panel)?.report; return report ? { materials: { ...report.materials }, keysAtRelief: [...report.keysAtRelief] } : undefined; },
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
