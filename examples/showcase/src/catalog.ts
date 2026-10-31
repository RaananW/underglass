/**
 * The showcase catalog: the copy for each example card, the studio heading and the "Why the GPU
 * here" panel, plus routing, page metadata (`seo.ts` builds each page's head from it) and search. Pure data with no Underglass imports, so it is shared by
 * `main.tsx` (the page chrome outside the Underglass root), `demos.tsx` and the unit tests.
 */

/**
 * Why each example uses the GPU, stated honestly: what the GPU path does here and
 * what CSS alone would do, including where CSS would be just as good.
 */
export interface GPUReason { headline: string; points: readonly string[]; css: string }

/**
 * Every example, in catalog order. `id` names the example's page (`examples/layers`) and selects the demo in
 * `demos.tsx`; `accent` picks the card's CSS colour class. `as const` keeps the ids as literal types
 * for `ExampleId`, and `satisfies` checks that each entry has a complete `gpu` explanation.
 */
export const examples = [
  { id: "layers", number: "01", title: "Postcard studio", category: "Native controls",
    summary: "Design a postcard with real inputs, radio swatches and stamps. One native React form edits the GPU-presented card.",
    detail: "Type, pick a palette and a stamp, then save. Five surfaces share one compositor; the form, the card and the outbox are the original React controls in both DOM and GPU.",
    accent: "sunset", tags: ["Inputs", "Live layers", "Chromatic"],
    gpu: {
      headline: "A print effect on live artwork, while the form stays native.",
      points: [
        "Riso print shifts the red, green and blue channels of the rendered landscape apart, like a misregistered print run.",
        "Every surface, the form included, is one texture in one WebGPU frame. Typing re-uploads only the layer whose pixels changed.",
      ],
      css: "CSS filters can blur, tint or rotate hues, but none moves one colour channel independently of the others. An SVG filter chain can approximate it, but it isn't programmable per pixel and gets expensive on large areas that keep changing.",
    } },
  { id: "motion", number: "02", title: "Card deck", category: "Motion",
    summary: "Deal, stack, fan and shuffle four layer cards with staggered GPU motion. Like a card mid-flight: its button stays native.",
    detail: "Each arrangement is one declarative transition group, pivoted around card centres. React does not re-render to move a card; with reduced motion the cards go straight to their places.",
    accent: "ocean", tags: ["transitionGroup", "Stagger", "Ripple"],
    gpu: {
      headline: "Cards fly as textures, and the felt table ripples when they land.",
      points: [
        "A moving card only updates a matrix: no style recalculation, layout, repaint or React render per frame.",
        "When an arrangement settles, the table, which is real DOM with text, ripples: its rendered pixels are displaced in a radial wave.",
        "Rotated card edges are antialiased in the shader, and clicks still land on the original Like buttons mid-flight.",
      ],
      css: "Honestly, CSS moves cards just as smoothly: transform and opacity already run on the compositor. What CSS can't do is bend the table's rendered pixels. The nearest equivalent is an animated SVG displacement filter, which is slow across an area this size.",
    } },
  { id: "effects", number: "03", title: "Shader lab", category: "Effects",
    summary: "Chain ripple, chromatic, dissolve and a custom WGSL aurora on decorative artwork, with native sliders for every parameter.",
    detail: "Effects touch only the inert, aria-hidden artwork layer. Ordinary DOM keeps the static original artwork and every control; GPU mode runs the chain in the shared compositor.",
    accent: "aurora", tags: ["setEffects", "defineEffect", "WGSL"],
    gpu: {
      headline: "Per-pixel programs running on a live DOM subtree.",
      points: [
        "Ripple and chromatic move where each pixel samples from; dissolve masks pixels with animated noise.",
        "Aurora is application-written WGSL, compiled at runtime and chained after the built-in effects in one pass.",
        "Sliders change uniforms only. The artwork is captured once, not repainted per frame.",
      ],
      css: "CSS filters are a fixed menu (blur, brightness, hue-rotate…) applied to a whole element. You can't run your own per-pixel code on rendered HTML, and ripple, chromatic split and noise dissolve don't exist as CSS filters.",
    } },
  { id: "presence", number: "04", title: "Notification stack", category: "Presence",
    summary: "Send notifications that slide in and out with Presence while their Dismiss buttons remain ordinary React buttons.",
    detail: "Each slot is a stable surface whose React subtree is retained through its exit motion, then removed. Completion results land in the log. Nothing is cloned to fake an exit.",
    accent: "violet", tags: ["Presence", "Enter / exit", "Ripple"],
    gpu: {
      headline: "Each arrival sends a pulse through the phone screen.",
      points: [
        "A new notification ripples the phone's wallpaper: a displacement of its rendered pixels, timed to the arrival.",
        "The toasts enter and leave as GPU-presented layers; their Dismiss buttons are the original React buttons throughout.",
      ],
      css: "Sliding toasts in and out is easy in CSS. Presence's job here is keeping a React subtree mounted through its exit without clones. The GPU part is the pulse, which CSS can't do to rendered content.",
    } },
  { id: "tasks", number: "05", title: "Small tasks, real controls", category: "Applications",
    summary: "Try the maintained task app: create, search and edit local tasks with native inputs and a detail view.",
    detail: "This is the existing task component, not a duplicate. Tasks live in memory only; switching examples resets their local state.",
    accent: "meadow", tags: ["Forms", "Dialog", "Scrolling"],
    gpu: {
      headline: "The app is unchanged; its artwork reacts to every task.",
      points: [
        "Adding, completing or removing a task sends a ripple through the inert poster beside the app.",
        "The task app is the maintained component, unmodified, presented as GPU layers with native inputs, focus, scrolling and dialog.",
      ],
      css: "In ordinary DOM the app works identically, which is the point: GPU presentation is additive. The ripple has no CSS equivalent.",
    } },
  { id: "pond", number: "06", title: "Webcam pond", category: "Experimental",
    summary: "See yourself reflected in a koi pond. The koi are plain HTML spans, refracted by GPU water. Feed them from a native lily pad.",
    detail: "Optional camera, on your device only: nothing is recorded or sent anywhere. The pond floor, your text, the fish and the reflection are ordinary HTML in one decorative layer; ripple refraction and a custom WGSL water shader run over it on the GPU.",
    accent: "pond", tags: ["Webcam", "Refraction", "Custom WGSL"],
    gpu: {
      headline: "Live HTML and your camera image, refracted and lit as water.",
      points: [
        "The koi are pure HTML: each fish is a <span> drawn with CSS gradients and moved by CSS transitions and animations, no images or canvas. X-ray labels them.",
        "A continuous ripple bends where every pixel samples from, so the text on the floor, the fish and your reflection wobble together like light through water.",
        "A custom WGSL shader adds caustic light, depth tint and glints, compiled while the GPU keeps presenting.",
        "Each camera frame is captured from the original <video> element straight into a GPU texture; the lily pad's buttons stay native while it floats rotated above.",
      ],
      css: "CSS can show a mirrored, semi-transparent video. It can't refract it: there is no way to displace the rendered pixels of video, text and animated elements together in a wave, or to light them with caustics. backdrop-filter offers blur and colour, not distortion.",
    } },
  { id: "fluent", number: "07", title: "Fluent release board", category: "Applications",
    summary: "Stock Fluent UI v9 components that burn away, materialise and take a hit on the GPU, and still work as real controls. Throw cards between lanes on spring physics.",
    detail: "Every control is an unmodified Fluent UI v9 component. Archive a card and the live card burns away; add one and it materialises; open one and its editor, a full Fluent form, grows out of it. During each effect the layer's content is inert, so no click lands on displaced pixels; afterwards it is the same interactive component. Fluent's menus, dropdowns and dialog render in the adapter's overlay host.",
    accent: "fluent", tags: ["Fluent UI", "Transition effects", "Springs"],
    gpu: {
      headline: "Per-pixel transitions on live components, not on pictures of them.",
      points: [
        "Archiving burns the real Fluent card away along a noise front with an ember rim (custom WGSL); adding one materialises it out of a cyan dissolve while it springs out of the panel.",
        "Opening a card grows a full Fluent editor out of it under ripple, chromatic split and a dissolve. Once formed, its inputs, radio group, dropdown and slider work, and every edit updates the card underneath live.",
        "Throw a card hard: it flies on a spring that keeps your release speed and lands with a shockwave through the card itself. Released cards warp into the poster.",
        "While an effect runs, the layer's content is inert and its box still catches clicks, so input never reaches a control the pixels no longer show.",
      ],
      css: "CSS can fade, scale and move a component, and View Transitions can morph between snapshots, but nothing in CSS burns, refracts or splits the channels of live, rendered controls. An animated mask-image with a noise texture comes closest to a dissolve, without the glowing edge or displacement, and View Transition snapshots are frozen pictures. Here the effect runs on the real component's current pixels.",
    } },
  { id: "compare", number: "08", title: "GPU or CSS?", category: "Comparison",
    summary: "Six jobs done twice, side by side: the best CSS technique on the left, Underglass on the right, with a frame meter. One of them is a job where CSS wins.",
    detail: "Pick a comparison, then animate one side at a time and watch the meter. The left pane is CSS: keyframes, SVG filters, color-mix() and backdrop-filter. The right pane is Underglass: one capture of the same HTML and a shader. In ordinary DOM the right pane shows that raw capture.",
    accent: "versus", tags: ["CSS vs GPU", "Frame meter", "Honest"],
    gpu: {
      headline: "The GPU wins when pixels change but content doesn't.",
      points: [
        "Glowing tiles and the 2,052-cell heat map look the same on both sides. CSS re-styles or repaints every element each frame; Underglass captures once and runs one shader pass.",
        "Ripple, channel split and burn are effects CSS can only approximate, with SVG filters re-rendered every frame or with three copies of the content.",
        "Frosted glass is the honest counter-example: backdrop-filter and transform keyframes are already composited by the browser, and Underglass can't blur at all.",
      ],
      css: "Animate transform and opacity with CSS whenever you can: the browser composites them, often off the main thread, with no capture. Reach for Underglass when the effect needs per-pixel work CSS doesn't have, or when many elements change only in how they look.",
    } },
  { id: "strata", number: "09", title: "Strata components", category: "Design system",
    summary: "Every Strata component, from buttons to tables, dialogs and toasts, in one design language that CSS draws flat and the GPU lights in 3D.",
    detail: "Switch tabs to see each group, then pick a level and a theme in the bar. The components are @underglass/ui's React bindings: ordinary DOM with the Strata stylesheet, presented on the GPU by useStrataGpu when GPU mode is on.",
    accent: "strata", tags: ["Components", "Relief", "Objects"],
    gpu: {
      headline: "Depth that is lit, not painted on.",
      points: [
        "Relief: one shader lights every raised face, bevel and well from the same light and casts each control's shadow onto its panel, from the tokens CSS reads too.",
        "Objects: buttons become keys that travel into their bezels when pressed, checkboxes, radios and switches wells with a lit mark, dot or knob standing in them, and sliders a metal rail with a puck. The original controls still take every click and key.",
        "Scene: a lit backdrop behind the panels, panels that settle with a spring, and confetti from Celebrate that falls over the UI without catching a click.",
      ],
      css: "Strata's CSS presentation is the honest baseline, and close to Relief: gradients, inset and drop shadows from the same light tokens. It is what you see without Underglass, with forced colours or with GPU off. CSS can't shade a face per pixel, draw a key that travels into a bezel with a contact shadow, or light controls from an environment.",
    } },
  { id: "instrument", number: "10", title: "Instrument gallery", category: "Design system",
    summary: "Every Instrument component as hardware: knobs, faders, switches, lamps, meters, a jog wheel and a patch bay, plus a synthesiser voice that is wired like the real thing.",
    detail: "Pick a presentation level, a theme and a character, carry the pointer as a light, and browse the catalogue by group. The Synthesiser tab is a whole panel of real controls wired to each other: the knobs and faders set the meter, a patch jack opens the filter and lights its LED, the wheel loads a patch. The controls are native inputs, selects, meters and buttons.",
    accent: "instrument", tags: ["Instrument", "Knobs", "Synthesiser"],
    gpu: {
      headline: "Machined parts, lit by one key light and by the lamps themselves.",
      points: [
        "Instrument: knobs, faders, switch levers and the jog wheel are real meshes (a chamfered cap, a carriage, a lever, a bearing collar) that turn, slide and tip on springs; the native control still takes every click and key.",
        "Light: every lamp, LED, lit ring, display backlight and meter segment is an emitter that lights the faceplate, the parts beside it and the wall past the panel's edge, within the contrast guard. The pointer is one more, carried by the visitor.",
        "Characters: studio is the same markup with other proportions, finishes and springs, one attribute away.",
      ],
      css: "The CSS presentation is the honest baseline: the same tokens draw gradients, inset and drop shadows, so a knob still reads as a knob. CSS cannot light a neighbouring face from a lamp, reflect the faceplate in a metal cap, or turn a mesh on a spring.",
    } },
] as const satisfies readonly { id: string; gpu: GPUReason; [key: string]: unknown }[];

