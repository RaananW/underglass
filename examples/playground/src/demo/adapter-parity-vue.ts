/**
 * Entry for `adapter-parity-vue.html`: the places where the Vue adapter must behave as the React one does, under GPU.
 * `window.adapterParity` drives it from `tests/browser/adapter-parity-vue.test.mjs`.
 *
 * Layer `styled` (a `Surface` at (20, 20), 200x120, red) is given a `style`, and so are the `Box` (`#styled-box`,
 * 80x40 at (30, 30), blue or green) and the `NativeScroll` (80x30 at (30, 70)) inside it, the way a JavaScript caller
 * or a cast would pass one: none of them applies it, and Vue warns in development. `#styled-button` swaps the box's
 * appearance between blue and green.
 *
 * Layer `component` (at (240, 20), 160x120, green or blue) is enrolled through a component ref: `useSurfaceRef`'s
 * callback is bound to `RefCard`, whose single root `<section>` is the layer. `#component-button` swaps its colour from
 * the component's own state. `adapterParity.foreignRef()` hands a second, unbound `useSurfaceRef` callback an element
 * of an iframe's realm and returns what it threw.
 *
 * Enrollment errors, for the documented behaviour: `adapterParity.change(name)` makes one refused enrollment and
 * returns where it surfaced. "duplicate" mounts a section whose ref enrolls the taken id `styled` (the ref-callback
 * path), "fragment" mounts a component with a fragment root behind a component ref (also the ref-callback path), and
 * "rename" changes the card's enrollment id to `styled` (the post-flush re-enrollment path). With `?handler` the app's
 * `config.errorHandler` (set through `configure`) records each error and Vue's info string; without it, Vue rethrows.
 */
import { defineComponent, h, nextTick, ref } from "vue";
import { mountCanvasApp, useSurfaceRef, Surface, Box, NativeScroll, type CanvasController, type SurfaceRef } from "@underglass/vue";

const colours = { red: "rgb(240, 30, 60)", blue: "rgb(20, 120, 220)", green: "rgb(20, 200, 90)", yellow: "rgb(250, 200, 20)" };
const boxColour = ref<"blue" | "green">("blue");
const cardColour = ref<"green" | "blue">("green");
// Props passed around the typed API, as plain JavaScript or a cast would.
const untyped = (props: Record<string, unknown>) => props as object;
// A `useSurfaceRef` callback that no template binds, for `foreignRef`.
let spare!: SurfaceRef;
// The refused-enrollment cases `change` can turn on, and the card's enrollment id.
const duplicate = ref(false), fragment = ref(false), cardId = ref("component");
// Errors the app's `config.errorHandler` received (with `?handler`), as plain data.
const handled: { name: string; code?: string; info: string }[] = [];

// A section of its own enrolled under the id the `styled` Surface already has.
const DuplicateSection = defineComponent({
  setup() {
    const section = useSurfaceRef({ id: "styled" });
    return () => h("section", { ref: section, id: "duplicate", style: { position: "absolute", left: "420px", top: "20px", width: "100px", height: "60px" } }, "Duplicate");
  },
});
// A component whose root is a fragment, so it has no single root element to enroll.
const FragmentCard = defineComponent({ setup: () => () => [h("span", "One"), h("span", "Two")] });

// A component with one root element, enrolled through a ref on the component rather than on an element.
const RefCard = defineComponent({
  setup() {
    return () => h("section", {
      id: "component", style: { position: "absolute", left: "240px", top: "20px", width: "160px", height: "120px", padding: "10px", boxSizing: "border-box", background: colours[cardColour.value] },
    }, [h("button", { id: "component-button", type: "button", onClick: () => { cardColour.value = cardColour.value === "green" ? "blue" : "green"; } }, "Swap")]);
  },
});

const App = defineComponent({
  setup() {
    const card = useSurfaceRef(() => ({ id: cardId.value }));
    const fragmentCard = useSurfaceRef({ id: "fragment" });
    spare = useSurfaceRef({ id: "spare" });
    return () => [
      h(Surface, {
        id: "styled", class: "styled-layer", layout: { x: 20, y: 20, width: 200, height: 120, padding: 10 },
        appearance: { background: colours.red }, ...untyped({ style: { backgroundColor: "rgb(250, 0, 250)" } }),
      }, () => [
        h(Box, { id: "styled-box", layout: { width: 80, height: 40 }, appearance: { background: colours[boxColour.value] }, ...untyped({ style: { backgroundColor: colours.yellow } }) }),
        h(NativeScroll, { id: "styled-scroll", layout: { width: 80, height: 30 }, ...untyped({ style: "background-color: rgb(250, 200, 20)" }) }, () => h("span", "Scroll")),
        h("button", { id: "styled-button", type: "button", onClick: () => { boxColour.value = boxColour.value === "blue" ? "green" : "blue"; } }, "Swap"),
      ]),
      h(RefCard, { ref: card }),
      duplicate.value ? h(DuplicateSection) : null,
      fragment.value ? h(FragmentCard, { ref: fragmentCard }) : null,
    ];
  },
});

/** Compile-time checks: a typed `style` is rejected on `Surface`, `Box` and `NativeScroll`, as React's prop types reject it. */
export function rejectedStyleTypes() {
  // @ts-expect-error `style` is not an authored Surface prop.
  h(Surface, { id: "typed", style: { color: "red" } });
  // @ts-expect-error `style` is not an authored Box prop.
  h(Box, { style: { color: "red" } });
  // @ts-expect-error `style` is not an authored NativeScroll prop.
  h(NativeScroll, { style: "color: red" });
}

const host = (id: string) => document.getElementById(id)!;
const controller: CanvasController = mountCanvasApp({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
  configure: new URLSearchParams(location.search).has("handler") ? app => {
    app.config.errorHandler = (error, _instance, info) => { handled.push({ name: (error as Error).name, code: (error as { code?: string }).code, info }); };
  } : undefined,
}, App);

/** What a call threw, as plain data; `undefined` when it returned. */
function thrown(call: () => void) {
  try { call(); return undefined; }
  catch (error) { return { name: (error as Error).name, code: (error as { code?: string }).code, message: (error as Error).message }; }
}
const probe = {
  controller,
  state: () => ({ ...controller.state(), boxColour: boxColour.value, cardColour: cardColour.value }),
  settle: () => controller.settle(),
  /** Hands the unbound callback a `<section>` created in an iframe's document (another realm), then releases it. */
  foreignRef() {
    const frame = document.body.appendChild(document.createElement("iframe"));
    try {
      const element = frame.contentDocument!.createElement("section");
      return { instanceOfHTMLElement: element instanceof HTMLElement, error: thrown(() => spare(element)) };
    } finally { spare(null); frame.remove(); }
  },
  /**
   * Makes one refused enrollment through Vue and waits for Vue's flush. Returns the errors the app's handler received
   * meanwhile and what the flush itself rejected with (Vue rethrows an unhandled error in development).
   */
  async change(name: "duplicate" | "fragment" | "rename") {
    const before = handled.length;
    if (name === "duplicate") duplicate.value = true;
    else if (name === "fragment") fragment.value = true;
    else cardId.value = "styled";
    let flush: ReturnType<typeof thrown> = undefined;
    try { await nextTick(); } catch (error) { flush = thrown(() => { throw error; }); }
    return { handled: handled.slice(before), flush };
  },
};
declare global { interface Window { adapterParity: typeof probe } }
window.adapterParity = probe;
