# Effects

Effects are per-pixel GPU programs applied to a **decorative** layer, one that is
inert, `aria-hidden` and has no interactive elements. Keep artwork in its own
decorative `Surface` next to the interactive one. In ordinary DOM the layer simply
shows its original content.

```tsx
<Surface id="art" decorative layout={{ x: 360, y: 20, width: 400, height: 300, overflow: "hidden" }}>
  <Illustration />
</Surface>
```

```tsx
const handle = gpu.setEffects("art", [
  { kind: "ripple", parameters: { amplitude: 6 }, time: { seconds: 0, playing: true },
    bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" },
]);
handle.pause(); handle.seek(1.5); handle.play(); handle.cancel();
```

`bounds`, `interaction`, `media` and `fallback` are explicit on purpose: they state
that the effect stays inside the layer, never touches interactive content, keeps
the media as is, and falls back to the static original. A chain has 1–3 effects,
each kind once. Sampling effects (ripple, chromatic, a custom displacement) come
before colour effects (dissolve, a custom colour function).

| Effect | Parameters | What it does |
| --- | --- | --- |
| `ripple` | `amplitude` 0–12 px | Radial wave that displaces where pixels sample from (refraction) |
| `chromatic` | `displacement` 0–12 px | Shifts the red and blue channels apart |
| `dissolve` | `amount` 0–1, `speed` 0–4 | Animated noise mask over alpha |
| `custom` | your own, up to 4 | Your WGSL: a colour function, or a displacement (below) |

`gpu.setRipple(id, { amplitude, seconds, playing })` is a shortcut for a single
ripple; `setRipple(id, null)` clears it.

## Your own WGSL

```ts
import { defineEffect } from "@underglass/react";

export const sepia = defineEffect({
  name: "sepia-glow",
  parameters: { amount: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let tone = vec3f(dot(color.rgb, vec3f(0.393, 0.769, 0.189)),
                     dot(color.rgb, vec3f(0.349, 0.686, 0.168)),
                     dot(color.rgb, vec3f(0.272, 0.534, 0.131)));
    return vec4f(mix(color.rgb, tone, parameters.x), color.a);`,
});

