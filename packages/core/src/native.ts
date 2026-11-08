/**
 * Typed views of the experimental HTML-in-Canvas canvas API (`DrawableCanvas`, `DrawableContext`,
 * `DrawableQueue`), feature checks, geometry validation and paint waiting. The runtime and renderer
 * use these helpers so the rest of the code does not call the untyped native methods directly.
 */

/** A captured image of an element, as returned by `captureElementImage`. Call `close` to release it. */
export interface ElementSnapshot {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/**
 * An `HTMLCanvasElement` that has the HTML-in-Canvas element methods. `content` is the attribute
 * reflection that switches the canvas into drawable mode; the methods capture child elements as
 * images and set the canvas-space transform and clip that native hit testing uses.
 */
export interface DrawableCanvas extends HTMLCanvasElement {
  content: string;
  getElementImageDefaultSize(element: Element): { width: number; height: number };
  requestPaint(): void;
  captureElementImage(element: Element): ElementSnapshot;
  updateElementGeometry(
    element: Element,
    options: { canvasTransform?: DOMMatrixInit; canvasClip?: DOMRectInit; preserveHitTestOrder?: boolean },
  ): void;
  clearElementGeometry(element: Element): void;
  getElementTransform(element: Element): DOMMatrix;
}

/** A 2D context that has `drawElementImage`. */
export interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(
    image: ElementSnapshot | Element,
    x: number,
    y: number,
    options?: { preserveElementGeometry: boolean },
  ): void;
}

/** Result of `capabilities`: whether the required canvas methods exist, which are missing, and the API dialect. */
export interface CapabilityResult {
  available: boolean;
  missing: string[];
  dialect: "content-drawable" | "unavailable";
}

/**
 * Reports whether `canvas` has `content` and the paint, size and geometry methods (not `captureElementImage`). This is only a
 * presence check; admission still proves behaviour with functional probes (see `admission.ts`).
 */
export function capabilities(canvas: HTMLCanvasElement): CapabilityResult {
  // Do not acquire a 2D context: this canvas owns the WebGPU output.
  const required = ["requestPaint", "getElementImageDefaultSize", "updateElementGeometry", "clearElementGeometry", "getElementTransform"];
  const missing = required.filter((key) => typeof Reflect.get(canvas, key) !== "function");
  const dialect = "content" in canvas ? "content-drawable" : "unavailable";
  if (dialect === "unavailable") missing.push("canvas.content");
  return { available: missing.length === 0, missing, dialect };
}

/**
 * Which HTML-in-Canvas implementation admission tested: the browser's own, or
 * `@underglass/html-in-canvas-polyfill`, which emulates the API in JavaScript and paints a few frames late. Reported as `state().htmlInCanvas` so a diagnosis or bug report names it.
 */
export type HtmlInCanvasImplementation = "native" | "polyfill";

/** The polyfill's page global: its current status, published on every install and uninstall. */
interface PolyfillGlobal { polyfilled?: unknown; getStatus?(): { polyfilled?: unknown } }

/**
 * Reads whether `view` runs the HTML-in-Canvas polyfill, from the `HTMLInCanvasPolyfill` global it publishes; core
 * never imports it. Only a status that says `polyfilled: true` counts: the polyfill does nothing where the browser
 * supports the API, and then reports `false`. Like `capabilities`, this names the implementation; admission still
 * proves its behaviour.
 */
export function htmlInCanvasImplementation(view: object | null | undefined): HtmlInCanvasImplementation {
  const polyfill = view ? Reflect.get(view, "HTMLInCanvasPolyfill") as PolyfillGlobal | undefined : undefined;
  if (!polyfill) return "native";
  let status: { polyfilled?: unknown } = polyfill;
  try { if (typeof polyfill.getStatus === "function") status = polyfill.getStatus(); }
  catch { /* A throwing getStatus leaves the status the global itself carries. */ }
  return status?.polyfilled === true ? "polyfill" : "native";
}

/** Switches `canvas` into drawable mode by setting `content="drawable"`. Throws if the reflection is missing or ignored. */
export function enableDrawable(canvas: DrawableCanvas): void {
  if (!("content" in canvas)) throw new Error("Current canvas.content reflection unavailable");
  canvas.content = "drawable";
  if (canvas.content !== "drawable" || canvas.getAttribute("content") !== "drawable") {
    throw new Error("Current canvas.content drawable reflection failed");
  }
}

/** A WebGPU queue with `drawElementImageToTexture`, which uploads an element's pixels directly into a texture. */
export interface DrawableQueue extends GPUQueue {
  drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture }): void;
}

/** True for an enabled, connected textarea or text-like input: a control that natively consumes typing. */
export function nativeEditingControl(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected) return false;
  if (element instanceof view.HTMLTextAreaElement) return !element.disabled;
  return element instanceof view.HTMLInputElement && !element.disabled
    && ["text", "search", "tel", "url", "email", "password", "number"].includes(element.type);
}

