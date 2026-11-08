/**
 * Unit tests for the plain-language engine-failure diagnosis (`packages/core/src/engine-failure.ts`).
 * Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { describeAdmissionError, isNoAdapterError, NO_WEBGPU_ADAPTER } from "../../packages/core/src/engine-failure.ts";

// Mirrors Babylon Lite's createEngine: `navigator.gpu.requestAdapter()` resolving null throws the coded error `#47`.
async function createEngineLike(gpu) {
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("#47");
  return adapter;
}

test("a null WebGPU adapter is reported as an unavailable adapter, not as an opaque code", async () => {
  const error = await createEngineLike({ requestAdapter: async () => null }).catch(caught => caught);
  assert.equal(String(error), "Error: #47");
  assert.equal(isNoAdapterError(error), true);
  const reason = `GPU admission failed: ${describeAdmissionError(error)}`;
  assert.match(reason, /^GPU admission failed: WebGPU adapter unavailable/);
  assert.doesNotMatch(reason, /#47/);
  assert.ok(reason.includes(NO_WEBGPU_ADAPTER));
});

test("the decoded Babylon Lite message is recognised too", () => {
  assert.equal(isNoAdapterError(new Error("WebGPU adapter not available")), true);
});

test("other engine errors keep their original text", () => {
  assert.equal(describeAdmissionError(new Error("requestDevice failed: device error")), "Error: requestDevice failed: device error");
  assert.equal(isNoAdapterError(new Error("#48")), false);
  assert.equal(isNoAdapterError(undefined), false);
});
