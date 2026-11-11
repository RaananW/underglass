/**
 * Unit tests for the plain-language engine-failure diagnosis (`packages/core/src/engine-failure.ts`).
 * Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { describeAdmissionError, isNoAdapterError, LITE_NO_ADAPTER_CODE, NO_WEBGPU_ADAPTER } from "../../packages/core/src/engine-failure.ts";
// Lite's message table, read by file path because the package exports only its entry point.
import { decodeLiteError } from "../../node_modules/@babylonjs/lite/lib/error-messages.js";

// Mirrors Babylon Lite's createDevice: `navigator.gpu.requestAdapter()` resolving null throws the bare coded error.
async function createEngineLike(gpu) {
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error(`#${LITE_NO_ADAPTER_CODE}`);
  return adapter;
}

test("the no-adapter code is the installed Babylon Lite's \"WebGPU adapter not available\"", () => {
  // Lite renumbers its codes between releases; this fails on a Lite upgrade that moves the code.
  assert.equal(decodeLiteError(LITE_NO_ADAPTER_CODE, []), "WebGPU adapter not available");
});

test("a null WebGPU adapter is reported as an unavailable adapter, not as an opaque code", async () => {
  const error = await createEngineLike({ requestAdapter: async () => null }).catch(caught => caught);
  assert.equal(String(error), `Error: #${LITE_NO_ADAPTER_CODE}`);
  assert.equal(isNoAdapterError(error), true);
  const reason = `GPU admission failed: ${describeAdmissionError(error)}`;
  assert.match(reason, /^GPU admission failed: WebGPU adapter unavailable/);
  assert.doesNotMatch(reason, /#\d+/);
  assert.ok(reason.includes(NO_WEBGPU_ADAPTER));
});

test("the decoded Babylon Lite message is recognised too", () => {
  assert.equal(isNoAdapterError(new Error("WebGPU adapter not available")), true);
});

test("other engine errors keep their original text", () => {
  assert.equal(describeAdmissionError(new Error("requestDevice failed: device error")), "Error: requestDevice failed: device error");
  assert.equal(isNoAdapterError(new Error("#47")), false);
  assert.equal(isNoAdapterError(undefined), false);
});
