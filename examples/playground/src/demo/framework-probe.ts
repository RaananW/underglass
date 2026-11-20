/**
 * The `window.frameworkProbe` contract every framework-adapter demo page (`vanilla.html`, `vue.html`, `react.html`)
 * exposes to `tests/helpers/framework-contract.mjs`. Each page renders the same small app in its own framework.
 *
 * With `?cases` in the URL a page also renders the case layers that `frameworkCases` drives (`CaseProbe`):
 * - `ref` at (340,140) 140x100, the app's own `<section>` enrolled by ref (`useSurfaceRef`, `controller.enroll`);
 * - `surface` at (490,140) 140x100, registered as the adapter's layer component does (`Surface`, the module's `enroll`);
 * - on pages with `Presence`: `stage` at (20,270) 160x130, an enrolled section whose `Presence` holds a teal card, and
 *   `host` at (220,270) 160x130, an enrolled section unmounted together with its `Presence` (an orange card).
 * Each case layer holds a native button in its top-left corner, `#<layer>-button`, reading "<layer> g<generation>
 * <clicks>" (the stage card's reads "stage <clicks>"). Case layers are purple (rgb(130,40,200)), pink (rgb(200,40,130))
 * in an odd generation, amber (rgb(250,170,20)) once renamed and grey (rgb(90,90,90)) while decorative, when the button
 * is replaced by a plain label.
 */
import type { CanvasController, MotionDescriptor } from "@underglass/core";

/** The app state each page reports next to the runtime state. */
export interface FrameworkState {
  /** Which adapter rendered the page, for example "vanilla". */
  framework: string;
  count: number;
  name: string;
  swatch: "blue" | "yellow";
  /** How many times the framework root mounted and unmounted. */
  mounts: number;
  cleanups: number;
  /** Whether the runtime container and the `#name` input are still the original elements. */
  sameRoot: boolean;
  sameInput: boolean;
}
export interface FrameworkProbe {
  controller: CanvasController;
  state(): ReturnType<CanvasController["state"]> & FrameworkState;
  /** Adds layer `extra` through the framework; resolves once it is in the DOM. */
  addLayer(): Promise<void>;
  /** Removes layer `extra` through the framework; resolves once it is gone. */
  removeLayer(): Promise<void>;
  /** Disposes the controller and returns the final state. */
  dispose(): Promise<ReturnType<FrameworkProbe["state"]>>;
}

/** The two case layers: `ref` is enrolled by ref, `surface` is registered as the adapter's layer component. */
export type CaseLayer = "ref" | "surface";
/**
 * One change to a case layer, made through the framework:
 * - `unmount` / `mount`: its element leaves the root, or comes back as a new element (clicks from 0);
 * - `swap`: a new element and component instance with the same layer id replaces it in one update (a `key` change);
 * - `rename`: its layer id changes to `<layer>-renamed`, on the same element;
 * - `decorate` / `undecorate`: it becomes decorative (inert, aria-hidden, a label instead of the button) or
 *   interactive again.
 */
export type LayerChange = "unmount" | "mount" | "swap" | "rename" | "decorate" | "undecorate";
/** What the page renders for one case layer. */
export interface CaseLayerState { mounted: boolean; generation: number; renamed: boolean; decorative: boolean }
/** A `Presence` result as the page records it, with the `Presence` that reported it. */
export interface CaseCompletion { status: string; reason: string; presence: "stage" | "host" }
/** What a second mount into the page's `#second` frame did (see `CaseProbe.mountSecond`). */
export interface SecondMount {
  /** What the mount function threw, as a string, or null. */
  error: string | null;
  /** Whether the mount function returned a controller. */
  mounted: boolean;
  /** The layer ids that controller reported. */
  layers: string[];
  /** `#second`'s markup before and right after the mount, before anything was disposed. */
  before: string;
  after: string;
}
export interface CaseProbe extends FrameworkProbe {
  cases: {
    ref: CaseLayerState;
    surface: CaseLayerState;
    /** Every `Presence` result, in order; empty on a page without `Presence`. */
    completions: CaseCompletion[];
  };
  /** Makes `change` to `layer` through the framework; resolves once the framework has applied it, effects included. */
  changeLayer(layer: CaseLayer, change: LayerChange): Promise<void>;
  /**
   * Present on pages whose adapter has `Presence`: `hide` / `show` set its `present`; `unmount` takes the stage's
   * `Presence` away while its section stays, and the host's away together with its section. Resolves as
   * `changeLayer` does, before any transition it starts has ended.
   */
  presence?(target: "stage" | "host", change: "hide" | "show" | "unmount"): Promise<void>;
  /**
   * Mounts a second application into fresh hosts in `#second` with the adapter's own mount function: `throws` is
   * an application whose first render throws "The application failed in its first render"; `healthy` registers
   * one layer, `second`. A controller the mount returned is disposed before this resolves.
   */
  mountSecond(kind: "throws" | "healthy"): Promise<SecondMount>;
}
/** The colours of a case layer, by its state. */
export const caseColors = { base: "rgb(130, 40, 200)", swapped: "rgb(200, 40, 130)", renamed: "rgb(250, 170, 20)", decorative: "rgb(90, 90, 90)" };
export const caseColor = (state: CaseLayerState) => state.decorative ? caseColors.decorative : state.renamed ? caseColors.renamed
  : state.generation % 2 ? caseColors.swapped : caseColors.base;
/** The layer id of a case layer in its state. */
export const caseId = (layer: CaseLayer, state: CaseLayerState) => state.renamed ? `${layer}-renamed` : layer;
/** Where each case layer sits in the frame. */
export const caseGeometry = { ref: { x: 340, y: 140, width: 140, height: 100 }, surface: { x: 490, y: 140, width: 140, height: 100 } } as const;
/** The initial state of a case layer. */
export const initialCase = (): CaseLayerState => ({ mounted: true, generation: 0, renamed: false, decorative: false });
/** Applies `change` to a case layer's state. */
export function changed(state: CaseLayerState, change: LayerChange): CaseLayerState {
  switch (change) {
    case "unmount": return { ...state, mounted: false };
    case "mount": return { ...state, mounted: true };
    case "swap": return { ...state, generation: state.generation + 1 };
    case "rename": return { ...state, renamed: true };
    case "decorate": return { ...state, decorative: true };
    case "undecorate": return { ...state, decorative: false };
  }
}
/** Whether the page was opened with `?cases`. */
export const withCases = new URLSearchParams(location.search).has("cases");
/** Long motions, so a transition is still running whenever a case interrupts it. */
export const presenceMotion: { enter: MotionDescriptor; exit: MotionDescriptor } = {
  enter: { keyframes: [{ offset: 0, x: 40, opacity: 0 }, { offset: 1 }], timing: { duration: 3000 } },
  exit: { keyframes: [{ offset: 0 }, { offset: 1, x: 40, opacity: 0 }], timing: { duration: 3000 } },
};
declare global { interface Window { frameworkProbe: FrameworkProbe } }
