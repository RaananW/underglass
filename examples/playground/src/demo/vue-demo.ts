/**
 * Vue 3 application on `@underglass/vue`: the shared framework-adapter app written with `Surface`, `Box`
 * and `useSurfaceRef`, mounted by `mountCanvasApp` and updated only through Vue reactivity. Render
 * functions keep it free of a template compiler. It exposes `window.frameworkProbe` for
 * `tests/helpers/framework-contract.mjs`; with `?cases` it also renders the case layers and `Presence` layers that
 * `frameworkCases` drives (see `framework-probe.ts`).
 */
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, version, type PropType } from "vue";
import {
  mountCanvasApp, createCanvasHosts, Surface, Box, Presence, NativeOverlay, useSurfaceRef,
  type CanvasController, type MotionDescriptor, type TransitionResult,
} from "@underglass/vue";
import {
  caseColor, caseGeometry, caseId, changed, initialCase, presenceMotion, withCases,
  type CaseCompletion, type CaseLayer, type CaseLayerState, type CaseProbe, type SecondMount,
} from "./framework-probe";

const swatches = { blue: "rgb(20, 120, 220)", yellow: "rgb(250, 200, 20)" };
// Reactive app state, shared with the probe so tests can observe and drive the Vue app.
const count = ref(0), name = ref("original"), swatch = ref<"blue" | "yellow">("blue"), extra = ref(false);
let mounts = 0, cleanups = 0;

// Whether the side layer's badge is present, and the results `Presence` emitted for it, in order.
const badge = ref(true);
const completions: TransitionResult[] = [];
const enter: MotionDescriptor = { keyframes: [{ offset: 0, x: 12, opacity: 0 }, { offset: 1 }], timing: { duration: 120 } };
const exit: MotionDescriptor = { keyframes: [{ offset: 0 }, { offset: 1, x: 12, opacity: 0 }], timing: { duration: 120 } };

// The second layer is the app's own `<section>`, enrolled by ref rather than rendered by `Surface`. Its badge
// enters and exits through `Presence` on that layer, and its button opens a native dialog through `NativeOverlay`.
const Side = defineComponent({
  setup() {
    const side = useSurfaceRef({ id: "side" });
    const dialog = shallowRef<HTMLDialogElement | null>(null);
    return () => [
      h("section", {
        ref: side, id: "side",
        style: { position: "absolute", left: "340px", top: "20px", width: "160px", height: "100px", padding: "8px", boxSizing: "border-box", background: "rgb(20,200,90)" },
      }, [
        h("button", { id: "side-button", type: "button", onClick: () => count.value++ }, "Side"),
        h("button", { id: "dialog-open", type: "button", onClick: () => dialog.value!.showModal() }, "Dialog"),
        h(Presence, { id: "side", present: badge.value, enter, exit, onComplete: (result: TransitionResult) => completions.push(result) },
          () => h("span", { id: "badge" }, "New")),
      ]),
      h(NativeOverlay, () => h("dialog", { ref: dialog, id: "dialog", "aria-label": "Original native dialog" }, [
        h("input", { id: "dialog-input", "aria-label": "Overlay value", value: name.value, onInput: (event: Event) => { name.value = (event.target as HTMLInputElement).value; } }),
        h("button", { id: "dialog-close", type: "button", onClick: () => dialog.value!.close() }, "Close"),
      ])),
    ];
  },
});

// The case layers of `?cases` (see `framework-probe.ts`), changed only through this reactive state.
const scene = reactive({
  ref: initialCase(), surface: initialCase(),
  stage: { present: true, mounted: true }, host: { present: true, mounted: true },
});
const caseCompletions: CaseCompletion[] = [];
const Counter = defineComponent({
  props: { id: { type: String, required: true }, label: { type: String, required: true } },
  setup(props) {
    const clicks = ref(0);
    return () => h("button", { id: `${props.id}-button`, type: "button", onClick: () => clicks.value++ }, `${props.label} ${clicks.value}`);
  },
});
// A case layer's content: its counting button, or a plain label while decorative.
const caseContent = (layer: CaseLayer, state: CaseLayerState) => state.decorative ? h("span", "decorative")
  : h(Counter, { id: layer, label: `${layer} g${state.generation}` });
const caseStyle = { padding: "8px", boxSizing: "border-box", color: "white", fontSize: "12px" } as const;
// The `ref` case layer: the app's own section, enrolled by `useSurfaceRef`.
const RefLayer = defineComponent({
  props: { state: { type: Object as PropType<CaseLayerState>, required: true } },
  setup(props) {
    const element = useSurfaceRef(() => ({ id: caseId("ref", props.state), decorative: props.state.decorative }));
    return () => {
      const { x, y, width, height } = caseGeometry.ref;
      return h("section", {
        ref: element, id: "ref-layer", inert: props.state.decorative, "aria-hidden": props.state.decorative ? "true" : undefined,
        style: { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, background: caseColor(props.state), ...caseStyle },
      }, [caseContent("ref", props.state)]);
    };
  },
});
// An enrolled section at `x` holding a `Presence` card of `background` (and, for the stage, a counting button).
const PresenceLayer = defineComponent({
  props: {
    id: { type: String as PropType<"stage" | "host">, required: true }, x: { type: Number, required: true },
    background: { type: String, required: true }, present: { type: Boolean, required: true }, mounted: { type: Boolean, required: true },
  },
  setup(props, { slots }) {
    const element = useSurfaceRef({ id: props.id });
    const record = ({ status, reason }: TransitionResult) => { caseCompletions.push({ status, reason, presence: props.id }); };
    return () => h("section", { ref: element, id: props.id, style: { position: "absolute", left: `${props.x}px`, top: "270px", width: "160px", height: "130px" } },
      props.mounted ? [h(Presence, { id: props.id, present: props.present, enter: presenceMotion.enter, exit: presenceMotion.exit, onComplete: record }, () => h("div", {
        id: `${props.id}-card`, style: { width: "160px", height: "130px", padding: "8px", boxSizing: "border-box", background: props.background, color: "black", fontSize: "12px" },
      }, slots.default?.()))] : []);
  },
});
const caseLayers = () => [
  scene.ref.mounted ? h(RefLayer, { key: `ref-${scene.ref.generation}`, state: scene.ref }) : null,
  scene.surface.mounted ? h(Surface, {
    key: `surface-${scene.surface.generation}`, id: caseId("surface", scene.surface), decorative: scene.surface.decorative,
    layout: { ...caseGeometry.surface, padding: 8 }, appearance: { background: caseColor(scene.surface), color: "white", fontSize: 12 },
  }, () => caseContent("surface", scene.surface)) : null,
  h(PresenceLayer, { id: "stage", x: 20, background: "rgb(20,170,170)", ...scene.stage }, () => h(Counter, { id: "stage", label: "stage" })),
  scene.host.mounted ? h(PresenceLayer, { id: "host", x: 220, background: "rgb(220,120,20)", present: scene.host.present, mounted: true }) : null,
];