/**
 * Classifies a native scroll target: a text editing control, the enrolled element itself, or a
 * scrollable descendant of it.
 */
export function nativeScrollKind(
  target: Element,
  enrolled: Element,
): "editing" | "descendant-viewport" | "enrolled-viewport" {
  if (nativeEditingControl(target)) return "editing";
  return target === enrolled ? "enrolled-viewport" : "descendant-viewport";
}
/** Type guard: the queue has `drawElementImageToTexture`. */
export function isDrawableQueue(queue: GPUQueue): queue is DrawableQueue {
  return typeof Reflect.get(queue, "drawElementImageToTexture") === "function";
}

/** Type guard: `capabilities(canvas)` reports the canvas as available. */
export function isDrawableCanvas(canvas: HTMLCanvasElement): canvas is DrawableCanvas {
  return capabilities(canvas).available;
}

/** Type guard: the 2D context has `drawElementImage`. */
export function isDrawableContext(context: CanvasRenderingContext2D): context is DrawableContext {
  return typeof Reflect.get(context, "drawElementImage") === "function";
}

/**
 * The planar homography a layer matrix applies to its z = 0 plane, as rows: canvas `(X, Y, W)` from local
 * `(x, y, 1)`. For a 2D matrix the last row is `(0, 0, 1)`.
 */
export function homography(matrix: DOMMatrixReadOnly): [number, number, number][] {
  return [[matrix.m11, matrix.m21, matrix.m41], [matrix.m12, matrix.m22, matrix.m42], [matrix.m14, matrix.m24, matrix.m44]];
}
/** Inverse of a 3x3 matrix given as rows; throws when it is (near) singular or not finite. */
export function invertRows(m: [number, number, number][]): [number, number, number][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [[number, number, number], [number, number, number], [number, number, number]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new Error("Native geometry requires an invertible transform");
  const rows: [number, number, number][] = [
    [A / determinant, -(b * i - c * h) / determinant, (b * f - c * e) / determinant],
    [B / determinant, (a * i - c * g) / determinant, -(a * f - c * d) / determinant],
    [C / determinant, -(a * h - b * g) / determinant, (a * e - b * d) / determinant],
  ];
  if (!rows.flat().every(Number.isFinite)) throw new Error("Native geometry requires an invertible transform");
  return rows;
}
/**
 * Throws unless `matrix` is a finite, invertible 2D transform (non-degenerate determinant), or a finite planar
 * projective transform whose homography is invertible and, when `extent` is given, keeps every corner of the
 * layer in front of the viewer.
 */
export function validateGeometry(matrix: DOMMatrixReadOnly, extent?: { width: number; height: number }): void {
  if (matrix.is2D) {
    if (![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)
      || !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c)
      || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) {
      throw new Error("Native geometry requires a finite invertible 2D transform");
    }
    return;
  }
  if (!Array.from(matrix.toFloat64Array()).every(Number.isFinite)) throw new Error("Native geometry requires a finite projective transform");
  const rows = homography(matrix);
  invertRows(rows);
  if (extent && [[0, 0], [extent.width, 0], [0, extent.height], [extent.width, extent.height]]
    .some(([x, y]) => !(rows[2]![0] * x! + rows[2]![1] * y! + rows[2]![2] > 1e-6))) {
    throw new Error("Native geometry requires every corner of a tilted layer in front of the viewer");
  }
}

/**
 * Reads back the transform the browser holds for `element` and throws if it is not a valid transform, does not
 * match `expected` in dimensionality, or differs from it by more than 1e-5 in any of its 16 components.
 */
export function validateAppliedGeometry(canvas: DrawableCanvas, element: Element, expected: DOMMatrixReadOnly): void {
  const actual = canvas.getElementTransform(element);
  validateGeometry(actual);
  const a = actual.toFloat64Array(), b = expected.toFloat64Array();
  if (actual.is2D !== expected.is2D || a.some((value, index) => Math.abs(value - b[index]!) > 1e-5)) {
    throw new Error("Native geometry did not apply the requested transform");
  }
}

/**
 * Requests a native paint and resolves on the canvas's next `paint` event. Rejects on `timeout`
 * (milliseconds), when `signal` aborts, or if `requestPaint` throws; listeners are always removed.
 */
export function waitForPaint(canvas: DrawableCanvas, timeout = 1500, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      canvas.removeEventListener("paint", onPaint);
      signal?.removeEventListener("abort", onAbort);
    };
    const onPaint = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Native paint cancelled", "AbortError"));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Native canvas paint timed out after ${timeout} ms`));
    }, timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
    canvas.addEventListener("paint", onPaint, { once: true });
    try {
      canvas.requestPaint();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
