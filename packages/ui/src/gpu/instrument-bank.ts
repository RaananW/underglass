/**
 * Keys on a plinth, at the Instrument level (design language section 6, the Instrument object table; anatomy pages `radio.md` and
 * `segmented-control.md`, section 11, and `tabs.md`, section 11): the one construction every "latching keys on one rail" form uses. The
 * RadioGroup's bank, the SegmentedControl's latching form and the Tabs' rail are three components with one scene:
 * - **plinth:** one polished part (`bankPlinthObject`), an object of its own; the keys stand on it and their LEDs sit in it;
 * - **key** (one object per key): a body in the cap's own face colour with the captured cap on it, travelling on `t` (`pushObject`, no bezel and
 *   no ring), standing on the plinth, with the LED lens (and its emitter) on the plinth above it;
 * - the registry's calls: a key past `INSTRUMENT_PUSH_MATERIALS` is a Relief key (`keyAtRelief`), and each body is registered (`registerKeyBody`)
 *   so the scene can trim it to core's material cap (`gpu/instrument-keys.ts`).
 * A component adds only its mapping (which element is the plinth, which are the keys, where each LED sits, the key's place along its travel and
 * its state) in the helper's loop (`gpu/index.ts`): the Tabs' (`gpu/tabs-forms.ts`) says the tablist is the plinth, so it has no room round it
 * and its plinth casts no shadow of its own (`flush`); a bank's group keeps room for its plinth's shadow.
 */
import type { SceneEntry, ScenePrimitive } from "../tokens/scene.ts";
import { pushGeometry } from "../shared/push-button.ts";
import { INSTRUMENT_PUSH_MATERIALS, type KeyRegistry } from "./instrument-keys.ts";
import { bankPlinthHeight, bankPlinthObject, pushMaterials, pushMaterialsOf, pushObject, type BankPlinthInput } from "./instrument-push.ts";
import type { InstrumentObject, InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Box = [number, number, number, number];

/** What the loop hands the construction: the scene being built. */
export interface BankScene {
  objects: InstrumentObject[];
  entries: SceneEntry[];
  materials: Record<string, InstrumentRecipe>;
  registry: KeyRegistry;
  /** The application's materials (`settings.materials`), whose roughness and coat a key body of its own colour takes. */
  layers: Record<string, { base?: { roughness?: number; metallic?: number }; coat?: object }>;
  profile: (name: string, shape: InstrumentProfile) => string;
  light: { azimuth: number; elevation: number };
  scale: number;
  opaque: boolean;
  /** `elevation.raised`, and the helper's `use`, which names a premium material and adds it to the scene (the Relief fallback is `keyCap`). */
  raised: number;
  use(name: string): string;
  /** Whether the scene still has room for an object (core's 255). */
  room(): boolean;
}

/** The tallest point of a plinth and a key on it above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export const bankHeight = (scale: number) => Math.round((bankPlinthHeight(scale) + pushGeometry.cap * scale + 0.1) * 1000) / 1000;

/** The plinth's object. Returns the tallest point it adds, or 0 when it is not drawn. */
export function addBankPlinth(scene: BankScene, plinth: Omit<BankPlinthInput, "scale" | "light" | "relief"> & { id: string }): number {
  if (!scene.room() || plinth.plinth[2] <= 0 || plinth.plinth[3] <= 0) return 0;
  scene.materials.pushBezel ??= pushMaterials.pushBezel;
  scene.objects.push(bankPlinthObject({ ...plinth, scale: scene.scale, light: scene.light, relief: { height: scene.raised, material: scene.use("keyCap") } }, scene.profile) as unknown as InstrumentObject);
  return bankPlinthHeight(scene.scale) + 0.1;
}

/** One key of a bank, from its component's mapping (px in the panel). */
export interface BankKeySpec {
  /** The element the diagnostics name when the key is a Relief key. */
  element: Element;
  id: string;
  /** The native element's box (the object's `bounds`), the cap's, the LED lens's, and the cap's corner radius. */
  box: Box;
  cap: Box;
  capRadius: number;
  /** The box's own corner radius (`bounds`); a bank's key host is round, the Tabs' tab is not. */
  boxRadius: number;
  led?: Box;
  /** The LED's role colour, `#rrggbb`, and its emitter's index in the scene's `emitters`. */
  role: string;
  emitter?: number;
  /** The cap body's colour (`#rrggbb`, the cap's face) and the material the cap's Relief face takes. */
  colour: string;
  capMaterial: string;
  /** The key's place along its travel now, 0–1 (the CSS throw, `--strata-push-t`). */
  t: number;
  state: { hover?: boolean; pressed?: boolean; disabled?: boolean };
  /** The plinth's own height the key stands on is the bank's (`bankPlinthHeight`); false: it stands on the face (a Checkbox's). */
  onPlinth: boolean;
  /** What is drawn instead of the key when it cannot be drawn as parts: the shape of its Relief face (the key host's box, or the Tabs' cap). */
  relief: { rect: Box; radius: number };
}

/**
 * A key as an Instrument object standing on the plinth. A colour of its own is a body material while the scene holds fewer than
 * `INSTRUMENT_PUSH_MATERIALS`; past it the key is a Relief key and no object is made. Returns whether an object was made.
 */
export function addBankKey(scene: BankScene, key: BankKeySpec): boolean {
  const name = `key ${key.colour}`, state = key.state;
  const fallback: ScenePrimitive = { face: "raised", rect: key.relief.rect, radius: key.relief.radius, height: scene.raised, material: key.capMaterial, state };
  if (!scene.room()) return false;
  if (!scene.materials[name] && Object.keys(scene.materials).length >= INSTRUMENT_PUSH_MATERIALS) { scene.registry.keyAtRelief(key.element); scene.entries.push(fallback); return false; }
  const layers = scene.layers[key.capMaterial];
  scene.materials[name] ??= { base: { colour: key.colour, roughness: layers?.base?.roughness ?? 0.45, metallic: layers?.base?.metallic ?? 0 }, coat: { ...layers?.coat } };
  const input = { id: key.id, form: "latching" as const, box: key.box, cap: key.cap, ...(key.led && key.emitter !== undefined ? { led: key.led } : {}),
    radii: { box: key.boxRadius, cap: key.capRadius }, base: key.onPlinth ? bankPlinthHeight(scene.scale) : 0,
    scale: scene.scale, role: key.role, emitters: key.emitter !== undefined ? { led: key.emitter } : {}, t: key.t, material: name, opaque: scene.opaque,
    state: { hover: !!state.hover, pressed: !!state.pressed, disabled: !!state.disabled }, light: scene.light,
    relief: { height: scene.raised, material: scene.use("keyCap"), rect: key.relief.rect, radius: key.relief.radius } };
  const object = pushObject(input, scene.profile) as unknown as InstrumentObject;
  scene.objects.push(object);
  Object.assign(scene.materials, pushMaterialsOf(input));
  scene.registry.registerKeyBody({ element: key.element, object, name, relief: fallback, height: bankHeight(scene.scale) + 1 });
  return true;
}
