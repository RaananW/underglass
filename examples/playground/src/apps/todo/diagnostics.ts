/**
 * Formats a controller status `{ mode, reason }` pair as `category · mode: reason` for the TODO page's status
 * line. The category is inferred by matching the free-text `reason`: GPU active, caller lifecycle, admission,
 * missing capability, authored/framework boundary, or GPU error. Anything unmatched is reported as
 * `authored/framework-boundary`. Display only; nothing branches on the result.
 */
export function rendererDiagnostic(mode: string, reason: string): string {
  // First match wins, so the lifecycle patterns are tested before the broader keyword patterns.
  const category = mode === "gpu" ? "active"
    : /^(?:explicit disable\b|disabled\b|runtime disposed\b|disposed root\b|ordinary DOM (?:startup\b|by default\b))/i.test(reason) ? "lifecycle"
    : /unproven|offscreen|occlud|visible|hit.*probe|initialization slow/i.test(reason) ? "admission"
    : /missing|requires.*requestPaint|canvas.content|navigator.gpu|unavailable/i.test(reason) ? "capability"
    : /unsupported|requires explicit adapter|explicit (?:NativeOverlay boundary|animation ownership)/i.test(reason) ? "authored/framework-boundary"
    : /error|failure|lost|device/i.test(reason) ? "gpu-error"
    : "authored/framework-boundary";
  return `${category} · ${mode}: ${reason}`;
}
