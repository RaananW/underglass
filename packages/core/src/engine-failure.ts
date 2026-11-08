/**
 * Plain-language diagnosis of an engine-creation failure. Babylon Lite throws terse coded errors (its message is `#<code>`
 * until its error decoder is loaded); the one that means "the browser exposes `navigator.gpu` but has no WebGPU adapter" is
 * `#47` (`WebGPU adapter not available`, thrown when `requestAdapter()` resolves null). That is a factual lack of browser
 * support, so the reason says so instead of leaving the code opaque.
 */
export const NO_WEBGPU_ADAPTER = "WebGPU adapter unavailable (navigator.gpu.requestAdapter() resolved no adapter): this browser or machine has no usable WebGPU adapter";

/** Whether `error` is Babylon Lite's "no WebGPU adapter" error, either as its raw code or already decoded. */
export function isNoAdapterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message === "#47" || message === "WebGPU adapter not available";
}

/** The text after `GPU admission failed: ` for an admission error. */
export function describeAdmissionError(error: unknown): string {
  return isNoAdapterError(error) ? NO_WEBGPU_ADAPTER : String(error);
}
