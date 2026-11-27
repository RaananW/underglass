import { createCanvasHosts, mountCanvasApp } from "@underglass/react";
import { App } from "./App";
import "./styles.css";

const status = document.getElementById("status")!;

// 1. Underglass adds its canvas and hosts inside this sized element.
const hosts = createCanvasHosts(document.getElementById("stage")!);

// 2. Mount your React app. It starts as ordinary DOM, so it works in every browser.
const controller = mountCanvasApp({
  ...hosts,
  onStatusChange: ({ mode, reason }) => {
    status.dataset.mode = mode;
    status.textContent = mode === "gpu"
      ? "GPU mode: WebGPU is presenting your native controls."
      : mode === "admitting"
        ? "Checking GPU support..."
        : `DOM mode, and the app still works. GPU mode needs Chrome or Edge 157 or later. Reason: ${reason}`;
  },
}, <App />);

// A shader effect on the decorative "art" layer. It is GPU-only: in DOM mode the layer just shows its artwork.
// bounds / interaction / media / fallback are explicit on purpose (see docs/guide/effects.md).
// Set it here, once the mount has returned: the controller is not usable while React renders the first time.
controller.setEffects("art", [{
  kind: "ripple", parameters: { amplitude: 5 }, time: { seconds: 0, playing: true },
  bounds: "layer", interaction: "decorative", media: "identity", fallback: "static",
}]);

// 3. GPU mode is always an explicit choice. enable() never throws for missing
//    browser support: it resolves to "dom" and onStatusChange says why.
void controller.enable();
