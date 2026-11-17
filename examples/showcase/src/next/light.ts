/**
 * The light under the glass: in the deck, a soft lamp follows the pointer across the stage, behind the sections. It is
 * one decorative layer with a custom effect. The layer is an empty element an eighth of the stage's size, drawn eight
 * times larger, so its texture is a few thousand pixels however large the stage is: the light is computed by the
 * shader, not captured. With the pointer off the stage the layer draws nothing, so the stage is then exactly what
 * ordinary DOM shows (the static background is the page's own, in both presentations: `next.css`).
 */
import { defineEffect, type CanvasController, type EffectDescriptor, type EffectHandle } from "@underglass/react";

/** How many times larger than its element the light's layer is drawn. */
export const LIGHT_SCALE = 8;
export const LIGHT_ID = "deck-light";

/** A lamp at (`x`, `y`), in the layer's own pixels, of strength `lamp`: a pool of light and a faint ring round it, as a lens throws. */
const lamp = defineEffect({
  name: "next-light",
  parameters: { x: { min: -4096, max: 4096 }, y: { min: -4096, max: 4096 }, lamp: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let d = distance(local, parameters.xy) * ${LIGHT_SCALE}.0;
    let pool = exp(-d * d / 98000.0);
    let ring = exp(-(d - 330.0) * (d - 330.0) / 260.0);
    let light = (pool * 0.11 + ring * 0.045) * parameters.z;
    return vec4f(mix(vec3f(0.62, 0.74, 1.0), vec3f(1.0, 0.62, 0.45), pool), light);`,
});
const chain = (): EffectDescriptor[] => [{ kind: "custom", definition: lamp, parameters: { x: 0, y: 0, lamp: 0 }, time: { seconds: 0 },
  bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" }];

/**
 * Drives the light. `frame` is called by the deck's frame loop while GPU presentation is on: it attaches the effect the
 * first time the runtime takes it, eases the lamp toward the pointer and returns true while it is still moving, so the
 * loop runs only then. `end` forgets the effect (its layer's enrolment is the deck's).
 */
export function createLight(controller: CanvasController, element: HTMLElement, reduced: () => boolean, errors: string[]) {
  let handle: EffectHandle | undefined;
  const pointer = { x: 0, y: 0, inside: false };
  const drawn = { x: 0, y: 0, lamp: 0 };
  let written = "";
  addEventListener("pointermove", event => {
    // A finger hides what is under it, and lifts: the lamp is for a pointer that hovers.
    if (event.pointerType === "touch") return;
    const stage = element.offsetParent?.getBoundingClientRect();
    if (!stage) return;
    pointer.x = event.clientX - stage.left; pointer.y = event.clientY - stage.top;
    pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= stage.width && pointer.y <= stage.height;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.inside = false; });
  return {
    /** True when a pointer move needs a frame: the lamp is not where the pointer is. */
    behind: () => (pointer.inside ? 1 : 0) !== drawn.lamp || (pointer.inside && (Math.abs(pointer.x - drawn.x) > 0.5 || Math.abs(pointer.y - drawn.y) > 0.5)),
    frame() {
      if (!handle) {
        try {
          controller.setTransform(LIGHT_ID, { scaleX: LIGHT_SCALE, scaleY: LIGHT_SCALE });
          const attached = controller.setEffects(LIGHT_ID, chain());
          handle = attached;
          void attached.finished.then(() => { if (handle === attached) { handle = undefined; written = ""; drawn.lamp = 0; } });
        } catch (error) {
          // Not ready for effects in this frame (admission or a swap is in progress): tried again in the next.
          if (/idle DOM or admitted GPU|mount has not completed|Unknown Surface/.test(String(error))) return true;
          errors.push(`light: ${String(error)}`);
          return false;
        }
      }
      const ease = reduced() ? 1 : 0.16, goal = pointer.inside ? 1 : 0;
      // The lamp comes on where the pointer is, not from where it last was.
      if (drawn.lamp < 0.01 && pointer.inside) { drawn.x = pointer.x; drawn.y = pointer.y; }
      if (pointer.inside) { drawn.x += (pointer.x - drawn.x) * ease; drawn.y += (pointer.y - drawn.y) * ease; }
      drawn.lamp += (goal - drawn.lamp) * (reduced() ? 1 : 0.1);
      if (Math.abs(goal - drawn.lamp) < 0.01) drawn.lamp = goal;
      const parameters = { x: Math.round(drawn.x / LIGHT_SCALE * 100) / 100, y: Math.round(drawn.y / LIGHT_SCALE * 100) / 100, lamp: Math.round(drawn.lamp * 1000) / 1000 };
      const text = JSON.stringify(parameters);
      if (text !== written) {
        try { handle.update([parameters]); written = text; } catch { handle = undefined; written = ""; return true; }
      }
      return drawn.lamp !== goal || (pointer.inside && (Math.abs(pointer.x - drawn.x) > 0.5 || Math.abs(pointer.y - drawn.y) > 0.5));
    },
    end() { handle = undefined; written = ""; drawn.lamp = 0; },
  };
}