const App = defineComponent({
  setup() {
    onMounted(() => { mounts++; });
    onBeforeUnmount(() => { cleanups++; });
    return () => [
      h(Surface, { id: "panel", layout: { x: 20, y: 20, width: 280, height: 220, padding: 12 }, appearance: { background: "rgb(240,30,60)", color: "black" } }, () => [
        h(Box, { layout: { direction: "column", gap: 8 } }, () => [
          h("strong", { id: "text" }, "Original native controls"),
          h("button", { id: "count", type: "button", onClick: () => count.value++ }, `Count ${count.value}`),
          h("input", { id: "name", "aria-label": "Name", value: name.value, onInput: (event: Event) => { name.value = (event.target as HTMLInputElement).value; } }),
          h("button", { id: "toggle", type: "button", onClick: () => { swatch.value = swatch.value === "blue" ? "yellow" : "blue"; } }, "Swap color"),
        ]),
        h("div", { id: "swatch", style: { position: "absolute", right: "12px", bottom: "12px", width: "60px", height: "40px", background: swatches[swatch.value] } }),
      ]),
      h(Side),
      extra.value ? h(Surface, { id: "extra", layout: { x: 520, y: 20, width: 80, height: 40 }, appearance: { background: "rgb(38,104,215)" } }, () => "Extra") : null,
      ...(withCases ? caseLayers() : []),
    ];
  },
});

const host = (id: string) => document.getElementById(id)!;
const controller: CanvasController = mountCanvasApp({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
}, App);

const Throws = defineComponent({ setup() { return () => { throw new Error("The application failed in its first render"); }; } });
const SecondLayer = () => h(Surface, { id: "second", layout: { x: 10, y: 10, width: 100, height: 60 }, appearance: { background: "rgb(240,30,60)" } }, () => "Second");
const SecondApps = {
  throws: defineComponent({ setup: () => () => [h(SecondLayer), h(Throws)] }),
  healthy: defineComponent({ setup: () => () => h(SecondLayer) }),
};
let secondHosts: ReturnType<typeof createCanvasHosts> | undefined;
async function mountSecond(kind: "throws" | "healthy"): Promise<SecondMount> {
  const frame = host("second");
  secondHosts ??= createCanvasHosts(frame);
  const before = frame.innerHTML;
  let error: string | null = null, second: CanvasController | undefined;
  try { second = mountCanvasApp({ ...secondHosts }, SecondApps[kind]); }
  catch (caught) { error = String(caught); }
  const after = frame.innerHTML, layers = second?.state().layers.map(layer => layer.id) ?? [];
  await second?.dispose();
  return { error, mounted: !!second, layers, before, after };
}

const originalRoot = controller.container, originalInput = document.getElementById("name");
// The Vue page's probe adds the Vue version, the `Presence` results and a badge switch to the shared contract.
interface VueProbe extends CaseProbe {
  state(): ReturnType<CaseProbe["state"]> & { vue: string; badge: boolean; completions: TransitionResult[] };
  /** Shows or hides the side layer's badge; resolves once the DOM is patched, before `Presence` completes. */
  setBadge(present: boolean): Promise<void>;
}
const probe: VueProbe = {
  controller,
  state: () => ({
    ...controller.state(), framework: "vue", vue: version, count: count.value, name: name.value, swatch: swatch.value, mounts, cleanups,
    sameRoot: controller.container === originalRoot, sameInput: document.getElementById("name") === originalInput,
    badge: badge.value, completions: [...completions],
  }),
  // Structural updates through Vue: the `extra` Surface mounts or unmounts in the next flush.
  async addLayer() { extra.value = true; await nextTick(); },
  async removeLayer() { extra.value = false; await nextTick(); },
  async setBadge(present) { badge.value = present; await nextTick(); },
  get cases() { return { ref: { ...scene.ref }, surface: { ...scene.surface }, completions: caseCompletions.map(entry => ({ ...entry })) }; },
  async changeLayer(layer, change) { Object.assign(scene[layer], changed(scene[layer], change)); await nextTick(); },
  async presence(target, change) {
    if (change === "unmount") scene[target].mounted = false;
    else scene[target].present = change === "show";
    await nextTick();
  },
  mountSecond,
  async dispose() { await controller.dispose(); return probe.state(); },
};
window.frameworkProbe = probe;
for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", probe.dispose]] as const) {
  host(id).addEventListener("click", () => { void operation().catch(error => { host("status").textContent = String(error); }); });
}
