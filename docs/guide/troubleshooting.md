# Troubleshooting

When GPU mode is refused or ends, Underglass keeps the app usable in ordinary DOM and
says why. Read it from `controller.state().reason`, from `onStatusChange`, or from
the showcase's **Status** line. Then call `enable()` again once the cause is gone.

## `enable()` stays in DOM

| Reason contains | Meaning | What to do |
| --- | --- | --- |
| `canvas.content` / `requestPaint` / `drawElementImageToTexture` unavailable | The browser lacks HTML-in-Canvas | Use Chrome Canary with the flags in [Getting started](getting-started.md#requirements) |
| `WebGPU unavailable` | No WebGPU adapter | Check `chrome://gpu`; enable hardware acceleration |
| `inside the viewport; explicitly enable again when visible` | The output canvas was off screen during admission | Scroll the stage into view, then `enable()` again |
| `probe failed interior/clipped hit testing (possibly occluded)` | Something covered the probe, or hit testing disagrees with drawing | Make sure no overlay covers the stage's top-left area during `enable()`; report it with your browser build |
| `Layer-count admission budget exceeded` | More layers than `budgets.layers` | Merge layers or raise the budget (up to 64) |

## GPU switches back to DOM

| Reason contains | Rule | Fix |
| --- | --- | --- |
| `Editable/top-layer boundaries` | `contenteditable`, `<dialog>` or `popover` inside a layer | Render it through `NativeOverlay` or `useNativeOverlayHost()` |
| `Unowned/overlapping CSS/WAAPI animation` | An animation of the layer's own transform or opacity | Use `transition` or `createMotion`, or `ownAnimation`; animate descendants instead |
| `Exclusive GPU presentation declarations were changed` | Code wrote `transform`/`opacity` on a layer root | Use the controller (`setTransform`, `transition`) |
| `Custom stacking/clipping` | `z-index` on a layer | Remove it; order layers in the DOM |
| `Content extends beyond enrolled capture bounds` | Visible overflow outside the layer | Clip or scroll the content, or enlarge the layer |
| `canvas-content` | A `<canvas>` inside a layer: this browser build captures a nested canvas blank unless it is the first thing in its layer | Keep the canvas outside enrolled layers, or mark a canvas that may be blank `data-underglass-gpu-canvas="allow"` ([api](../api.md#canvas-inside-a-layer)) |
| `Nested enrollment` | A layer inside a layer | Make them siblings |
| `Zero-sized layer` / `Detached enrolled layer` | A layer collapsed or left the DOM | Give it a size; unmount its `Surface` instead of hiding the element |
| `Transformed viewport ancestors` | A CSS-transformed ancestor around the stage or a layer | Keep transforms on layers, not their containers |
| `Viewport clipping requires positive axis-aligned layer transforms` | A rotated or mirrored layer inside a scrolling or clipping container | Move it out of the container, or keep it axis-aligned there |
| `Rotated layers with clipped overflowing content` | A rotated layer with `overflow: hidden` hiding overflow | Fit the content, or avoid hidden overflow while rotated |
| `Effects are decorative/inert only` | An effect on a layer that became interactive | Keep effects on decorative layers only |
| `compilation failed` | A custom WGSL effect did not compile | Fix the WGSL; the message has line and column |
| `GPU device lost` | The GPU process reset | `enable()` again; this is usually transient |
| `native paint timed out` | The browser stopped painting the canvas (for example a long hidden period or a stuck tab) | `enable()` again |

## Things that look wrong but are not errors

- **Ordinary DOM after page load.** By design: GPU mode always starts from an explicit
  `enable()`.
- **A cut-off shadow around a layer.** The layer is captured at its own size. Move
  the shadow inside it (see [Building components](components.md#4-keep-everything-inside-the-box)).
- **Effects missing in DOM mode.** Effects are GPU-only; DOM mode shows the
  original artwork.
- **Nothing moves with reduced motion.** Transitions jump to their end, effects hold
  still.

## Reporting a problem

Open an issue with the browser build from `chrome://version`, the mode, the full
`reason`, and a minimal component. The bug report template asks for exactly these.
