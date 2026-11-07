/**
 * Unit tests for the browser capability and input helpers in `packages/core/src/native.ts`, using
 * small fakes for the DOM and the canvas instead of a real browser. Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { capabilities, htmlInCanvasImplementation, waitForPaint, validateGeometry, nativeEditingControl, nativeScrollKind } from "../../packages/core/src/native.ts";

// The polyfill is named only when its own status says it is active; its mere presence (installed where the browser is
// native, or uninstalled again) means the browser's implementation.
test("the HTML-in-Canvas implementation is read from the polyfill's published status", () => {
  assert.equal(htmlInCanvasImplementation(undefined), "native");
  assert.equal(htmlInCanvasImplementation({}), "native");
  assert.equal(htmlInCanvasImplementation({ HTMLInCanvasPolyfill: { polyfilled: true, getStatus: () => ({ polyfilled: true }) } }), "polyfill");
  assert.equal(htmlInCanvasImplementation({ HTMLInCanvasPolyfill: { polyfilled: false, getStatus: () => ({ polyfilled: false }) } }), "native");
  // getStatus is the live answer; the copied property is the fallback when it is missing or throws.
  assert.equal(htmlInCanvasImplementation({ HTMLInCanvasPolyfill: { polyfilled: true, getStatus: () => ({ polyfilled: false }) } }), "native");
  assert.equal(htmlInCanvasImplementation({ HTMLInCanvasPolyfill: { polyfilled: true } }), "polyfill");
  assert.equal(htmlInCanvasImplementation({ HTMLInCanvasPolyfill: { polyfilled: true, getStatus() { throw new Error("broken"); } } }), "polyfill");
  // Only a literal true counts.
  assert.equal(htmlInCanvasImplementation({ HTMLInCanvasPolyfill: { polyfilled: "yes" } }), "native");
});

test("native editing eligibility distinguishes original text controls from viewport targets", () => {
  class Input { type = "text"; disabled = false; isConnected = true; }
  class Textarea { disabled = false; isConnected = true; }
  const document = { defaultView: { HTMLInputElement: Input, HTMLTextAreaElement: Textarea } };
  const input = Object.assign(new Input(), { ownerDocument: document });
  const textarea = Object.assign(new Textarea(), { ownerDocument: document });
  const viewport = { ownerDocument: document, isConnected: true };
  assert.equal(nativeEditingControl(input), true);
  assert.equal(nativeEditingControl(textarea), true);
  assert.equal(nativeScrollKind(input, viewport), "editing");
  assert.equal(nativeScrollKind(viewport, viewport), "enrolled-viewport");
  assert.equal(nativeScrollKind({ ...viewport }, viewport), "descendant-viewport");
  for (const type of ["checkbox", "button", "file", "range", "hidden"]) {
    input.type = type;
    assert.equal(nativeEditingControl(input), false);
  }
  input.type = "text"; input.disabled = true;
  assert.equal(nativeEditingControl(input), false);
  input.disabled = false; input.isConnected = false;
  assert.equal(nativeEditingControl(input), false);
  assert.equal(nativeEditingControl({ ...viewport, ownerDocument: { defaultView: null } }), false);
});

// Support is judged by each API being a callable function, not by a property name merely existing.
test("capability detection accepts functions, not names or dictionary constructors", () => {
  const unavailable = capabilities({ getContext: () => ({}) });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.dialect, "unavailable");
  const canvas = {
    content: "fallback", getContext: () => { throw Error("Must not acquire a 2D owner"); },
    requestPaint() {}, getElementImageDefaultSize() {}, updateElementGeometry() {},
    clearElementGeometry() {}, getElementTransform() {},
  };
  assert.deepEqual(capabilities(canvas), { available: true, missing: [], dialect: "content-drawable" });
  assert.equal(capabilities({ ...canvas, content: undefined }).available, true);
  const { content, ...legacy } = canvas;
  assert.equal(capabilities({ ...legacy, layoutSubtree: true }).available, false);
  canvas.updateElementGeometry = "not a function";
  assert.ok(capabilities(canvas).missing.includes("updateElementGeometry"));
});

// `listeners` is the net number of registered listeners, so a paint listener left behind on any exit path fails the test.
test("paint timeout and request failure remove listeners", async () => {
  let listeners = 0;
  class Canvas extends EventTarget {
    addEventListener(...args) { listeners++; super.addEventListener(...args); }
    removeEventListener(...args) { listeners--; super.removeEventListener(...args); }
    requestPaint() {}
  }
  const canvas = new Canvas();
  await assert.rejects(waitForPaint(canvas, 5), /timed out/);
  assert.equal(listeners, 0);
  canvas.requestPaint = () => { throw new Error("capture unavailable"); };
  await assert.rejects(waitForPaint(canvas, 5), /capture unavailable/);
  assert.equal(listeners, 0);
  canvas.requestPaint = () => canvas.dispatchEvent(new Event("paint"));
  await waitForPaint(canvas, 5);
  assert.equal(listeners, 0);
});

// `validateGeometry` must throw for a non-invertible or non-finite 2D matrix, and for a projective one that is not
// finite, not invertible on its plane, or puts a corner of the layer at or behind the viewer.
test("bad native geometry is rejected atomically", () => {
  const identity = { is2D: true, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  assert.doesNotThrow(() => validateGeometry(identity));
  for (const invalid of [{ a: 0 }, { f: NaN }]) {
    assert.throws(() => validateGeometry({ ...identity, ...invalid }), /finite invertible/);
  }
  // A projective matrix as DOMMatrix exposes it: column-major m11..m44.
  const projective = values => {
    const names = ["m11", "m12", "m13", "m14", "m21", "m22", "m23", "m24", "m31", "m32", "m33", "m34", "m41", "m42", "m43", "m44"];
    return { is2D: false, ...Object.fromEntries(names.map((name, index) => [name, values[index]])), toFloat64Array: () => Float64Array.from(values) };
  };
  // Viewed from 100 px with w = 1 - x / 400 across the layer: valid for a 200 px layer, behind the viewer at 400 px.
  const tilt = [1, 0, 0, -1 / 400, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.doesNotThrow(() => validateGeometry(projective(tilt), { width: 200, height: 100 }));
  assert.throws(() => validateGeometry(projective(tilt), { width: 400, height: 100 }), /in front of the viewer/);
  assert.throws(() => validateGeometry(projective(tilt.map((value, index) => index === 5 ? NaN : value))), /finite projective/);
  assert.throws(() => validateGeometry(projective(tilt.map((value, index) => index === 0 || index === 3 ? 0 : value))), /invertible/);
});
