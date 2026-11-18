# Motion

All motion APIs work in both modes: in DOM mode the same numbers become CSS
transforms, and in GPU mode they only update a matrix. Durations are in
milliseconds. With `prefers-reduced-motion`, motion jumps to its end state.

## Transitions

```tsx
const gpu = useGPUHost();
const handle = gpu.transition("card", {
  keyframes: [{ offset: 0 }, { offset: 1, x: 120, rotation: 10, opacity: 0.8 }],
  timing: { duration: 500, easing: "ease-out" },
});
const result = await handle.finished; // { status: "completed" | "cancelled" | ..., reason }
```

- Keyframes are numeric: `x`, `y`, `rotation` (degrees), `scaleX`, `scaleY` and
  `opacity`. An omitted channel means its identity value, not "keep the previous
  one".
- Layers can also **tilt** out of the screen: `tiltX` and `tiltY` in degrees (at most
  ±60, as CSS `rotateX` and `rotateY`), viewed from `perspective` CSS px (1600 by
  default). Clicks follow the tilted controls exactly. A tilted layer must not sit
  inside a scrolling box that clips it, or clip its own overflow.
- Starting a new transition on the same layer continues smoothly from where the
  current one is.
- Rotation and scale pivot around the layer's `origin`. Set `origin="center"` on the
  `Surface` (or pass `origin` to `useSurfaceRef`) for natural spins.
- While a transition runs, the layer's native controls stay clickable at their
  moving positions.

## Groups and stagger

```tsx
gpu.transitionGroup(cards.map(card => ({ id: card.id, motion: dealTo(card) })), 90);
```

All items start together, offset by the stagger (0–1000 ms), and each has its own
handle. Invalid input fails as a whole, before anything moves.

## Enter and exit with `Presence`

```tsx
<Surface id="toast" layout={...}>
  <Presence id="toast" present={open} enter={slideIn} exit={slideOut}
    onComplete={result => log(result)}>
    <Toast onDismiss={() => setOpen(false)} />
  </Presence>
</Surface>
```

`Presence` keeps its children mounted through the exit motion, then removes them.
The `Surface` stays as a stable layer. The toast's buttons are the real React
buttons the whole time.

## Direct motion

- `controller.animate(id, target, { duration })` interpolates toward a target
  transform on the GPU. It is meant for interactive, imperative motion.
- `controller.setTransform(id, transform)` sets a transform immediately. It is safe to
  call every frame (drag, springs, physics), including while `enable()` is admitting;
  admission presents the latest value.
- Writes are drawn together. Every `setTransform`, effect or material update made in
  one task (an event handler, a frame callback) shows in the same frame, in the state
  the task left, so you can reset a layer and move it again without the reset showing.
  Clicks and `getBoundingClientRect()` follow a transform as soon as it is written
  ([reference](../api.md#when-writes-are-drawn)).
- A `Surface`'s `transform` prop is the resting transform. React updates to it during
  a transition become the end state when that transition finishes.

## Animation ownership (existing CSS or WAAPI animations)

If a layer already has a CSS keyframe animation or a Web Animation of `transform` or
`opacity`, GPU mode needs to own it, because the GPU draws the layer's transform
itself.

- `controller.createMotion(id, descriptor)` creates a managed animation from numeric
  keyframes. Call `.own()` to hand it to the GPU. `play`, `pause` and `seek` work
  either way.
- `controller.ownAnimation(id, animation)` takes over an existing Web Animation;
  `ownCSSAnimation(id, { rule, keyframes })` takes over a CSS animation whose rules
  you point to.
- `playback.release()` hands the source back and returns the surface to DOM.
  `playback.release({ freeze: true })` releases only that layer and keeps GPU on: the
  layer stays at its last pose (WAAPI and `createMotion` sources).

Ownership works while GPU is already on. For new code, prefer `transition` and
`Presence`; ownership exists for animations you cannot rewrite.

## Hidden tabs

Transitions pause while the document is hidden and resume with the same progress.
They never jump to the end.
