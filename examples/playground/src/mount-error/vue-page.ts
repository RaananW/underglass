/**
 * Mounts Vue applications whose first render fails into the frame of `vue-mount-error.html`, for
 * `tests/browser/vue-mount-error.test.mjs` (`window.mountErrorProbe`), and reports what each mount left behind.
 *
 * Before any mount the page starts counting what a mount could leave (`watchMounts` in `leaks.ts`), and records the
 * root containers the runtime creates, so it can tell whether Vue still holds an app in one.
 *
 * `attempt(kind, handler)` mounts into the same hosts every time. Every application renders the `primary` layer
 * first, so a failure comes after a `Surface` has rendered:
 *
 * - `throws`: a component's render function throws;
 * - `setup`: a component's `setup` throws;
 * - `mounted`: a component's `onMounted` hook throws;
 * - `element`: a render function names an element the DOM refuses, which Vue does not handle: its mount throws;
 * - `caught`: an `onErrorCaptured` hook inside the application stops the `throws` error, and the rest renders (the
 *   hook's fallback, `#fallback`, comes with Vue's next update);
 * - `healthy`: nothing throws. Its `Break` button makes a later render throw.
 *
 * With `handler`, the application sets its own `app.config.errorHandler` in `configure`; the errors it received
 * are reported as `handled`.
 */
import { defineComponent, h, onErrorCaptured, onMounted, ref, version, type Component } from "vue";
import { createCanvasHosts, mountCanvasApp, Surface, type CanvasController } from "@underglass/vue";
import { watchMounts } from "./leaks";

declare global { interface Window { mountErrorProbe: unknown } }
type Kind = "throws" | "setup" | "mounted" | "element" | "caught" | "healthy";

const frame = document.querySelector<HTMLElement>("#frame")!;
const hosts = createCanvasHosts(frame);
const watch = watchMounts(frame, hosts);

const failed = () => new Error("The application failed in its first render");
const Throws = defineComponent({ setup: () => () => { throw failed(); } });
const ThrowsInSetup = defineComponent({ setup() { throw failed(); } });
const ThrowsWhenMounted = defineComponent({ setup() { onMounted(() => { throw failed(); }); return () => h("p", "Mounted"); } });
const RefusedElement = defineComponent({ setup: () => () => h("1refused") });
const Boundary = defineComponent({
  setup(_, { slots }) {
    const caught = ref(false);
    onErrorCaptured(() => { caught.value = true; return false; });
    return () => caught.value ? h("p", { id: "fallback" }, "The boundary caught it") : slots.default?.();
  },
});
const Counter = defineComponent({
  setup() {
    const count = ref(0), broken = ref(false);
    return () => {
      if (broken.value) throw new Error("The application failed after its mount");
      return [
        h("button", { id: "count", type: "button", onClick: () => { count.value++; } }, `Count ${count.value}`),
        h("button", { id: "break", type: "button", onClick: () => { broken.value = true; } }, "Break"),
      ];
    };
  },
});
const Breakable = () => h(Surface, { id: "primary", layout: { x: 40, y: 40, width: 260, height: 200, padding: 16, direction: "column", gap: 8 },
  appearance: { background: "rgb(240, 30, 60)", color: "white" } }, () => h(Counter));
const application = (...rest: Component[]) => defineComponent({ setup: () => () => [h(Breakable), ...rest.map(part => h(part))] });
const applications: Record<Kind, Component> = {
  throws: application(Throws),
  setup: application(ThrowsInSetup),
  mounted: application(ThrowsWhenMounted),
  element: application(RefusedElement),
  caught: application(defineComponent({ setup: () => () => h(Boundary, null, () => h(Throws)) })),
  healthy: application(),
};

let controller: CanvasController | undefined;
let statuses = 0;
let handled: string[] = [];
/** Mounts `kind` into the hosts and returns what the mount threw and what it left, against what was there before. */
function attempt(kind: Kind, handler = false) {
  if (controller) throw new Error("Dispose the mounted application first");
  const from = watch.containers().length;
  const before = watch.snapshot();
  statuses = 0;
  handled = [];
  let mountError: string | null = null;
  try {
    controller = mountCanvasApp({
      ...hosts,
      configure(app) { if (handler) app.config.errorHandler = error => { handled.push(String(error)); }; },
      onStatusChange(status) { statuses++; document.querySelector("#status")!.textContent = `${status.mode}: ${status.reason}`; },
    }, applications[kind]);
  } catch (error) { mountError = String(error); }
  const after = watch.snapshot();
  return {
    vueVersion: version, mountError, mounted: !!controller, statuses, before, after,
    // Each root container this mount created: whether it is still in the document and whether Vue still holds an app in it.
    containers: watch.containers().slice(from).map(container => ({ connected: container.isConnected,
      vueApp: (container as unknown as { __vue_app__?: unknown }).__vue_app__ != null })),
    layers: controller?.state().layers.map(layer => layer.id) ?? [],
    handled: [...handled],
  };
}
const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
async function enable() {
  const state = await controller!.enable();
  await controller!.settle();
  await frames();
  return { mode: state.mode, reason: state.reason, canvas: document.querySelector("#count")?.closest("canvas") === hosts.outputCanvas };
}
async function dispose() {
  await controller?.dispose();
  controller = undefined;
  await frames();
  return watch.snapshot();
}
window.mountErrorProbe = { attempt, enable, dispose, snapshot: watch.snapshot,
  state: () => controller!.state(), handled: () => [...handled],
  box: (id: string) => { const rect = document.getElementById(id)!.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; } };
