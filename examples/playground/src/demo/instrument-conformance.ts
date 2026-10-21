/**
 * Entry for `instrument-conformance.html`: renders one case of the Strata Rendering Model's Instrument suite
 * (`@underglass/ui/conformance/instrument-4.json`, version 4) with core's `instrument` material, so
 * `tests/browser/ui-instrument-conformance.test.mjs` can decode GPU pixels against the suite. The case's capture
 * (rounded rectangles in order) is painted as plain DOM in a layer; the case's scene becomes the layer's material.
 * Core's instrument camera stands at the canvas centre, so the layer is placed where the canvas centre is the scene's
 * vanishing point (`camera.vanish`, layer px). Only `@underglass/core` is used: the scene format is the contract.
 * `window.instrumentConformance` is the test hook.
 */
import { compileStyle, createCanvasHosts, mountApplicationModule, type CanvasController, type InstrumentScene, type MaterialHandle } from "@underglass/core";

interface CapturePaint { rect: [number, number, number, number]; radius?: number; colour: string }
interface InstrumentCase { name: string; scene: InstrumentScene; capture: CapturePaint[] }

const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
let release: (() => void) | undefined;
let section: HTMLElement | undefined;
let material: MaterialHandle | undefined;
let root!: HTMLElement;
let origin = { x: 0, y: 0 };
// The plain white stage the pool light and the outset shadow fall on: the output canvas is transparent (the page shows through,
// #134), and light multiplies what is on the canvas, so a lit pass past a panel's edge needs a layer of the page colour beneath it.
let stage: HTMLElement | undefined;
// The output budget of instrument-core.html: a full 1920 × 1080 stage at DPR 2.
const controller: CanvasController = mountApplicationModule({ ...createCanvasHosts(frame), budgets: { layers: 8, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.textContent = `${value.mode}: ${value.reason}`; } }, { mount({ container }) {
  root = container;
  return () => { release?.(); container.replaceChildren(); };
} });

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; steppedDown: { object: string; reason: string; detail?: string; inset?: number }[] }[]; compile: { building: boolean } } | null };
const state = () => controller.state() as unknown as State;
/** Waits for core to settle and the case's instrument layer to finish building, then for three frames. */
async function settle(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    await controller.settle();
    const instrument = state().instrument;
    const pending = !!instrument && (instrument.compile.building || instrument.layers.some(layer => layer.status === "pending"));
    if (!pending) break;
    if (performance.now() > deadline) throw new Error(`Instrument layer did not settle: ${JSON.stringify(instrument?.layers.map(layer => [layer.id, layer.status]))}`);
    await nextFrame();
  }
  for (let index = 0; index < 3; index++) await nextFrame();
}
const report = () => {
  const value = state();
  return { mode: value.mode, reason: value.reason, origin, layer: value.instrument?.layers.find(layer => layer.id === "case") ?? null };
};

/** Replaces the shown case: paints its capture as a new layer at the vanishing point's place, enrolls it and gives it `scene`. */
async function show(entry: InstrumentCase, scene: InstrumentScene = entry.scene) {
  material?.cancel();
  release?.();
  section?.remove();
  if (!stage) {
    stage = document.createElement("section");
    stage.id = "stage";
    Object.assign(stage.style, { position: "absolute", inset: "0", background: "white" });
    root.append(stage);
    controller.enroll(stage, { id: "stage" });
  }
  const { width, height } = scene.extent;
  // The canvas centre is the vanishing point: the layer's origin is the centre less `camera.vanish`.
  origin = { x: frame.clientWidth / 2 - scene.camera.vanish[0], y: frame.clientHeight / 2 - scene.camera.vanish[1] };
  section = document.createElement("section");
  section.id = "case";
  section.dataset.case = entry.name;
  Object.assign(section.style, compileStyle({ x: origin.x, y: origin.y, width, height }, {}, true));
  for (const paint of entry.capture) {
    const [x, y, w, h] = paint.rect;
    const div = document.createElement("div");
    div.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${paint.radius ?? 0}px;background:${paint.colour}`;
    section.append(div);
  }
  root.append(section);
  release = controller.enroll(section, { id: "case" });
  await controller.settle();
  if (controller.state().mode !== "gpu") await controller.enable();
  material = controller.setMaterial("case", { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
  await settle();
  return report();
}
/** Hands the shown layer another scene (a variant): a uniform update, no capture. */
async function update(scene: InstrumentScene) {
  material!.update(scene);
  await settle();
  return report();
}

window.instrumentConformance = { show, update, state: report, settle, dispose: () => controller.dispose() };

declare global {
  interface Window { instrumentConformance: {
    show(entry: InstrumentCase, scene?: InstrumentScene): Promise<ReturnType<typeof report>>;
    update(scene: InstrumentScene): Promise<ReturnType<typeof report>>;
    state(): ReturnType<typeof report>;
    settle(): Promise<void>;
    dispose(): ReturnType<CanvasController["dispose"]>;
  } }
}