/** The id of one catalog example, such as `"layers"` or `"pond"`. */
export type ExampleId = typeof examples[number]["id"];
/** Maps a location hash (`#/motion`, `#motion` or empty) to an example id; unknown ids open `"layers"`. */
export function route(hash: string): ExampleId {
  const id = hash.replace(/^#\/?/, "");
  return examples.find(example => example.id === id)?.id ?? "layers";
}
/** An example's page path, relative to the site base: `examples/motion`. */
export function examplePath(id: ExampleId) { return `examples/${id}`; }
/**
 * Maps a pathname under `base` (`/underglass/examples/motion`, with an optional `.html` or trailing
 * slash) to its example id. The home page, other paths and unknown ids give `undefined`.
 */
export function exampleFromPath(pathname: string, base: string): ExampleId | undefined {
  if (!pathname.startsWith(base)) return undefined;
  const id = /^examples\/([\w-]+?)(?:\.html|\/)?$/.exec(pathname.slice(base.length))?.[1];
  return examples.find(example => example.id === id)?.id;
}

/** The canonical site: every page's canonical URL, sitemap entry and social card points here. */
export const site = {
  origin: "https://underglass.dev",
  name: "Underglass",
  title: "Underglass: real React controls, painted by the GPU",
  description: "Underglass draws your original React DOM into one shared WebGPU compositor with Chrome's HTML-in-Canvas API, while inputs, focus and clicks stay native.",
  repository: "https://github.com/RaananW/underglass",
  /** The documentation site (`examples/docs`), served beside the showcase on the canonical domain. */
  docs: "https://underglass.dev/docs",
  npm: "https://www.npmjs.com/package/@underglass/react",
  author: { name: "Raanan Weber", url: "https://github.com/RaananW" },
} as const;

/**
 * GPU-mode screenshots (Chrome Canary) in `src/previews/<name>.jpg`, 1041x700: shown to visitors whose
 * browser cannot run GPU mode, and the example page's social card.
 */
export const previews: Partial<Record<ExampleId, string>> = {
  layers: "postcard-studio", motion: "card-deck", effects: "shader-lab", presence: "notification-stack", pond: "webcam-pond",
};

/** The title, description and canonical path (relative to the site root) of the home page or an example page. */
export function pageMeta(id?: ExampleId) {
  if (!id) return { title: site.title, description: site.description, path: "" };
  const example = examples.find(entry => entry.id === id)!;
  return { title: `${example.title} | Underglass examples`, description: example.summary, path: examplePath(id) };
}
/**
 * Filters the catalog by category (`"All"` keeps every category) and by a case-insensitive substring
 * of the title, summary, category and tags. An empty query matches everything.
 */
export function searchExamples(query: string, category: string) {
  const text = query.trim().toLowerCase();
  return examples.filter(example => (category === "All" || example.category === category)
    && `${example.title} ${example.summary} ${example.category} ${example.tags.join(" ")}`.toLowerCase().includes(text));
}
