/**
 * What a visitor's browser can do, judged without starting the GPU: GPU mode itself
 * is still proven by admission when they press Enable. This only decides what to
 * explain up front.
 */
export type Support = "likely" | "chrome-flags" | "unsupported";

/**
 * Guesses up front whether GPU mode can work here: `"likely"` when the HTML-in-Canvas methods and
 * `navigator.gpu` are present, `"chrome-flags"` for another Chromium browser (older than 157, or with
 * the feature off; the name predates 157 and is kept for continuous analytics), else `"unsupported"`. `main.tsx` uses it only to choose the help panel; property presence is
 * never treated as proof, which is why `enable()` still runs functional admission.
 */
export function detectSupport(): Support {
  // The prototype carries the HTML-in-Canvas members when the browser exposes the API.
  const canvas = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const htmlInCanvas = "content" in canvas && typeof canvas.requestPaint === "function" && typeof canvas.updateElementGeometry === "function";
  if (htmlInCanvas && "gpu" in navigator) return "likely";
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  const chromium = brands.some(entry => /Chrom/.test(entry.brand)) || /Chrome\//.test(navigator.userAgent);
  return chromium ? "chrome-flags" : "unsupported";
}

/** The `chrome://flags` entries the help panel offers visitors on Chromium builds older than 157. */
export const flags = [
  { url: "chrome://flags/#canvas-draw-element" },
  { url: "chrome://flags/#enable-experimental-web-platform-features" },
] as const;

/** A short headline for a runtime reason, with an optional next step for the visitor. */
interface Explanation { title: string; hint?: string }
/** Plain-language explanations of runtime reasons; the raw reason stays available as details. */
const known: [RegExp, Explanation][] = [
  // Tested in order against the runtime's reason text (`CanvasStatus.reason`); the first match
  // wins. These only change what the status line says, never what the runtime does.
  [/^Current content=drawable/, { title: "GPU mode is on.", hint: "Every control is still the original React element." }],
  [/Ordinary DOM startup/, { title: "Ordinary DOM is ready.", hint: "GPU mode is experimental and starts only when you enable it." }],
  [/Explicit disable/, { title: "Back in ordinary DOM.", hint: "Same controls, same state. Enable GPU again whenever you like." }],
  [/moveBefore/, { title: "This browser can't move the controls without resetting them.",
    hint: "GPU mode needs Element.moveBefore, which this browser doesn't have yet. The examples keep working as ordinary DOM." }],
  [/canvas\.content|requestPaint|updateElementGeometry|drawElementImageToTexture unavailable|getElementImageDefaultSize/, {
    title: "This browser doesn't have HTML-in-Canvas.", hint: "GPU mode needs Chrome or Edge 157 or later; the steps above say how. The examples keep working as ordinary DOM." }],
  [/WebGPU unavailable|WebGPU adapter unavailable|requestAdapter|No WebGPU/, { title: "WebGPU isn't available.", hint: "Check chrome://gpu and make sure hardware acceleration is on." }],
  [/inside the viewport|explicitly enable again when visible/, { title: "Scroll the stage into view, then enable again.", hint: "The GPU check draws and clicks a tiny probe inside the visible stage." }],
  [/probe failed|hit testing/, { title: "The GPU check couldn't confirm clicks would land correctly.", hint: "Make sure nothing covers the stage, then try again. If it keeps failing, please report your browser build." }],
  [/device lost/i, { title: "The GPU reset.", hint: "This is usually temporary: enable GPU again." }],
  [/paint timed out/, { title: "The browser stopped drawing the stage for a moment.", hint: "Enable GPU again." }],
  [/compilation failed/, { title: "A shader didn't compile.", hint: "The example stays usable in ordinary DOM." }],
  [/Editable\/top-layer/, { title: "An editable region or dialog needs ordinary DOM.", hint: "Close it, then enable GPU again." }],
  [/Pending cleanup|cleanup pending/i, { title: "Finishing GPU cleanup…", hint: "Enable becomes available again in a moment." }],
  [/disposed/i, { title: "This example is disposed.", hint: "Reload the page to start a fresh session." }],
];
/** Explains a runtime reason in plain language; an unrecognised reason is shown as its own title. */
export function explain(reason: string): Explanation {
  return known.find(([pattern]) => pattern.test(reason))?.[1] ?? { title: reason };
}