gpu.setEffects("art", [{ kind: "custom", definition: sepia, parameters: { amount: 0.8 },
  time: { seconds: 0 }, bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" }]);
```

The body is the inside of
`fn(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f`:

- `color` is the layer's pixel.
- `local` is its position in CSS pixels; `extent` is the layer size.
- `parameters` holds your values in declaration order.

It may change colour and alpha but not where a pixel is drawn. For that, define a
displacement.

### Moving pixels

A definition with `geometry: "displacement"` says where each pixel comes from. Its
body is the inside of
`fn(local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec2f`: for the
pixel drawn at `local`, it returns the position in the layer (CSS pixels) to draw
there. Returning `local` changes nothing.

```ts
// Venetian blinds: 24 px slats, each sliding out to the right in turn.
export const blinds = defineEffect({
  name: "blinds",
  parameters: { amount: { min: 0, max: 1 } },
  geometry: "displacement", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let slat = floor(local.y / 24.0);
    let turn = fract(slat * 0.37);
    let gone = clamp(parameters.x * 2.0 - turn, 0.0, 1.0);
    return local - vec2f(gone * extent.x, 0.0);`,
});
```

- A position outside the layer draws nothing, so a displacement can also take pixels
  away (the slats above leave gaps). Nothing is ever drawn outside the layer's box.
- It is a sampling effect: it goes before colour effects, and a chain may hold one
  displacement and one colour function.
- Displaced pixels no longer sit where their controls are. Use it on a decorative
  layer, or on any layer with `interaction: "inert"` for the length of a transition:
  the layer's content takes no input until the effect ends.
- Sampling is bilinear with no mipmaps: magnifying is smooth, strong minification
  can shimmer.
- A material cannot use a displacement.

Both kinds share the rest:

- Definitions are **trusted application code**: up to 4 parameters and 4096
  characters. Never build WGSL from user input.
- A new definition can be applied while GPU is on. It compiles in the background and
  appears when ready; the previous frame stays meanwhile. A compile error returns the
  app to DOM with the compiler message as the reason.
- Changing parameters or time never recompiles.

## Live media

Anything that paints inside the decorative layer is captured, including CSS
animations and `<video>` (a camera stream works too). The showcase's webcam pond
refracts a camera image together with HTML text and CSS-animated fish.

## Materials on interactive layers

A **material** relights a layer without moving any pixel, so it can sit on a layer
with real controls, permanently. It is a second slot next to the effect chain,
applied first:

```tsx
const sheen = defineEffect({
  name: "sheen", geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  parameters: { strength: { min: 0, max: 1 } },
  wgsl: "return vec4f(color.rgb * (1.0 + parameters.x * (1.0 - local.y / extent.y)), color.a);",
});
const material = gpu.setMaterial("card-7", {
  kind: "custom", definition: sheen, parameters: { strength: 0.5 },
  interior: { max: 0.04 },
  bounds: "layer", interaction: "material", media: "identity", fallback: "static",
});
material.update({ strength: 0.2 }); // no recompile
material.cancel();
```

- The layer's controls keep taking clicks, focus and typing. Nothing is made inert.
- **Contrast is protected.** The runtime calls your WGSL with a neutral grey, not
  the layer's pixels, and turns the result into one brightness factor per point,
  limited to `interior.max` (0 to 0.1). Text and the background behind it change
  by the same factor, so a material can shade a card but cannot wash out its text.
- A material stays on the layer when the page returns to ordinary DOM (which shows
  the original) and applies again when GPU comes back. It ends when you cancel or
  dispose it, set another material on the layer, or remove the layer.
- Custom materials need WebGPU and cannot be combined with build-time compiled
  programs, like custom effects.

The built-in `relief` material is the other kind. Instead of WGSL it takes a scene in
the [Strata Rendering Model](../ui-library/rendering-model.md)'s format: relief
primitives (raised keys, wells, grooves, knobs, rings) lit from one light, with bevels,
shadows, finishes and focus edges. Strata's GPU presentation builds these scenes for
you; `handle.update(scene)` changes states such as hover and press without
recompiling.

The `objects` material takes a version 2 scene: the same, plus real 3D objects (keys
that travel when pressed, wells, bezels, spherical knobs) seen through a perspective
camera. Their tops stay exactly on the captured labels, and nothing is ever drawn
outside the control it belongs to, so clicks still land on the real elements.

The `instrument` material takes a version 4 scene: each control becomes real hardware
(knob caps, fader carriages, key caps, switch levers) built from profiles and drawn as
lit meshes after its layer. Set each object's `t` from the control's native value with
`handle.update(scene)`: the parts move with no capture and no change to hit testing.
A part that could leave its control's box at any point of its travel is drawn flat
instead, and `state().materials` says which and by how much
([API](../api.md#the-instrument-material)).

## Transition effects on interactive layers

A layer with real controls can carry an effect **while it is in a transition**:
dissolving away when it is removed, materialising when it appears, or a shockwave when
it lands. Declare `interaction: "inert"` instead of `"decorative"`:

```tsx
const inert = { bounds: "layer", interaction: "inert", media: "identity", fallback: "static" } as const;
const handle = gpu.setEffects("card-7", [
  { kind: "ripple", parameters: { amplitude: 8 }, time: { seconds: 0, playing: true }, ...inert },
  { kind: "dissolve", parameters: { amount: 0, speed: 0 }, time: { seconds: 0 }, ...inert },
]);
// Every frame of the transition:
handle.update([{ amplitude: 8 * (1 - t) }, { amount: t, speed: 0 }]);
// When it ends (or remove the layer):
handle.cancel();
```

- While the handle is active, the layer's content is `inert`: no clicks, focus or
  typing reach it, and focus inside it is lost. The layer's own box still catches
  clicks, so a click on distorted pixels never reaches a control inside or under it.
- Ending the handle (`cancel`, `dispose`, a new `setEffects`, removing the layer or
  returning to ordinary DOM) makes the content interactive again.
- `update` changes parameters every frame without recompiling anything.
- The layer's boundary element must not itself be a control. `Surface` renders a
  `<section>`, which is fine.
- In ordinary DOM nothing is drawn, but the content is still inert until the handle
  ends, so a transition behaves the same in both modes. With reduced motion the
  effect shows its original pixels.
