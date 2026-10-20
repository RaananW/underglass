# The Strata Rendering Model

**Version 4 (Instrument), which includes versions 3 (Scene), 2 (Objects) and 1 (Relief).** Status: versions 1 to 3
are normative; version 4 (part 2D) is a draft. Its reference implementation and `instrument-4.json` have landed
(2026-10-18); it becomes normative once the suite's sampled tolerance is settled against core (2D.10). This document
defines how Strata looks, independently of any engine, shading language or graphics API. Underglass's GPU presentation
is one implementation of it; any other renderer that passes the [conformance suite](#4-conformance) is another.

It has four parts:

1. **[The scene format](#1-the-scene-format):** a versioned JSON description of one layer at one moment.
2. **[The shading model](#2-the-shading-model):** what colour each point of a scene has, as formulas.
3. **[The reference implementation](#3-the-reference-implementation):** the same model as a pure function.
4. **[The conformance suite](#4-conformance):** scenes, sample points and expected colours.

Where the [design language](design-language.md) already fixes a rule (the light vector, shadow offset and softness,
finish zones, state multipliers, the contrast invariant), this document cites it rather than restating its reasons.
The [Phase 4 design](phase4.md#the-strata-rendering-model-an-engine-neutral-standard) explains why the standard
exists and where the engine boundary sits.

**Keywords.** *Must*, *must not* and *may* are used as in RFC 2119.

## 1. The scene format

A scene describes one layer: its size, the one light, the resolved style values, the materials, and the relief
primitives on it. Every value is already resolved for a depth and a theme, so a scene never carries depth or theme
names. Colours come from the **captured content** (the layer's own pixels), never from the scene, except the focus
edge, the backdrop and ring arcs.

- **Schema:** [`strata-scene.schema.json`](../../packages/ui/src/tokens/strata-scene.schema.json) (JSON Schema
  2020-12), exported as `@underglass/ui/scene.schema.json`. `validateScene` in `@underglass/ui/tokens` checks the
  same rules without a schema library.
- **Units:** lengths are layer-local CSS px, with the origin at the layer's top-left corner, x to the right and y
  down. Angles are degrees. Colours are sRGB `#rrggbb`.
- **Resolving from tokens:** `sceneSettings(tokens, { depth, theme })` gives every field except `extent`, `outset` and
  `primitives`.

| Field | Meaning | Token source |
| --- | --- | --- |
| `format`, `version` | `"strata-scene"`, `1`, `2`, `3` or `4` (3: an environment map, 2C.4; 4: Instrument layers, emitters and protected text, 2D) | |
| `camera` | Version 2, required there: `{ distance, vanish }`, the camera objects are seen through (2B.1) | `camera.distance`, the stage |
| `environment` | Version 2: `{ source: "studio", strength }`, default strength 0.6 (2B.7) | |
| `extent` | `{ width, height }`: the layer's border box | the element |
| `outset` | `{ top, right, bottom, left }`, default 0: room drawn outside the extent, for shadows only. It never takes hits. | the renderer |
| `backdrop` | The colour under the layer | `colour.stage` |
| `light` | `{ azimuth, elevation }` | `light.*` |
| `bevel` | `{ width, gain, profile }`, profile one of `quarter-round`, `chamfer`, `cove` | `bevel.*` |
| `shadow` | `{ strength }` | `shadow.strength` |
| `interior` | `{ max }`, at most 0.1: the contrast budget on face interiors | `interior.max` |
| `state` | `{ hoverHeight, pressHeight, hoverLift, pressSink }` | `state.*` |
| `focus` | `{ colour, width, offset }` | `colour.accent`, `focus.*` |
| `materials` | Materials by name, as numeric layers (below) | `material.presets.*` |
| `primitives` | At most 256, **back to front**: a later primitive sits on an earlier one. In version 2 the list may also hold objects (2B). | the DOM (`data-strata-face`) |

**Materials.** Each material has optional layers. Absent parameters take the defaults shown.

| Layer | Parameters (default) | Version 1 |
| --- | --- | --- |
| `base` | `roughness` (1), `metallic` (0) | Shaded |
| `coat` | `strength` (0), `roughness` (0), `ior` (1.5) | Shaded; `ior` reserved |
| `emissive` | `strength` (0) | Above 0, the primitive is **unlit** |
| `sheen`, `iridescence`, `transmission` | as in the design language | **Reserved:** accepted, and ignored |

**Primitives.**

| Field | Meaning |
| --- | --- |
| `face` | `raised`, `well`, `groove`, `knob`, `mark`, `ring` or `flat`, as the [components README](components/README.md#conventions) (*Relief primitives*) defines them |
| `rect` | `[x, y, width, height]`, the element's border box |
| `radius` | Corner radius, default 0, clamped to half the shorter side. A knob is always fully round. |
| `height` | Height above the face for `raised`, `knob` and `mark`. Depth for sunk faces, reserved in version 1. |
| `material` | A key of `materials` |
| `finish` | Default `false`. Whether the material's finish zones apply: only on faces whose text stays clear of them (design language section 4). |
| `state` | `{ hover, pressed, focus, disabled }`, each default `false` |
| `ring` | `ring` only, and required there: `{ thickness, start, sweep, colour }`, with angles clockwise from the top |

Faces fall into three groups:

- **Lifted** (`raised`, `knob`, `mark`) cast shadows and change height with state.
- **Sunk** (`well`, `groove`, `ring`) invert the bevel.
- **Flat** (`flat`) has no bevel and no shadow.

A **groove** is a well. Its narrower bevel follows from the band rule in 2.3.

## 2. The shading model

The model maps a scene, the captured content and a point `p = (x, y)` to a colour.

- **Colour space:** all colour arithmetic is on **sRGB-encoded** channels in 0–1, as in CSS compositing. This is
  deliberate: the token validator measures lit contrast on encoded channels, so its result holds exactly for what
  the model produces (2.9).
- **Points:** a renderer evaluates the model at each device pixel's centre, mapped to CSS px.

### 2.1 Notation

- `clamp(v, a, b)`, `mix(a, b, t) = a + (b − a)·t`.
- `smoothstep(e0, e1, v) = u²(3 − 2u)`, where `u = clamp((v − e0)/(e1 − e0), 0, 1)`.
- `C(p) = (c, a)` is the captured colour, with straight (not premultiplied) alpha. Outside the extent, `a = 0`.
- `B` is the backdrop, `E` the focus colour and `m` is `interior.max`.
- **Light.** `L` is the direction towards the light (design language section 3):

  ```text
  L = (sin az · cos el, −cos az · cos el, sin el)
  ```

- **Half vector.** `H = normalize(L + (0, 0, 1))`, for a viewer straight ahead.

### 2.2 Shapes

Each primitive `i` has a signed distance `dᵢ(p)`, negative inside. Its centre is `(cx, cy)`, the middle of `rect`, and
its half size is `(hw, hh)`.

- **Box faces** (all but `ring`) use a rounded box with radius `r`, clamped to `[0, min(hw, hh)]`:

  ```text
  q = |p − (cx, cy)| − (hw, hh) + (r, r)
  d = length(max(q, 0)) + min(max(q.x, q.y), 0) − r
  ```

  A knob takes `r = min(hw, hh)`. A circle and a pill are boxes with that radius.

- **Ring**, an annulus with outer radius `R = min(hw, hh)` and thickness `t`:

  ```text
  d = | ‖p − (cx, cy)‖ − (R − t/2) | − t/2
  ```

- **Coverage:** `αᵢ = 1 − smoothstep(−0.5, 0.5, dᵢ)`. This is the anti-aliased shape.

### 2.3 Derived values per primitive

Every quantity below derives from the scene and the primitive alone, never from the captured colour.

- **Lit:** a primitive is lit unless its face is `flat`, it is disabled, or its material has `emissive.strength > 0`.
- **Band width** `bᵢ`, the width of the bevel:

  | Primitive | `bᵢ` |
  | --- | --- |
  | Not lit | 0 |
  | Knob | `min(hw, hh)`: the knob is all bevel, a dome, with no interior |
  | Ring | `min(bevel.width, t/2)` |
  | Any other lit face | `min(bevel.width, min(hw, hh))` |

- **Slope sign** `σᵢ`: −1 for sunk faces, +1 otherwise.
- **Profile:** a knob always uses `quarter-round`; every other face uses `bevel.profile`.
- **Cast height** `hᵢ`, for lifted faces that are not disabled. Every other primitive has `hᵢ = 0`.

  ```text
  hᵢ = height · (1 + (hoverHeight − 1)·hover) · (1 − (1 − pressHeight)·pressed)
  ```

  Here `hover` and `pressed` are 1 when the state is set, and 0 otherwise.

- **Material values:** `roughness`, `metallic`, `coat` (the coat's strength) and `coatRoughness`, with the defaults
  in part 1.

### 2.4 Profiles, normals and occlusion

**Position in the band.** Inside the bevel band, the position is `s = clamp(−dᵢ / bᵢ, 0, 1)`: 0 at the outer edge
and 1 where the band meets the interior.

**Slope angle.** The profile gives a slope angle `θ(s)`, with `θmax = 1.2` rad. Each profile has the same mean
slope, `θmax / 2`.

| Profile | `θ(s)` | Shape |
| --- | --- | --- |
| `quarter-round` | `θmax · (1 − s)` | Convex: steepest at the edge, flat where it meets the interior |
| `chamfer` | `θmax / 2` | A flat facet |
| `cove` | `θmax · s` | Concave: flat at the edge, steepest where it meets the interior |

**Narrow bands.** A band narrower than the bevel is a shallower bevel: on every face but a knob, `θ` is scaled by
`min(1, bᵢ / bevel.width)`. A 2 px divider or a tab rail (a 1 px band) is then a shallow groove, not a 1 px wall as
steep as a full bevel's, which reads as a near-black line.

**Normal.**

```text
g = ∇dᵢ / ‖∇dᵢ‖          (the outward direction; (0, 0) where the gradient vanishes)
n = (σᵢ · sin θ · g, cos θ)          (θ after the narrow-band scale)
```

An implementation may take `∇d` analytically, or by central differences with a step of at most 0.5 px. The reference
implementation uses differences of exactly 0.5 px.

**Occlusion.** Primitives are visited back to front. On reaching primitive `i`, every term accumulated so far is
multiplied by `1 − αᵢ`: the bevel light (2.5), the interior offset and finish (2.6), the arc overlay's colour and
alpha (2.7), and the cast shadow (2.8). A primitive therefore hides the relief, and the shadows, of those beneath it;
its own shadow is added after. The focus edge (2.10) is not occluded.

### 2.5 Bevel light

For each lit primitive where `s < 1` (or anywhere on a knob):

```text
f        = max(n · H, 0)
lambert  = n · L − L.z                                  (0 on a flat face)
specular = f^mix(160, 6, roughness) · (1 − roughness) · mix(0.35, 1, metallic)
fresnel  = 0.04 + 0.96 · (1 − clamp(n.z, 0, 1))⁵
coatTerm = coat · (f^mix(90, 10, coatRoughness) · 0.9 + fresnel · 0.6)
shade   += (lambert · bevel.gain · (1 + metallic) + 1.2 · specular + coatTerm) · αᵢ
```

`shade` is added equally to every channel. It brightens the bevel facing the light and darkens the bevel facing away.
Because `σ = −1` inverts the normal, a sunk face is dark on the side nearest the light.

### 2.6 Interior and finish

For each lit primitive where `s ≥ 1`, except a knob, which has no interior:

```text
offset += hoverLift·hover − pressSink·pressed + coat · 0.02 + (1 − roughness) · 0.01
K       = 1 + clamp(offset, −m, m)                      (after every primitive)
```

`K` is the **interior factor**. It is one number for the whole face, so it changes a face and the text on it alike.

**Finish zones.** If the primitive has `finish: true`:

```text
along        = clamp((y − top) / height, 0, 1)
zoneBright, zoneDark = finish(along, { roughness, metallic, coat, coatRoughness })
band         = max(band, zoneBright)
dark         = max(dark, zoneDark)
```

`finish` is the finish-zone profile of the design language (section 4, *Finish zones*). The reference implementation
is `finish()` in `@underglass/ui/tokens`.

### 2.7 Ring arcs

A ring paints its arc in `ring.colour`, unlit and over the content. A disabled ring paints no arc.

1. **Angle:** `φ = atan2(x − cx, −(y − cy))`, in degrees, from 0 to 360, clockwise from the top.
2. **Position along the arc:** `u = (φ − start) mod 360`.
3. **Angular distance to the arc:**
   - inside it (`u ≤ sweep`): `δ = −min(u, sweep − u)`;
   - outside it: `δ = min(u − sweep, 360 − u)`.
4. **Coverage:**

   ```text
   arcᵢ = αᵢ · (1 − smoothstep(−0.5, 0.5, δ · π/180 · (R − t/2)))
   ```

   A sweep of 360 gives `arcᵢ = αᵢ`.
5. **Overlay:** arcs accumulate back to front into one overlay, a premultiplied colour `A` and an alpha `β`, both
   starting at 0:

   ```text
   A = A · (1 − arcᵢ) + ring.colour · arcᵢ
   β = β + arcᵢ · (1 − β)
   ```

The arc's angle is a scene value. Turning it needs no recapture.

### 2.8 Cast shadow

Each primitive with `hᵢ > 0` casts a shadow. The shadow is its own shape moved away from the light by its height
(design language section 7):

```text
o  = −(L.x, L.y) / L.z · hᵢ
Sᵢ = shadow.strength · (1 − smoothstep(−0.5·hᵢ, 1.5·hᵢ + 1, dᵢ(p − o))) · smoothstep(−1, 0.5, dᵢ(p))
S  = max over i of Sᵢ
```

- **Softness:** the shadow softens over `2h + 1` px.
- **Placement:** it falls only outside the caster.
- **Overlap:** overlapping shadows take the darkest, not the sum.

### 2.9 The contrast guard

Text sits on face interiors, and its contrast is an invariant (design language section 8). The guard keeps every
change there within `m`, and keeps it the same for text and face.

1. **Clearance:**

   ```text
   clearance = min over i of (|dᵢ(p)| − bᵢ)
   ```

   A point is beyond every bevel band when its clearance is at least 0.
2. **Weight:**

   ```text
   w = smoothstep(0, 2, clearance)    if p is inside at least one primitive
   w = 0                              otherwise
   ```

   The guard takes hold over a 2 px ramp.
3. **Guarded factor:**

   ```text
   k = clamp(K · (1 − S · g), 1 − m, 1 + m)      g = m / shadow.strength if shadow.strength > m, else 1
   ```

   `g` scales a cast shadow so that it darkens a guarded face by at most `m`. Clamping it instead would cut every
   shadow above `m` off flat, and a tall caster's soft shadow would read as a grey plateau with an edge.

   `k` depends only on geometry and state, never on the captured colour. So a glyph and the face around it are
   scaled by the same `k`.

**What the guard protects.** In the guarded region the content is `c · k` (2.11). The token validator therefore
checks each text pair as captured against the face scaled by `1 ± m`, and with both scaled by `1 ± m`. With the
defaults, every pair keeps at least 4.5:1 in all four themes.

**What is exempt, and why:**

- **Finish zones** (2.6): the design language exempts them, and components keep text clear of them.
- **Ring arcs** (2.7).
- **The focus edge** (2.10): an overlay outside the focused shape.

**Limit.** Within `bᵢ + 2` px of a caster's edge the shadow is not limited. Text placed that close to a raised
control can lose contrast, as it can under the CSS presentation's `box-shadow` today.

### 2.10 Focus edge

For each primitive with `focus` that is not disabled:

```text
edge = max(edge, smoothstep(offset − 0.5, offset + 0.5, dᵢ) · (1 − smoothstep(offset + width − 0.5, offset + width + 0.5, dᵢ)))
```

The edge is an anti-aliased band from `offset` to `offset + width` px outside the shape, in `focus.colour`.

### 2.11 Compositing

Per channel, with `c` the captured channel:

```text
content = mix((c · K + shade) · (1 − S),  c · k,  w)        guard (2.9)
content = content · (1 − β) + A                              arc overlay (2.7)
content = clamp(mix(mix(content, 1, band), 0, dark), 0, 1)   finish (2.6)
out     = content · a + B · (1 − a) · (1 − S)                over the backdrop
out     = clamp(mix(out, E, edge), 0, 1)                     focus edge (2.10)
```

**Drawing over something other than the backdrop.** A renderer that composites onto content other than the
backdrop outputs premultiplied `(content · a, a + S·(1 − a))` before the focus edge, then draws the edge
over that. Over `B`, this gives the same result.

**The outset.** It holds no captured content (`a = 0`), so only shadows and focus edges appear there.

## 2B. Objects (version 2)

Version 2 adds the Objects level: each control's canonical object from [design language section 6](design-language.md#6-objects),
seen through the stage's perspective camera. Objects are **entries of the same back-to-front list** as relief
primitives, so a key on a slab, or a knob in a well, occludes what lies beneath it exactly as a primitive does (2.4).
Everything in part 2 still applies: an object adds a normal, coverage and a cast height where a primitive has its
profile and band.

### 2B.1 Camera, objects and the environment

**Camera.** `camera.distance` is `D`; `camera.vanish` is the vanishing point `V`, the stage's centre in layer-local
px. A point at height `z` drawn at `q` appears on the screen at `V + (q − V) · D / (D − z)`.

**Screen-locking.** A point at height `z` is *screen-locked* when it is placed at `V + (p − V) · (D − z) / D`, so
that it appears exactly at `p`. Solids are built screen-locked (design language section 6): their caps carry the
captured content, texel for pixel.

**Objects.**

| Field | Meaning |
| --- | --- |
| `object` | **Solids:** `key`, `slab`, `bezel`, `well`, `rail`, `mark`. **Domes:** `knob`, `puck`. |
| `rect` | The base: the native control's border box |
| `radius` | A solid's corner radius, clamped to half the shorter side. A dome's footprint is always fully round. |
| `height` | Height above `base`; for a `well`, its depth below it |
| `base` | The height of the surface it stands on, default 0 (a key on a slab stands at the slab's height) |
| `taper` | A solid's inset of its cap from its base |
| `width` | A bezel's ring width (required for a bezel) |
| `travel` | How far a key's or mark's cap sinks when pressed, default 0 |
| `material` | A key of `materials` |
| `colour` | A dome's own colour (required for domes): domes carry no captured content |
| `finish` | Finish zones on a solid's cap |
| `bounds` | The native control's border box, which must contain every drawn pixel; default `rect` |
| `state` | As for primitives |

**Environment.** `environment.source` is `studio` (the only source in the format); `environment.strength` is in 0–1,
default 0.6.

### 2B.2 Derived values per object

- **Heights.** `z0 = base`. A well's cap (its floor) is at `z1 = z0 − height`; every other solid's cap is at
  `z1 = z0 + height · (1 + hover / 4) − travel · pressed` (travel only for keys and marks, at most `height`). A dome's
  apex is at `z1 = z0 + height · (1 + hover / 4)`. Hover (not while disabled) raises the cap by a quarter of the height;
  it does not multiply it, so a tall object's shadow moves as little as a primitive's does. Hit safety (2B.6) checks the
  hovered geometry, the highest an object reaches, so hover never changes how an object is drawn.
- **Lit:** an object is lit unless it is disabled or its material is emissive.
- **Band** `b`, for the guard (2.9): the taper for a lit solid, `min(hw, hh)` for a lit dome, and 0 otherwise.
- **Cast height** `h`, for objects with `z1 > z0` that are not disabled:

  ```text
  h = (z1 − z0) · (1 − (1 − pressHeight)·pressed)
  ```

  Hover is already in `z1`, so `hoverHeight` applies to primitives only. For keys and marks the last factor is 1:
  their travel already lowers `z1`. A well casts nothing.

### 2B.3 Footprints

- A solid's footprint is its rounded box (2.2) with radius `r`. A **bezel**'s is the ring of width `w` just inside it:
  `d = | d_box + w/2 | − w/2`.
- A dome's footprint is its rect's inscribed pill (a box with radius `min(hw, hh)`).
- **Coverage** of a solid is `α = 1 − smoothstep(−0.5, 0.5, d)`, as for primitives. A dome's coverage is its
  silhouette's (2B.5).

### 2B.4 Solids

A solid's base outline and its cap are both screen-locked. On the screen, a point `p` inside the footprint is then:

- on the **cap** where `d ≤ −taper`. The cap is flat, so it takes the interior terms of 2.6 (the state and gloss offset,
  and finish zones when `finish` is set), and the captured content at `p`;
- on a **side** where `−taper < d ≤ 0`. Each side projects into the band between the cap and the base outline, so a
  solid never draws outside its base.

**Side normal.** With `g` the outward direction of the footprint's distance field (2.4):

```text
B  = p − d · g                                  (the base point across the band)
T  = B − taper · g                              (the cap point)
P0 = V + (B − V) · (D − z0) / D                 (both, screen-locked)
P1 = V + (T − V) · (D − z1) / D
Δ  = P1 − P0
n  = normalize((z1 − z0) · g,  −g · Δ)
```

The side facing the vanishing point is steeper than the side facing away. That asymmetry, and the sides' change
with travel, are what perspective adds to Relief's symmetric bevel.

**Light.** Where `−taper < d` (inside the band, or within the half pixel outside it that coverage weighs), a lit side
adds the bevel light of 2.5 with this `n`, plus the environment term (2B.7), times `α`.

### 2B.5 Domes

A dome is the upper half of an ellipsoid with semi-axes `hw`, `hh` and `z1 − z0`, centred on `(cx, cy, z0)`. It is not
screen-locked, so it is ray-cast. The ray through the screen point `p` meets height `z` at `p − u · z`, with
`u = (p − V) / D`. On the ellipsoid that gives a quadratic `a·z² + b·z + c = 0`, with `e = p − (cx, cy)`,
`s = (1/hw², 1/hh², 1/(z1 − z0)²)`:

```text
a = u.x²·s.x + u.y²·s.y + s.z
b = −2·(e.x·u.x·s.x + e.y·u.y·s.y) − 2·z0·s.z
c = e.x²·s.x + e.y²·s.y + z0²·s.z − 1
```

- **Hit:** the higher root `z = (−b + √(b² − 4ac)) / 2a`, valid when `z ≥ z0`. The normal is
  `normalize((e.x − u.x·z)·s.x, (e.y − u.y·z)·s.y, (z − z0)·s.z)`.
- **Coverage:** the smallest normalised radius the ray reaches is `ρ = √max(c − b²/4a + 1, 0)`. The silhouette's
  signed distance is `(ρ − 1) · min(hw, hh)`, and coverage is `1 − smoothstep(−0.5, 0.5, …)` of it, or 0 without a
  valid hit.
- **Colour:** a dome paints its `colour` over the captured content as the surface the light falls on. Domes
  accumulate into one surface overlay, back to front and occluded like arcs (2.7): `U = U·(1 − α) + colour·α`,
  `σ = σ + α·(1 − σ)`.
- **Light:** a lit dome adds the bevel light (2.5) with its normal, plus the environment term, times its coverage.

### 2B.6 Hit safety

Objects never take hits, so the native control's box must contain every pixel an object draws.

- **Solids** draw only inside their base (2B.4). The **taper rule** keeps their sides facing the viewer: at the base
  corner farthest from `V`, at distance `R`,

  ```text
  taper · (D − max(z0, z1)) ≥ |z1 − z0| · R
  ```

- **Domes** must project inside `bounds`: the eight corners of the dome's bounding box (its rect at `z0` and at
  `z1`), projected, lie within it.
- **The hovered geometry is checked** (the highest an object reaches, never pressed), so a state change never moves an
  object across the rule.

An object that breaks its rule is drawn at the **Relief level**: a key, slab, rail or mark as a `raised` primitive (a
mark as a `mark`), a well as a `well`, a dome as a `knob` that keeps its colour on its footprint, and a bezel not at
all (the field's own well remains). It keeps its place in the back-to-front list. A renderer reports such objects.

### 2B.7 The environment

The studio environment is a brightness for a reflected direction: a dark floor rising to a bright ceiling. With the
viewer straight ahead, a normal `n` reflects towards `r.z = 2·n.z² − 1`:

```text
studio(z) = mix(0.18, 0.92, smoothstep(−0.35, 0.65, z))
env       = strength · (studio(r.z) − studio(1)) · mix(0.04, 1, metallic) · (1 − roughness)
```

Like the bevel's Lambert term, it is relative to a flat face: a cap or a dome's apex gets none, so caps keep the
interior budget of 2.9. Steep metal sides reflect the darker horizon.

### 2B.8 Compositing

Domes change the content before light. With the captured `(c, a)` and the surface overlay `(U, σ)`:

```text
a' = a · (1 − σ) + σ
c' = (c · a · (1 − σ) + U) / a'
```

Then 2.11 applies to `(c', a')` unchanged. The guard (2.9) protects caps exactly as it protects face interiors.

## 2C. Scene (version 3)

Version 3 adds the Scene level (design language section 16): decorative 3D around the UI. It takes no hits and
carries no content, so none of its parts is guarded. Its motion is not part of the model: a scene is one moment, and
whatever moves particles from frame to frame (Strata's physics) produces a new scene each frame.

### 2C.1 Stage scenes

A **stage scene** describes one decorative layer that covers the stage. It is a separate format,
`"strata-stage"`, version 3, validated by `validateStageScene`:

| Field | Meaning |
| --- | --- |
| `format`, `version` | `"strata-stage"`, `3` |
| `extent` | `{ width, height }`: the stage, in CSS px |
| `light` | `{ azimuth, elevation }`: the application's one light (2.1) |
| `camera` | `{ distance, vanish }`: as in 2B.1, the vanishing point in stage px |
| `backdrop` | Optional: `{ colour, pool, vignette, tint?, tintStrength? }` (2C.2). Without it the layer is transparent but for its particles. |
| `particles` | At most 256 (2C.3) |

### 2C.2 Backdrop

The stage as a lit surface. With `R` the stage's half-diagonal, `L` the light (2.1) and `C` the stage's centre:

```text
P        = C + (L.x, L.y) · R / 2                         (the pool's centre, towards the light)
pool     = backdrop.pool · (1 − smoothstep(0, R · (0.6 + 0.4 · L.z), ‖p − P‖))
vignette = backdrop.vignette · smoothstep(0.45 · R, 1.1 · R, ‖p − C‖)
base     = mix(colour, tint, tintStrength)                (tint defaults to colour, tintStrength to 0)
out      = clamp(base · (1 + 0.25 · pool − 0.35 · vignette), 0, 1),   opaque
```

### 2C.3 Particles

Each particle is a small card or disc in 3D:

| Field | Meaning |
| --- | --- |
| `shape` | `card` (a rounded rectangle, radius a quarter of its shorter half side) or `disc` (an ellipse) |
| `position` | `[x, y, z]`: its centre, `z` its height above the stage |
| `size` | `[width, height]` |
| `rotation` | Turn about the viewer's axis, degrees clockwise, default 0 |
| `tilt` | `[tx, ty]`: its face tilted about its own x axis, then its own y axis, degrees, default `[0, 0]` |
| `colour`, `opacity` | Its own colour, and 0–1 (default 1) |
| `roughness`, `metallic` | Default 0.6 and 0 |

- **Frame.** The card's axes `u`, `v` and normal `n` are `(1,0,0)`, `(0,1,0)`, `(0,0,1)` rotated about x by
  `tx`, then about y by `ty`, then about z by `rotation`.
- **Where it is seen.** The camera ray through the screen point `p` meets the card's plane at `X`. The card-local
  point is `((X − position) · u, (X − position) · v)`. The particle's signed distance there (its rounded box or
  ellipse, in card px) is scaled to screen px by `D / (D − z)`. Coverage is `(1 − smoothstep(−0.5, 0.5, …)) ·
  opacity`.
- **Light.** Two-sided: `n` is flipped when it faces away from the viewer. With `H` the half vector (2.1):

  ```text
  diffuse  = min(0.55 + 0.45 · max(n · L, 0) / L.z, 1.6)      (1 for a card facing the viewer)
  specular = max(n · H, 0)^mix(160, 6, roughness) · (1 − roughness) · mix(0.35, 1, metallic)
  colour   = clamp(colour · diffuse + specular, 0, 1)
  ```

- **Order.** Particles are drawn farthest first: by ascending `z`, then in list order.

### 2C.4 Environment maps

A version 3 object scene may set `environment` to `{ source: "map", strength, grid }`: brightness in a
32 × 16 equirectangular grid, row by row from the zenith, column 0 at the top of the screen, each value 0–4 (1 matches
the studio's ceiling). For a unit direction `r`:

```text
u = atan2(r.x, −r.y) / 2π + 0.5          (wraps)
v = acos(r.z) / π
map(r) = the grid sampled bilinearly between cell centres at (u · 32 − 0.5, v · 16 − 0.5), rows clamped
env    = strength · (map(r) − map(0, 0, 1)) · mix(0.04, 1, metallic) · (1 − roughness)
```

with `r` the reflected direction of 2B.7. It replaces the studio term; like it, a face towards the viewer gets none.
Loading and downsampling an image into the grid is not part of the model.

### 2C.5 Compositing

A stage scene's colour at a point starts as its backdrop (opaque) or as nothing, and each particle in order goes over
it with straight-alpha "over". Conformance renders stage scenes over white.

## 2D. Instrument (version 4)

Version 4 adds the Instrument level ([design language](design-language.md) sections 3, 4, 6, 7 and 16): each control
is built from parametric parts, posed by native state, lit by the key light, an environment and **emitters**, shadowed
on the face and on other parts, and passed through a post chain before it meets the captured face. Version 4 also
adds emitters and protected text rects to scenes of every level. The
[Instrument plan](instrument.md#rendering-decisions) (decisions 2, 3, 4 and 10) and the
[Phase I0 report](instrument-phase0.md) explain the choices; this part states the rules.

Version 4 is **geometric and sampled**, not colour-exact everywhere:

- **Exact colour** (tolerance 3, as in version 1) wherever the model owns the colour: the face and its relief, the
  shadows parts cast on it, emitter light on it and the guard (2D.4), captured caps (2D.8) and flat glass over text
  (2D.6).
- **Exact geometry** (2D.9): containment over the whole travel, captured caps, protected text unchanged by every stage,
  the clip, and no change to hit geometry.
- **Sampled** (2D.10): the lit colour of parts at named points within a wider tolerance, and the presence of material
  layers whose colour the model does not fix.

Part 2 applies unchanged to an Instrument layer's relief primitives. Version 2 objects (2B) must not appear in an
Instrument scene: a layer has one renderer (design language section 16).

**Motion is not in the model.** A scene is one moment: native state gives each object a position `t` on its travel,
and Strata's springs (design language section 12) produce a new `t` each frame.

### 2D.1 The scene format

A version 4 scene has `version: 4` and may add these fields:

| Field | In | Meaning |
| --- | --- | --- |
| `kind` | any scene | `"relief"` (the default: parts 2 to 2C) or `"instrument"` |
| `emitters` | any scene | At most 64 point lights (2D.4) |
| `protected` | any scene | At most 64 rects `[x, y, width, height]`, the layer's text runs, or `"extent"` to protect the whole extent; with `feather`, default 4 px (2D.4) |
| `camera` | `instrument`, required | `{ distance, vanish }` as in 2B.1, with `distance` by the camera rule (2D.3) |
| `light` | `instrument` | Adds `intensity` (default 1.6) and `ambient` (default 0: the studio is the fill): the key light's strength and the diffuse-only fill (2D.5) |
| `environment` | `instrument`, required | `{ source: "studio", strength, studio, page }` (2D.5); `"none"` is invalid |
| `materials` | `instrument` | Adds `base.colour`, `base.direct` and the layers `reflectance`, `glass`, `dispersion`, `brush`, `grain` and `subsurface` (2D.5) |
| `profiles` | `instrument` | Part shapes by name (2D.2) |
| `objects` | `instrument` | At most 256 Instrument objects (2D.2), with at most 2,048 parts in all |
| `shadow` | `instrument` | Adds `map: { size, bias, darkness }` (2D.7) |
| `post` | `instrument` | `{ smaa, bloom, taa, contact, ssgi }`, booleans, default `true`, `true`, `false`, `false`, `false` (2D.8) |

A version 1 to 3 scene shades the same under version 4, and a version 4 `relief` scene with no `emitters` shades as
its version 3 equivalent.

### 2D.2 Parts, profiles and poses

Coordinates are layer px, x to the right, y down and z towards the viewer, as in part 2 and 2B.1.

**Instrument objects** (`objects`), one per control:

| Field | Meaning |
| --- | --- |
| `id` | Unique in the scene; diagnostics name it |
| `rect` | The base: the native control's border box |
| `bounds` | `{ rect, radius }`: the rounded box that must contain every drawn pixel (2D.9). Default `rect`, radius 0. |
| `t` | The position along the travel, 0–1, default 0: one value for all of the object's moving parts |
| `parts` | Its parts, below |
| `relief` | The Relief primitive drawn instead if the object fails containment (2D.9) |

**Parts** (`objects[].parts`):

| Field | Meaning |
| --- | --- |
| `kind` | A part name from the design language's vocabulary ([section 6](design-language.md#instrument-objects)), or `custom` |
| `profile` | A key of `profiles` |
| `at` | `[x, y, z]`: where the profile's origin stands, `z` the height of the surface below it |
| `pose` | Moving parts only: `{ from, to }`, the poses at the two stops |
| `material` | A key of `materials` |
| `captured` | Default `false`: a cap that carries the layer's capture (2D.8) |
| `glass` | Glass parts only: `"lens"` (lenses and glass caps) or `"window"` (2D.6) |
| `stand` | Lenses only, optional: `{ radius, colour }`, the polished disc the lens stands on (a knob's skirt), centred on the part at the height of its `at` (2D.6) |
| `finish` | `true` for the finish zones (2.6) on a captured cap; `{ band, horizon }` (default 0.3, 0.25) for a window's (2D.6) |
| `caster` | `{ rect, radius, height }`, or `null`: what it casts on the face at the object's `t` (2D.7) |
| `emitter` | An index into `emitters`: the part is that emitter's lens |
| `state` | `{ hover, pressed, focus, disabled }`, for captured caps (2B.2) |
| `anchors` | `custom` parts only: `{ base, pivot, cap, pointer, axis }`, in the part's own units |

**Profiles** (`profiles`) are shapes in part-local px, with the origin at the centre of the part's base:

| Type | Parameters | Builds |
| --- | --- | --- |
| `lathe` | `points: [[r, z, nr, nz], …]`, `segments` | A profile revolved about the part's z axis, with the given normals: caps, skirts, collars, chamfers, nuts, bushings, lenses |
| `prism` | `width`, `length`, `radius`, `height`, `taper`, `chamfer` | A rounded rectangle raised to `height`, its top inset by `taper`, with a `chamfer` at the top edge: carriages, plates, paddles, bezels, caps |
| `extrude` | `outline: [[x, z], …]`, `width` | A side outline extruded across `width`: rocker paddles, levers |
| `mesh` | `positions`, `normals`, `indices`, optional `uvs` | Explicit triangles: custom parts, and any shape the others cannot make |

A profile resolves to triangles through the reference builders (section 3), and **the triangles are the part**. A
renderer draws those triangles, or a refinement whose vertices lie on them, never a finer tessellation of the ideal
surface, which would bulge past the triangles that containment checked.

**Normals and winding.** A part is shaded with its vertex normals, which point out of the part (2D.5); its winding
never decides its light. Every triangle is wound the same way against those normals: in layer axes,
`(b − a) × (c − a)` points against the outward normal. A renderer that culls back faces, or flips their normals (double-sided shading),
relies on that: a triangle wound the other way is shaded as if it faced inward.

**Poses.** A pose is `{ travel, slide, turn, tilt, axis, pivot }`, each default 0:

- `travel`: px along the face normal (negative sinks);
- `slide`: `[dx, dy]`, px in the face plane;
- `turn`: degrees about the face normal, clockwise as seen;
- `tilt`: degrees about the in-plane axis at `axis` degrees clockwise from +x; a positive tilt raises the side at
  `axis + 90°`;
- `pivot`: `[x, y, z]`, part-local: the point `turn` and `tilt` are about.

A moving part takes the pose `mix(from, to, t)` field by field (`axis` and `pivot` are the same at both stops). Its
placement is the rigid transform

```text
M = T(at) · T(slide.x, slide.y, travel) · T(pivot) · R(axis, tilt) · R(z, turn) · T(−pivot)
```

with no scale and no shear. `t` is in 0–1, so a pose never passes a stop.

**Custom parts** are first fitted onto the built-in part's anchors by one uniform scale and a rigid placement
(`fitCustomPart`); everything else in this part then applies to the fitted triangles. Core's version of the fit is a uniform
`scale` and an `offset` on a glTF reference (a vertex `(x, y, z)` of the file becomes `(x, z, y) · scale + offset`); anchors
are the helper's. **What the model fixes for a custom part is presence and containment only:** a part whose triangles are
not there (still loading, failed) is not drawn and not checked, and one that is there is checked on its own vertices
over the whole travel (2D.9) exactly as a built-in part is. Its triangles are wound against its normals (above), it is shaded by
its material (2D.5) and casts as any part does (2D.7); no sampled colour of it is specified.

### 2D.3 Camera and projection

The camera and projection are those of 2B.1: a point `X` appears at `V + (X.xy − V) · D / (D − X.z)`.

- **Drift.** A point at height `h` and distance `r` from `V` moves outward by `drift = r · h / (D − h)`.
- **The camera rule.** `camera.distance` is at least

  ```text
  max(2400, max over parts of r · h / (inset − 0.5) + h)
  ```

  where `r` is the stage's half-diagonal, and `h` and `inset` belong to the part's **binding vertex**: over the whole
  travel, the vertex whose orthographic position comes closest to the edge of `bounds`, at height `h` and `inset` px
  inside it. The rule keeps every vertex at least 0.5 px inside `bounds` on the screen, which 2D.9 relies on.
- **No screen-locking by placement.** Screen-locking (2B.1) is never built into a part's placement. Captured caps read
  the capture at their own pixel instead (2D.8), and every other part keeps its taper.

### 2D.4 Emitters, the face pool and the guard

**Emitters** (`emitters`):

| Field | Meaning |
| --- | --- |
| `position` | `[x, y, z]`, layer px; `z` is the height above the face |
| `colour` | `[r, g, b]`, each 0–1 |
| `strength` | `I`, at least 0 |
| `face` | 0–1, default 1: the share of `I` that lights the face; parts take all of it (the pointer light's is 0.3) |
| `radius` | `R`, greater than 0, px |
| `reach` | `"outset"` (default: the extent and the outset) or `"layer"` (the layer's own content only: the pointer light) |

**The emitter term** at a point `X` with unit normal `n`, per channel:

```text
d = position − X
E = I · colour · max(n · d / ‖d‖, 0) / (π · ‖d‖²) · clamp(1 − (‖d‖² / R²)², 0, 1)²
```

On the face, `X = (x, y, 0)` and `n = (0, 0, 1)`. `Eᶠ(p)` is the sum of the terms of every emitter at `p`, each with
`I` multiplied by its `face`; a `"layer"` emitter's term is multiplied by the captured alpha `a(p)`, so it lights the
layer's own content and nothing beneath it.

**Part shadows on the face.** `Sₚ(p)` is the maximum, over the parts with a `caster`, of 2.8's `Sᵢ` for the caster's
rounded box and height (2D.7).

**The face factor.** Both multiply the layer's result, per channel:

```text
Φ₀ = (1 − Sₚ) · (1 + Eᶠ)
Φᵍ = clamp(Φ₀, (1 − m) / k, (1 + m) / k)          k as in 2.9, or 1 where w = 0
Φ  = mix(Φᵍ, Φ₀, smoothstep(0, feather, q))
```

`q` is the distance from `p` to the nearest protected rect: 0 inside one, and 0 everywhere when `protected` is
`"extent"`. Inside a protected rect the face therefore changes by at most `m` in all (its relief, the shadows of parts
and emitter light together), so the contrast invariant holds under emitters.

**Where it applies:** at every point of the extent and the outset, after 2.11 (the focus edge included):

```text
out = clamp(out · Φ, 0, 1)
```

A renderer that draws over content other than the backdrop multiplies that content too: in the outset, `Φ` lights and
shadows whatever lies beneath the layer. Conformance renders over the backdrop.

**Parts** take the same emitters in their shading (2D.5), with their own normals.

### 2D.5 Materials and the environment

**Material layers** in an Instrument scene, each optional:

| Layer | Parameters (default) | In the model |
| --- | --- | --- |
| `base` | `colour` (`#ffffff`), `roughness` (1), `metallic` (0), `direct` (1) | Shaded |
| `coat` | `strength` (0), `roughness` (0), `ior` (1.5) | Shaded |
| `reflectance` | `f0` (1), `tint` (`#ffffff`) | Shaded: the dielectric `F0` |
| `emissive` | `strength` (0), `colour` (`#ffffff`) | Added, unlit |
| `glass` | `ior` (1.5), `tint` (`[0.84, 0.93, 0.9]`, 0–1 per channel), `absorption` (0.03 per px of path), `reflection` (1.5) | 2D.6 |
| `dispersion` | `strength` (0) | 2D.6 |
| `brush`, `grain`, `sheen`, `iridescence`, `subsurface` | As in the design language | Presence only (2D.10) |

**The reference shading of a part.** Unlike the face (2.1), parts are shaded in linear light, as PBR engines do, and
encoded at the end. The shading is the split-sum approximation as Babylon Lite 1.33 computes it, so that the model
describes what Underglass draws (the [change log](#change-log) records each convention and where Lite's source fixes
it). With `lin` the sRGB decoding, `X` the point, `n` its interpolated normal turned towards the viewer, `C = (V.x, V.y,
D)` the camera, `v = normalize(C − X)`, `h = normalize(v + L)` and `r = reflect(−v, n)`:

```text
ρ      = lin(base.colour)                         albedo = ρ · (1 − 0.04) · (1 − metallic)
F0     = mix(0.04 · f0 · lin(tint), ρ, metallic)  F(c)   = F0 + (1 − F0) · (1 − c)⁵
α      = roughness² + 0.0005                      ndf, vis as GGX and height-correlated Smith at α:
         ndf = α² / (π · ((n · h)² · (α² − 1) + 1)²)
         vis = 0.5 / ((n · L) · √((n · v)² · (1 − α²) + α²) + (n · v) · √((n · L)² · (1 − α²) + α²))
[A, B] = table(n · v, roughness)                  Ec = 1 + F0 · (1 / (A + B) − 1)
key    = intensity · direct · σ · (albedo / π + F(v · h) · ndf · vis · Ec) · max(n · L, 0)
lamp   = the same lobe for each emitter, with E from 2D.4 at (X, n) in place of intensity · cos
fill   = ambient · (1 − metallic) · ρ · (0.5 + 0.5 · n.z)
env    = strength · (E(n) · albedo  +  mix(Lspec(r, α), E(n), α) · (F0 · A + B) · Ec)
out    = encodePart(key + lamp + fill + env + emissive.strength · lin(emissive.colour))
encodePart(c) = x + 0.2 · (x² · (3 − 2x) − x),   x = clamp((0.8 · c)^(1/2.2), 0, 1)
```

- **The key light carries no π:** `intensity` is the irradiance the light gives a surface facing it, so a white
  Lambertian part facing the key light shows `0.96 · intensity / π`.
- **The table** `[A, B]` is the split-sum reflectance: 1,024 GGX half vectors `h_i` at `α_t = roughness'²`
  (`roughness' = max(roughness, 0.04)`, `n · v` at least 0.001) with azimuth `2π i / 1024` and polar angle from the
  base-2 radical inverse of `i`; with `l` the reflection of `v` about `h_i`, `G = vis(l) · (n · l) · 4 (v · h_i) /
  (n · h_i)` and `m = (1 − v · h_i)⁵`, `A = Σ (1 − m) · G / 1024` and `B = Σ m · G / 1024`.
- **The specular environment** `Lspec(r, α)` reads the prefiltered studio at lod `clamp(0.8 · log2(256 · α), 0, 8)`,
  linear between the mips about it. Mip 0 is `studio(r)`. Mip `k ≥ 1` is the prefilter at alpha `q_k = 2^(k / 0.8) /
  256`: `Σ studio(T(ω_i)) · (r · ω_i) / Σ (r · ω_i)` over the reflections `ω_i` of `r` about the 1,024 half vectors at
  `q_k` (with `n = v = r`), `T` as below.
- **The irradiance** `E(n)` is the studio projected on the nine real spherical harmonics over a 512 × 256
  equirectangular grid, convolved with the clamped cosine and divided by π (Babylon's polynomial and its pre-scaled
  harmonics): average radiance, so a uniform studio of 1 gives 1.
- **Lite's environment orientation, `T`:** Lite 1.33 computes mips 1 and up of its specular cube at the directions its
  prefilter shader's face table gives each texel, a 180° turn from the direction WebGPU samples that texel at, so rough
  reflections see `studio(T(ω))`: the 180° turn about the horizontal axis `((cos θ − sin θ), 0, −(sin θ + cos θ)) / √2`
  (layer axes, `θ = studioRotation(light)`), which turns the screen's up to its down. Mirrors (mip 0) and the
  irradiance see the studio where it is. This is an engine defect, followed until it is fixed upstream; the model then
  drops `T` in a new version.
- **Coat** (Lite's clear coat): the base's `F0` is remapped under the coat (`s = √F0`, `a = 1 − ior`, `b = 1 + ior`,
  `F0 ← mix(F0, ((a + b · s) / (b + a · s))², coat)`); with `F꜀(c) = F0꜀ + (1 − F0꜀)(1 − c)⁵`, `F0꜀ = ((1 − ior) / (1 +
  ior))²` and `α꜀ = coat.roughness² + 0.0005`, the key's lobe becomes `lobe · (1 − coat · F꜀(v · h)) + coat · F꜀(v · h)
  · ndf(α꜀) · 0.25 / (v · h)² · (n · L)` (a Kelemen visibility), and `env` becomes `env · (1 − coat · F꜀(n · v)) +
  strength · Lspec(r, α꜀) · (F0꜀ · A꜀ + B꜀) · coat`, with `[A꜀, B꜀] = table(n · v, coat.roughness)`.
- **The map:** `σ` is 1 where the shadow map (2D.7) does not shadow `X`, and `map.darkness` where it does.
- **The fill** is 0 unless the scene sets `light.ambient` (2D.1): the studio is the fill. Page reflections are not part
  of the reference shading (2D.10 checks them by presence).
- **The output transform** `encodePart` is Lite's image processing as Underglass leaves it on an Instrument layer:
  exposure 0.8, gamma 2.2 (not the sRGB curve) and contrast 1.2, applied after the clamp of the gamma-encoded value.
  Lite's HDR loader sets exposure 0.8 and contrast 1.2 when it loads the studio, and core sets the same values
  explicitly after the load (core work item 3), so the transform does not depend on the loader.
- **Emitters** (`lamp`) keep 2D.4's light with this lobe; at the suite's two emitter-lit sampled points (a lamp's and
  the pointer light's plate) core's emitters agree with it within 1.

**The studio.** With `L` the light direction (2.1), `ℓ = √(L.x² + L.z²)`, `up(ω) = −ω.y` (the screen's up) and
`∠(a, b) = acos(clamp(a · b, −1, 1))`:

```text
toKey   = L                                           the softbox, at the key light
toFill  = (−0.937 · L.x / ℓ, 0.35, −0.937 · L.z / ℓ)   across the vertical from the key, below the horizon
toFront = (L.x / ℓ, 0, L.z / ℓ)                       on the key's side, at the horizon
room(ω)   = floor + (ceiling − floor) · smoothstep(−0.35, 0.65, up(ω))
studio(ω) = (room(ω)
             + key   · smoothstep(keyRadius + 0.1, keyRadius, ∠(ω, toKey))
             + 0.5 · fill · smoothstep(0.85, 0.55, ∠(ω, toFill))
             + front · smoothstep(1.3, 0.9, ∠(ω, toFront))
             + strip · smoothstep(0.16, 0.2, up(ω)) · smoothstep(0.38, 0.34, up(ω)))
            · (0.97, 0.99, 1)
```

`studio` holds `floor`, `ceiling`, `key`, `keyRadius`, `fill`, `front` and `strip` (design language section 4). The
function is defined in world directions, so it already lies at the key light: an engine that loads it as an image
rotates the image about the screen's vertical to match.

**The page.** `page: { enabled, size, height }` (default `true`, 512, 300): a cube seen from `height` px in front of the
extent's centre, in which a direction that meets the face plane inside the extent at `Q` sees `lin(c(Q))` where
`a(Q) > 0`, and any other direction sees `studio`. Its filtering is not part of the model.

### 2D.6 Glass

A glass part draws the capture through itself, with its reflection in the same computation, in linear light. With
`d = normalize(X − C)` (from the camera), `n` the glass normal turned towards the viewer, `z` the height of `X`,
`c(q)` the captured colour at layer point `q` (read exactly at the texel when `q` is a texel centre, bilinearly
otherwise), GLSL's `refract` and `reflect`, and one index per channel, `ior − Δ`, `ior` and `ior + Δ` for red, green
and blue, with the spread `Δ = 0.1 · dispersion.strength`:

```text
F0      = ((ior − 1) / (ior + 1))²
Fr(n)   = F0 + (1 − F0) · (1 − (−d · n))⁵
absorb(ℓ) = exp(−(1 − glass.tint) · glass.absorption · ℓ)          per channel, ℓ px of path inside the glass
```

**Reflection.** The radiance `R(X, r)` along the reflected ray `r = reflect(d, n)`:

```text
R = studio(r)                                              if r.z ≥ 0 (away from the face)
R = lin(stand.colour) · studio((r.x, r.y, −r.z))           if the ray meets the stand: G = X + r · (z − b) / (−r.z)
                                                           lies within stand.radius of the part's centre
R = lin(c(X.xy + r.xy · z / (−r.z)))                       otherwise: the face where the ray lands
```

`b` is the height of the part's `at` (the surface it stands on), and `stand` is the part's (2D.2); without one, the
second case does not apply. The studio is evaluated from its definition (2D.5), not from a prefiltered image.

**A lens** (`glass: "lens"`: lenses and glass caps) is a plano-convex lens whose flat bottom lies at `b`. Per channel,
with that channel's index `η`:

```text
t₁ = refract(d, n, 1 / η)                         into the glass
ℓ  = (z − b) / max(−t₁.z, 10⁻³)                   the path to the bottom
Q  = X + ℓ · t₁
t₂ = refract(t₁, (0, 0, 1), η)                    out through the bottom; zero beyond the critical angle
T  = lin(c(Q.xy + t₂.xy · b / max(−t₂.z, 10⁻³)))   where it lands on the face
```

Where the green channel's `t₂` is zero (total internal reflection), the light stays in the glass: `T = (0.015, 0.015,
0.018)` for all three channels and `ℓ = 0`, so the rim shows the dark interior without a per-channel sparkle.
Otherwise `T` takes each channel from its own index, and `ℓ` is the green channel's. Then:

```text
out = enc((1 − Fr(n)) · T · absorb(ℓ) + Fr(n) · environment.strength · glass.reflection · R(X, r))
```

**A window** (`glass: "window"`):

```text
s(n, η) = refract(d, n, η).xy · z / max(−refract(d, n, η).z, 0.15)      where the refracted ray meets z = 0
δ(η)    = s(n, η) − s((0, 0, 1), η)                                      0 wherever the glass is flat
T       = (c(p + δ(1 / (ior − Δ))).r, c(p + δ(1 / ior)).g, c(p + δ(1 / (ior + Δ))).b)
F′      = max(Fr(n) − Fr((0, 0, 1)), 0)
col     = mix(lin(T) · absorb(12 · (1 − n.z)), environment.strength · glass.reflection · R(X, r), F′)
```

A tilted bevel is seen through more glass: 12 px is the nominal path through a pane's bevel. If the window sets
`finish`, its top finish zone is drawn on the glass, with `v` the distance from the window's top and `u` the distance
from its edge on the key light's side (the left when `L.x < 0`), each as a fraction of the window's height and width:

```text
band    = finish.band · smoothstep(0.03, 0.06, v) · (1 − smoothstep(0.06, 0.26, v)) · (1.25 − 0.6 · u)
horizon = finish.horizon · (smoothstep(0.25, 0.27, v) − smoothstep(0.28, 0.31, v))
col     = col · (1 − horizon) + (0.86, 0.9, 0.95) · band
out     = enc(col)
```

- **A window's flat region is exact:** there `δ = 0`, `F′ = 0` and the path is 0, so outside the finish zone the
  pixel is `c(p)`.
- **Text under a window is exact:** inside the scene's protected rects grown by 2 px, a window's pixel is `c(p)`,
  whatever else applies (2D.9).
- **The reflection is traced, not filtered:** the face and the stand are found by intersecting the reflected ray, so a
  renderer whose custom shaders cannot sample a cube still draws it. The page cube (2D.5) is not used for glass.

### 2D.7 Shadows

- **On the face:** each part's `caster` is a rounded box (`rect`, `radius`) at `height` above the face, and casts 2.8's
  `Sᵢ`. The reference resolves it from the part at the object's `t` (`partCaster`): the rounded box bounding the
  part's orthographic footprint, at the part's mean height; a ball is a disc at its centre's height. `Sₚ` (2D.4) takes
  the maximum over parts and multiplies the layer's result, so part shadows and the layer's own relief shadows (2.8)
  combine by product, not maximum: they are drawn in different passes.
- **On parts: the map.** Every part casts into and receives from one shadow map of the key light per layer: an
  orthographic depth map along `−L`, `map.size`² texels, with its depth range fitted to the bounds of the layer's
  parts, compared with `map.bias` (world px) and filtered by percentage-closer filtering. A part point in shadow keeps
  `map.darkness` of its key term (`σ`, 2D.5). The face never receives from the map.
- **Defaults:** `size` 4,096, `bias` 1.95 px, `darkness` 0.1 (design language section 7).
- **Contact shadows and bounced light** are post options (2D.8). The model does not fix their colour; 2D.9 still
  applies with them on.

### 2D.8 Compositing and the post chain

An Instrument layer is drawn in this order:

1. **The layer:** part 2 for its primitives and capture, giving `out` (2.11).
2. **The face factor:** `out = clamp(out · Φ, 0, 1)` over the extent and the outset (2D.4).
3. **The parts** into a target of their own, cleared transparent, with a depth buffer of the layer's parts only:
   premultiplied colour, with alpha the coverage. Captured caps are not drawn here.
4. **The chain** on that target, each stage only when its `post` flag is set, in this order: TAA, contact shadows,
   SSGI, SMAA, bloom. Bloom's source is an emitter target that holds only the lenses of lit emitters.
5. **The clipped composite.** With `M(p)` 1 where the pixel's centre lies inside some object's `bounds` and 0
   elsewhere:

   ```text
   out = parts.rgb · M + out · (1 − parts.a · M) + max(bloom − parts.rgb, 0) · M
   ```

6. **Captured caps,** last. At each pixel a captured cap covers, its colour is a version 2 solid's cap at that pixel
   (2B.4: the captured colour with its interior factor and finish zones, guarded by 2.9), with the part's `state` and
   material. No stage of step 4 reaches it, and neither emitters nor part shadows light it.

With every `post` flag off, the parts may be drawn straight over `out` (steps 3 and 5 without the target): the result
is the same, since every part lies inside its bounds (2D.9).

### 2D.9 Geometric guarantees

These are exact, and a renderer keeps them in every configuration, post options included.

1. **Containment over the whole travel.** For every object and every `t` in 0–1, each pixel a part draws has its
   centre inside `bounds`. The reference decides it (`objectContained`): at `t = k / n` for `k = 0 … n`, with
   `n ≥ 32` and large enough that every vertex's projected path between consecutive steps strays less than 0.5 px from
   the straight segment between them, every vertex of every part projects at least 0.5 px inside `bounds`. A rounded
   box is convex and a triangle projects to the triangle of its projected vertices, so every drawn pixel then lies
   inside at every `t`.
2. **Step-down.** An object that fails 1 is not drawn as parts: its `relief` primitive is drawn in its place in the
   layer's list (part 2), and the renderer reports the object.
3. **Captured caps** are exact (2D.8, step 6) at every `t`, within the version 1 tolerance.
4. **Protected text is unchanged by every stage:** inside protected rects, wherever no part is drawn, the result is
   step 2's `out`, whatever the `post` flags.
5. **The clip:** outside every object's `bounds`, neither the parts nor the chain change a pixel; the result is step
   2's `out`.
6. **The map never reaches the face:** face pixels are the same with the map on and off.
7. **Flat glass over text is exact:** a window's pixels inside protected rects grown by 2 px are the captured colour
   `c(p)`.
8. **No hits, no recapture.** Instrument scenes take no hits. A renderer applies changes of `t`, of emitters (the
   pointer light included) and of `post` as scene data: none recaptures the layer or changes its hit geometry.
   Underglass's browser tests check this with counters; a suite of scenes cannot.

### 2D.10 Sampled guarantees

The colour of a part also depends on what the model does not fix texel for texel: how a renderer stores the prefiltered
environment (texels, mips, filtering), how normals are interpolated, how the shadow map is filtered. Version 4 therefore
checks parts at named points within a tolerance, and checks the layers it does not shade by their presence.

- **Lit colour.** At each sampled point, every channel is within **16** (0–255) of the reference shading (2D.5).
  - **Where points go:** at least 3 px from any silhouette, facet edge, shadow-map edge, protected rect or bloom halo,
    where the reference colour changes by at most 4 levels per px; on parts whose materials use only `base`, `coat`,
    `reflectance` and `emissive`, with `page` off. A case places each material's points where the materials it compares
    differ by at least 24 levels in some channel, so a wrong material fails.
  - **Why 16, measured:** with 2D.5 calibrated to Lite, core's parts (Canary 158.0.8110.0, one RTX 3080, DPR 1 and
    2) lie within these residuals of the reference at the suite's 61 sampled points: median 1, 95th percentile 5,
    maximum 16. Over every unshadowed part pixel 2 px clear of an edge in six of the cases (3,577 pixels, every third
    pixel), the median is 2, the 95th percentile 11 and the 99th 16; per material the median is 0 to 3, and the 95th
    percentile 1 to 15, except polished mirrors (36), whose reflections of the strip's sharp edges move tens of levels
    per pixel, where the placement rule keeps points away. 16 holds every measured point; the one point at 16 (a tilted
    brushed-metal paddle on the dark theme) is the one to explain before the tolerance is tightened. A point Lite misses
    moves or changes material; changing the tolerance is a change of version 4, recorded in the change log.
- **Presence.** For `brush`, `grain`, `sheen`, `iridescence`, `subsurface`, `dispersion`, page reflections, a lens's
  reflection, emitter light on parts and the shadow map, a case renders the feature on and off. At least the case's
  share of the part's pixels changes by at least its number of levels, and nothing changes outside the object's
  `bounds` or inside protected rects. Emitter light is the exception: an emitter lights the face too (2D.4), so its
  check counts the parts only, and the face is checked by the exact points.
- **Mapped shadow.** A part point the map shadows is darker with the map on than off, at most 0.95 of its lit value
  in every channel; a lit part point changes by at most 3.

## 3. The reference implementation

`@underglass/ui/tokens` exports the model as plain TypeScript, with no GPU and no DOM
([`shade.ts`](../../packages/ui/src/tokens/shade.ts), [`scene.ts`](../../packages/ui/src/tokens/scene.ts)). It is
the oracle: written to be read next to this document, not to be fast. Its comments carry the section numbers.

| Export | Purpose |
| --- | --- |
| `shadePoint(scene, captured, x, y)` | The colour at a point, over the backdrop |
| `shadingTerms(scene, x, y)` | The terms `shade`, `K`, `S`, `w`, `band`, `dark`, `edge` and the arcs at a point |
| `renderScene(scene, captured, scale)` | The drawn area (extent plus outset) as RGBA bytes, sampled at device-pixel centres |
| `sceneSettings(tokens, { depth, theme })` | A scene's settings from a token source |
| `validateScene(scene)` | Format checks, matching the JSON Schema |
| `lightVector`, `profileAngle`, `roundedBoxDistance`, `drawnArea` | The model's building blocks |
| `resolveObject`, `objectDistance`, `sideNormal`, `domeHit`, `objectDrawable`, `reliefEquivalent`, `environmentTerm` | The Objects part (2B), in [`objects.ts`](../../packages/ui/src/tokens/objects.ts) |
| `shadeStage`, `backdropColour`, `particleAt`, `particleOrder`, `environmentSample`, `validateStageScene` | The Scene part (2C), in [`stage.ts`](../../packages/ui/src/tokens/stage.ts) |

**Version 4** is [`instrument.ts`](../../packages/ui/src/tokens/instrument.ts), with the premium character's settings in
[`character.ts`](../../packages/ui/src/tokens/character.ts):

| Export | Purpose |
| --- | --- |
| `validateInstrumentScene(scene)` | The fields and limits of 2D.1 and 2D.2: exactly the scenes core's `instrument` material accepts, with its error paths (`InstrumentSceneError`), returning the same normalized copy ([change log](#change-log)) |
| `profileMesh(profile)` | A profile's triangles (2D.2): `lathe`, `prism` and `extrude`, triangle for triangle as core builds them, with a smoothing group per triangle |
| `poseAt(part, t)`, `poseMatrix(part, pose)`, `partMatrix(part, t)`, `posedVertices(part, profile, t)` | Poses and rigid placements (2D.2), `t` clamped at the stops |
| `project(camera, point)`, `drift(camera, point)`, `bindingVertex(object, profiles)`, `cameraDistance(stage, objects, profiles)` | Projection, drift and the camera rule (2D.3) |
| `travelFootprint(object, profiles)`, `boxForTravel(object, profiles)` | The design language's box rule, for validating forms |
| `objectContained(object, scene)`, `steppedDown(scene)` | Containment over the whole travel (2D.9), with the closest approach (part, `t`, vertex, projected inset) and the layer-extent check |
| `emitterTerm(emitter, point, normal)`, `partCaster(part, profile, t)`, `partShadow(scene, x, y)`, `faceFactor(scene, captured, x, y)` | Emitters, part shadows on the face and the guarded face factor `Φ` (2D.4, 2D.7) |
| `studioRadiance(direction, studio, light)`, `studioHdr(studio, light, width)`, `studioRotation(light)` | The studio (2D.5), and the same function as an equirectangular Radiance image (core's canonical frame) with the rotation that brings it to the key light |
| `shadePart(scene, part, point, normal)`, `partTerms(…)`, `encodePart(c)` | The reference shading of a part (2D.5), its linear terms and its output transform |
| `specularEnvironment(r, α, studio, light)`, `studioIrradiance(n, studio, light)`, `reflectanceTable(nv, roughness)`, `environmentTurn(ω, light)` | The split-sum terms of 2D.5: `Lspec`, `E`, `[A, B]` and Lite's orientation `T` |
| `partHit(scene, x, y)`, `mapShadowed(scene, point)` | The part the camera sees at a screen point (its interpolated normal), and whether the shadow map shadows a part point (2D.7) |
| `glassSample(scene, captured, hit, x, y, scale)`, `captureTexture(captured, scale)` | Glass (2D.6), reading the capture as texels at a device scale |
| `shadeFace(scene, captured, x, y)`, `capColour(…)`, `instrumentFaceScene(scene)` | Steps 1, 2 and 6 of 2D.8: the face with `Φ` (stepped-down objects in its list) and captured caps |
| `shadeInstrument(scene, captured, x, y, scale)` | The exactly defined colour at a point (the face with `Φ`, captured caps, flat glass), or the part where only sampling applies |
| `instrumentSettings(tokens, { depth, theme, character })` | An Instrument scene's settings from a token source and a character |

`validateScene` stays at versions 1 to 3: core accepts version 4 only as Instrument scenes, so a version 4 Relief or
Objects scene (emitters and protected rects at those levels) is not validated yet. `fitCustomPart` and `mesh` profiles
are not in the reference implementation: core accepts and draws them (custom parts, work item 5), and the reference
refuses them.

**Where the standard and the reference implementation disagree:** the standard is authoritative. Fix the
implementation, regenerate the suite, and record the change in the [change log](#change-log).

## 4. Conformance

There are four suites, exported from `@underglass/ui/conformance/`:

- [`relief-1.json`](../../packages/ui/conformance/relief-1.json): version 1, Relief.
- [`objects-2.json`](../../packages/ui/conformance/objects-2.json): version 2, Objects. A renderer conforms to version
  2 when it passes both suites.
- [`scene-3.json`](../../packages/ui/conformance/scene-3.json): version 3, Scene: backdrops, particles and an
  environment map. A renderer conforms to version 3 when it passes all three. Stage scenes have no capture and are
  rendered over white.
- [`instrument-4.json`](../../packages/ui/conformance/instrument-4.json): version 4, Instrument. A renderer conforms to
  version 4 when it passes all four ([below](#the-instrument-suite)).

**What a case holds:**

- a scene;
- its `capture`: rounded rectangles painted in order over transparent, which is the layer's content;
- sample points, each with an expected `#rrggbb` colour and a note on what it checks.

The cases cover:

- a floating panel and its shadow;
- buttons at rest, hovered, pressed and disabled;
- a well and a groove;
- a knob on a groove;
- a ring with an arc;
- the focus edge;
- finish zones on lacquer and metal;
- an emissive mark;
- the contrast guard;
- another light direction;
- each bevel profile;
- the dark theme.

The Objects suite covers:

- keys on a slab at rest, hovered, pressed and disabled, seen from one side;
- a slab's cap, sides and shadow;
- a well with a dome knob standing on its floor;
- a bezel around a field, with guarded text;
- a metal rail with a puck;
- objects drawn as their Relief equivalents;
- the environment on metal and matte sides.

**What it means to conform.** A renderer conforms to version 1 when, for every case, it does the following:

1. Presents the case's capture as the layer's content, and renders the scene over its backdrop at a device scale of 1
   (one device pixel per CSS px).
2. Decodes the pixel whose centre is each sample point. Sample points are pixel centres: a bevel changes by several
   units per pixel, so a half-pixel offset alone would exceed the tolerance.
3. Matches `expect` within `tolerance` (3, in 0–255 units) on every channel.

Sample points stay at least 1.5 px from any edge of the captured content, so the result does not depend on how a
renderer anti-aliases the capture.

**How the suite is kept honest:**

- **Where expectations come from:** the reference implementation computes them (`npm run build:conformance
  --workspace @underglass/ui`).
- **Hand checks:** `tests/unit/strata-rendering-model.unit.test.mjs` checks the key points against hand-computed
  values. These include:
  - interiors at `× 1.0055`, `× 1.04` and `× 0.96`;
  - the full shadow at `backdrop × (1 − strength)`;
  - the focus edge and the arc in their exact colours;
  - emissive and disabled faces left as captured;
  - the guard scaling a label and its panel by exactly `1 − m`.
- **Out-of-date suite:** the same test fails while the committed suite differs from what the reference
  implementation produces.

### The Instrument suite

`instrument-4.json` holds cases in the same form, each with more kinds of check than an expected colour, because
version 4 is geometric and sampled (2D):

| Check | What a case gives | How a renderer passes |
| --- | --- | --- |
| `exact` | Points with an expected colour | Within 3 on every channel, as in version 1: the face with `Φ`, captured caps, flat glass |
| `sampled` | Points with the reference shading's colour (2D.5) | Within 12 on every channel (2D.10) |
| `contained` | Objects and the `t` values to render (at least 0, 0.5 and 1) | Every pixel that changes with the parts on against off has its centre inside the object's `bounds` |
| `unchanged` | Rects (protected text, captured caps) and the scene variants to compare | Pixels identical in every variant: `post` flags on and off, the map on and off |
| `presence` | A feature, a region, a share of pixels and a number of levels | The feature on against off changes at least that share by at least that much in the region, and nothing outside the object's `bounds` or inside protected rects |
| `ratio` | Shadowed points and the map variant | At most 0.95 of the lit value with the map on |
| `relief` | Objects that fail containment | Drawn as their `relief` primitive, and reported |

- **Variants:** a case lists named variants of its scene, each a set of dotted paths and values (`objects.0.t`,
  `post`, `shadow.map.darkness`, a material layer); a check names the variant it is rendered in (`base` is the scene
  itself). The map off is `shadow.map.darkness: 1`, which keeps the whole key term.
- **Device scales:** every case is rendered at device scales 1 and 2, since the probes saw differences between them.
  At scale `s` a sample's pixel is the device pixel `floor(at · s)`, layer-local, and `expect[s]` is the reference at
  that pixel's centre. The layer stands on whole device pixels with its vanishing point at `camera.vanish`.
- **Where sampled points go:** each sampled point is placed by the generator from a seed, at the nearest pixel within
  4 px where 2D.10's rule holds at both scales (3 px from silhouettes, smoothing-group edges, mapped-shadow edges and
  protected rects; at most 4 levels per px), and the generator refuses a case whose seed has none. Sampled parts use
  only `base`, `coat`, `reflectance` and `emissive` (brushed metals are sampled in a variant without brush and grain),
  with the page reflection off.
- **The cases** (14): `knob` (a large knob at t = 0, 0.5 and 1, and a detented one on a detent; the cap and the
  polished skirt cone sampled, brush and grain by presence; the parts' shadows on the dial exact), `fader` (both stops
  and mid-travel), `switches` (the `slide`, `rocker`, `bat` and `wall` forms at 0, 0.5 and 1, with a bat whose ball
  binds at mid-travel), `push-buttons` (held and latched, captured labels, the post chain), `lamp` (on and off: the
  face pool, the outset past the panel's edge and the guard), `led-pointer` (an LED and the pointer light over text),
  `glass` (text under a display window, its flat region, its finish band by presence; a lens on a polished stand over
  a printed hub: refraction and magnification sampled, dispersion and its reflection by presence), `presets` (`metal`,
  `polished`, `lacquer`, `gold`, `gunmetal` and `chrome` at points where each differs from the others by 24 levels),
  `preset-domes` (the presets and a matte paint on domes, sampled at their tops and about 30° and 50° from them),
  `shadows` (a lever's mapped shadow on its plate by ratio; a 2 px plate's mapped band, 2.3 px wide, by presence),
  `post-and-clip`, `relief-step-down` (an object whose drift leaves its box and one whose bounds leave the layer, both
  drawn as Relief), `dark` and `light-direction`. Custom parts are not in the suite: core does not accept them yet.
- **Not checked at points,** because the placement rule cannot hold there: the 2.2 px knob pointer and 2 px chamfers
  (containment checks them), a window's finish band (it changes by more than 4 levels per px on a dark display) and
  a 2 px plate's mapped band.
- **Where expectations come from:** the reference implementation (`buildInstrumentConformance` in
  [`instrument-conformance.ts`](../../packages/ui/src/tokens/instrument-conformance.ts), run by the same
  `npm run build:conformance`). `tests/unit/instrument-reference.unit.test.mjs` checks by hand the face pool at a
  point, the guard's limit, flat glass returning the capture texel, the lens's magnification and total internal
  reflection, a binding vertex's projection and the studio's softbox lying at `L`, and fails while the committed suite
  differs from what the reference produces.
- **The sampled tolerance** (16) was measured against Lite by `tests/browser/ui-instrument-conformance.test.mjs`
  (2D.10), which asserts it.

**Underglass and CSS:**

- **Underglass's GPU presentation must conform.** Phase 4 step 2 runs this suite against decoded GPU pixels. For
  version 4, `tests/browser/ui-instrument-conformance.test.mjs` runs `instrument-4.json` the same way against core's
  `instrument` material, at DPR 1 and 2. It asserts the checks whose parts core draws today, emitters and the guard
  included, glass (core work item 4) and the shadow map and the post chain (item 3). Since item 4 no check is pending: a
  check that needs a part core does not draw would be recorded as pending with the item it waits for.
- **The CSS presentation is a declared approximation.** It is bound by the P0.6 parity budget, not by this suite. At
  the Instrument level it is bound by the per-component budgets of [I0.6](instrument-phase0.md#i06-css-parity).

## 5. Scope and versions

- **Version 1 covers the Relief level:** faces, bevels, wells, finishes, shadows, focus and states.
- **Version 2 adds the Objects level** (part 2B): solids and domes, the camera, the studio environment and hit
  safety. A version 1 scene, or a version 2 scene with no objects, shades the same under both.
- **Version 3 adds the Scene level** (part 2C): stage scenes with a backdrop and particles, and environment maps.
- **Version 4 adds the Instrument level** (part 2D): parts and poses, containment over the whole travel, emitters and
  protected text at every level, the studio as radiance, glass over the capture, shadows of parts, the post chain's
  order and clip, and sampled guarantees. `light.intensity` and `light.ambient` are used in Instrument scenes.
  **Status (2026-10-18):** the reference is implemented (`instrument.ts`), the conformance suite is present
  (`instrument-4.json`), and GPU conformance runs against core's `instrument` material: containment, captured caps,
  unchanged text and the clip, Relief step-downs, the face with emitters, the pointer light and the guard, brush,
  grain and emitter light by presence, and every sampled point (with 2D.5 calibrated to Lite, within 16) pass at DPR 1
  and 2; since core work item 4 so do the glass checks (text under a window and its flat region exactly, the lens's centre
  and domes and the stand's reflection within 1 level, the finish band, dispersion and the lens's reflection by presence),
  and no check is pending. The page cube (2D.5 `page`) is not part of the suite: its scenes turn it off.
- **Reserved:** `light.colour` (one white light, as in version 1), `light.intensity` and `light.ambient` outside
  Instrument scenes, the inner shadow of wells, and particle shadows.
- **Not in version 4:** shadows cast by emitters; emitter light on captured caps; a specular term for the pointer
  light on Relief and Objects bevels; the colour of the TAA, contact-shadow and SSGI options (only 2D.9 binds them);
  page reflections in the reference shading; HDR bloom (Lite's PBR output is clamped).
- **Reserved in version 1:** the `sheen`, `iridescence` and `transmission` layers, `coat.ior`, the depth of sunk faces
  (their inner shadow), and glyph-shaped marks. A check mark is presented as captured, with no primitive.
- **Versioning:** a change that alters any expected colour is a new version of the model, with a new suite file. A
  renderer states which versions it conforms to.

## Change log

- 2026-10-18: version 4, draft: **glass drawn by core** (2D.6; core work item 4). Nothing in the model's glass changes: core's
  shader traces 2D.6 as written, and at DPR 1 and 2 the suite's `glass` case passes (4 exact points at 0, the lens's 4
  sampled points and the stand at most 1 level from the reference, finish band, dispersion and reflection by presence with
  shares of 0.55, 0.08 to 0.12 and 0.26), so the sampled tolerance stays 16 and needs no recalibration. One clarification:
  **`finish: true` on a window is the zone with its defaults** (band 0.3, horizon 0.25); the reference drew nothing for
  `true` and now follows core. No suite scene uses it, so no expected colour changes. Core places glass in the post
  chain's target (so SMAA, bloom, the clip and the opacity apply), keeps text under a window exact against SMAA with an
  exact twin in the captured caps' target, and lets glass cast on the face like any part (2D.7) but not into the shadow map.

- 2026-10-18: version 4, draft: **the reference shading of parts calibrated to Babylon Lite 1.33** (2D.5), from Lite's
  source and core's decoded pixels, and the sampled tolerance measured (2D.10). Every geometric guarantee, the face and
  the exact checks are unchanged. Each difference is a convention, not a fitted coefficient:
  - **The key light carries no π** (Lite's `singlelight-directional-wgsl.js`: `albedo · (1 / π) · NdotL · lightColor`),
    and a dielectric's diffuse albedo is `ρ · (1 − 0.04)` with no Fresnel term (`pbr-template.js`, `surfaceAlbedo`); α
    is `roughness² + 0.0005`; the key's lobe takes Lite's energy compensation `1 + F0 · (1 / (A + B) − 1)`
    (`ibl-fragment.js`).
  - **The environment is the split sum** instead of an integral: the prefiltered studio at lod `0.8 · log2(256 · α)`
    (`hdr-ibl-pipeline`: mip `k` at alpha `2^(k / 0.8) / 256`, 1,024 Hammersley points, `n = v = r`), mixed towards the
    irradiance by α, times the split-sum table `F0 · A + B` (`hdr-brdf-lut.compute`); and the diffuse light is order-2
    spherical-harmonic irradiance over π (`hdr-parser.js` `computeSHFromEquirect`, `spherical-harmonics.js`,
    `env-helpers` `polynomialToPreScaledHarmonics`).
  - **Lite's orientation of its prefiltered mips:** mips 1 and up see the studio turned 180° about a horizontal axis
    (`T`, 2D.5): the prefilter compute shader's face table is a 180° turn from WebGPU's cube sampling, while mip 0 is
    copied as loaded. Without `T` the brushed tops facing the viewer came out white in the reference against about 134
    in core (they see the turned studio's floor instead of its strip). This is a Lite defect, followed until it is
    fixed.
  - **The output transform:** exposure 0.8, gamma 2.2 and contrast 1.2 (`pbr-template.js`: `color *= vImageInfos.x`,
    `pow(color, 1 / 2.2)`, the contrast curve), because Lite's `loadHdrEnvironment` sets exposure 0.8 and contrast 1.2
    (`load-hdr.js`) after core has set 1 and 1. This, with the sRGB curve replaced by gamma 2.2, was the polished
    and chrome parts' 13-level offset: with it they agree with core within 1.
  - **The coat** follows Lite's clear coat (`clearcoat-fragment.js`): the base's F0 remapped under the coat, a Kelemen
    visibility for the key light, its own lobe and table in the environment, the base attenuated by the coat's Fresnel.
  - **Results** (Canary 158.0.8110.0, RTX 3080, core with PR #143's prism winding and #145's emitters): every one of the
    61 sampled points, at DPR 1 and 2, lies within 16 (median 1, 95th percentile 5); before the calibration none lay
    within 12. The tolerance is 16 (2D.10). A new case, `preset-domes`, samples the presets at normals up to about 50°.
  - **Findings for core and Lite:** core's exposure and contrast do not hold (it sets them before Lite's loader
    overrides them); Lite's prefiltered mips are turned against mip 0. Either fix changes these expectations, in a new
    version of the draft.

- 2026-10-18: version 4, custom parts (core work item 5; [design note](instrument-phase2.md#core-work-item-5-custom-parts)).
  No expected colour changes. Core now accepts `mesh` profiles and the `custom` kind; the reference implementation still
  refuses them (its conformance suite has no mesh case).
  - **The `mesh` profile** is inline (`positions`, `normals` or `"compute"`, `indices`, `uvs`) or a reference
    (`source`: a glB/glTF by URL or bytes, with `scale`, `offset` and a declared `bounds`), at most 16,384 vertices and
    32,768 triangles; any kind may use one, `custom` requires one; no `captured`, no `stand`.
  - **Presence and containment only:** a part whose triangles are not there is not drawn and not checked; one that is there is
    checked on its own vertices over the whole travel (2D.9). Nothing else is specified for it.
  - **`fitCustomPart` and `anchors` are not core's:** the fit is a uniform `scale` and an `offset` (a glTF vertex
    `(x, y, z)` becomes `(x, z, y) · scale + offset`), and the helper may compute them from anchors.
  - **Winding:** every triangle is wound against its normals; computed normals come from a closed mesh's winding.
- 2026-10-18: version 4, draft: the reference implementation (`instrument.ts`, section 3), the conformance suite
  (`instrument-4.json`, 13 cases with all seven check kinds at device scales 1 and 2, section 4) and its first run on
  decoded GPU pixels against core's `instrument` material. No expected colour of versions 1 to 3 changes.
  - **The reference follows core where the draft and core differ,** so it accepts exactly the scenes core accepts
    (checked scene for scene by the unit test):
    - `mesh` profiles and `custom` parts are refused until core's custom parts (work item 5), so `fitCustomPart` is not
      exported and the suite's step-down case uses built-in parts;
    - a profile's type field is `type` (`{ type: "lathe", … }`); the protected rects are `protected`;
    - a scene may describe up to 8,192 parts; the 2,048-part budget is a renderer's step-down with a diagnostic, not a
      validation error;
    - `light.ambient` defaults to 0 (2D.1 already says so; the design note's table said 0.55);
    - objects whose `bounds` leave the layer's box by more than half a pixel are not contained (core's rule, added to
      2D.9's check), judged against the box the scene was built for when the layer's box changed under a scene already
      judged (a layout change reaches core a frame before the scene's producer; the verdict stands with a `layout:`
      warning until the next scene);
    - a `#rrggbb` glass tint (core accepts one) is its channels over 255, not decoded;
    - core draws with its camera at the canvas centre, so a renderer conforms with the layer placed where the canvas
      centre is `camera.vanish`; the suite's cases put the vanishing point where a layer on a 1920 × 1080 stage has it.
  - **Choices the draft left open:** the travel is sampled at core's `travelSteps` (at least 32, a chord within
    0.45 px of its arc); the integral of 2D.5 is a multiple-importance quadrature (diffuse, the base and coat lobes and
    the softbox cone, 2,048 Hammersley points each), within a level of 4,096 at every sampled point; a part's normal
    is turned towards the viewer before shading (as Lite's double-sided PBR does); a sampled point must keep its
    smoothing group, part and mapped-shadow state within 3 px at both scales.
  - **The first GPU run (Canary 158.0.8110.0, RTX 3080, DPR 1 and 2): no sampled point is within 12.** Polished and
    chrome parts are 13–14 levels darker than the reference everywhere; brushed metal tops facing the viewer are about
    120 darker (the reference saturates them through the studio's strip and front); lacquer 56–58, gold 39–142 and
    gunmetal 73 off; and core draws the tops of `prism` and `extrude` parts near black (1–7 levels) where the reference
    gives 170–200, which looks like a winding or normal problem in core's prism and extrude meshes under Lite's
    double-sided PBR rather than a shading difference. The tolerance is not raised: the sampled checks are recorded,
    not asserted, until the model or core is corrected (2D.10).

- 2026-10-17: version 4, draft, from the second iteration of the
  [I1 prototype](instrument-phase0.md#i1-prototype-second-iteration):
  - **Glass (2D.6)** is computed in linear light with its reflection traced: a ray towards the face meets the part's
    polished `stand` or the face, a ray away from it sees the studio. A lens refracts in at its surface and out at its
    flat bottom (total internal reflection gives a dark rim) instead of being shifted against a flat pane; light is
    absorbed along its path (`glass.tint`, `glass.absorption`) instead of a rim tint (`tintStrength`); glass
    reflections take `glass.reflection` (1.5); a window's finish band is defined (`finish: { band, horizon }`), and its
    text is exact over its protected rects grown by 2 px.
  - **Emitters (2D.4)** gain `face`, the share of their strength that lights the face (the pointer light's is 0.3).
  - **The fill (2D.1, 2D.5)** defaults to 0 in Instrument scenes: the studio is the fill.

- 2026-10-17: version 4 (Instrument), draft: part 2D, from the [Instrument plan](instrument.md) and the
  [Phase I0 report](instrument-phase0.md). The scene format gains `kind`, emitters and protected rects at every level,
  and Instrument objects with parts, profiles and poses; the model gains the camera rule, the emitter term and the
  guarded face factor, the reference shading of parts and the studio as radiance, glass over the capture, shadows of
  parts on the face and on parts, the post chain's order and clip, geometric guarantees and sampled guarantees with a
  provisional tolerance of 12. The reference implementation (`instrument.ts`, section 3) and `instrument-4.json`
  (section 4) are specified, not yet written. Two rules are tighter than the probes:
  - **The guard limits the whole face change** inside protected rects (relief, part shadows and emitter light
    together, 2D.4); the I0.3 probe capped emitter light alone, and text moved up to 0.44 levels beyond `m`.
  - **An object that fails containment is drawn as its Relief primitive,** not as an Objects object, since an
    Instrument layer has one renderer (2D.9).

- 2026-10-17: narrow bands (2.4). A band narrower than `bevel.width` scales the slope by `bᵢ / bevel.width`, so thin
  grooves (dividers, tab rails) are shallow instead of near-black on the GPU. This changes the expected colours of
  bevels on primitives less than two bevel widths across (the `well-and-groove` suite's groove and the `ring`'s
  band); the `divider` case is new.

- 2026-10-16: version 3 (Scene): part 2C, stage scenes (`strata-stage`) with a lit backdrop and particles,
  environment maps for objects, the reference implementation in `stage.ts`, and the `scene-3.json` suite. The
  [Phase 5 design](phase5.md) explains the choices.

- 2026-10-16: version 2 (Objects): part 2B, the camera and environment in the scene format, the reference
  implementation in `objects.ts`, and the `objects-2.json` suite. Two decisions from the
  [Objects design](phase4-objects.md) are refined:
  - **One list:** objects are entries of the same back-to-front list as primitives, so a key on a slab, a knob in a
    well and a field's bezel over its well occlude in document order with the relief primitives around them.
  - **Cast shadows are occluded** (2.4), so a rail's shadow no longer falls on the puck standing above it. No
    expected colour of version 1 changes.

- 2026-10-16: writing core's GPU implementation settled three details. None changes an expected colour in the suite
  except the sample positions:
  - **Sample points are pixel centres** at a device scale of 1, because a bevel changes by several units per pixel.
  - **Ring arcs accumulate as one overlay** (2.7), so occlusion scales one colour and one alpha. A single arc, the
    only kind the suite has, is unchanged.
  - **Content is clamped to 0–1 before compositing** (2.11), so a partly transparent pixel cannot carry an
    over-bright value into the composite.
- 2026-10-16: version 1 (Relief): the scene format, the shading model, the reference implementation in
  `@underglass/ui/tokens`, and the first conformance suite. It formalises the P0.2 prototype's shader with these
  changes:
  - **Occlusion:** a primitive hides the relief beneath it, so a knob no longer shows the groove's bevel through it.
  - **Interior factor:** one per face, from the topmost primitive, clamped once.
  - **Defined profiles:** `chamfer` and `cove` are defined.
  - **Contrast guard:** it is a uniform factor, so text and face change together.
