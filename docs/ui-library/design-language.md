# Strata design language

**Status:** draft for review (2026-10-17). The [plan](plan.md) defines the scope. The
[Phase 0 report](phase0.md) proves what is technically possible, and the
[prototypes](prototypes.md) settled the look. This document defines the language: its rules,
its tokens with their defaults and allowed ranges, and how each presentation renders them. The
machine-readable tokens are in [`strata.tokens.json`](../../packages/ui/src/tokens/strata.tokens.json), in the
`@underglass/ui` package.

Strata is **configurable by design**. Almost every value below is a token that an application,
a part of a page or a visitor's preference may change, within validated ranges. A short list of
[invariants](#invariants) protects what makes the language usable and recognisable: one light
per application, exact native hits, readable contrast and a visible focus. They are validated,
never silently relaxed.

**The Instrument level** ([plan](instrument.md), [Phase I0 report](instrument-phase0.md)) is a fourth presentation
level: 3D-first hardware controls drawn as parametric meshes. Its rules are in sections 2, 3, 4, 6, 7, 11, 12, 14, 15
and 16, and in sections [19](#19-characters) and [20](#20-feedback). Its numbers come from the second iteration of
the [I1 prototype](instrument-phase0.md#i1-prototype-second-iteration), whose look sign-off is pending with the owner. A
dagger (†) marks a **provisional** value: a number the second iteration did not use or measure, or a proposed range. The
[spec notes](instrument-spec-notes.md) list every value and its status.

## Contents

1. [Principles](#1-principles)
2. [Space](#2-space)
3. [Light](#3-light)
4. [Materials](#4-materials)
5. [Shape](#5-shape)
6. [Objects](#6-objects)
7. [Elevation and shadow](#7-elevation-and-shadow)
8. [Colour](#8-colour)
9. [Typography](#9-typography)
10. [Iconography](#10-iconography)
11. [Interaction states](#11-interaction-states)
12. [Motion](#12-motion)
13. [Layout and density](#13-layout-and-density)
14. [Accessibility](#14-accessibility)
15. [Theming and configuration](#15-theming-and-configuration)
16. [Presentation levels and adjust policy](#16-presentation-levels-and-adjust-policy)
17. [Component anatomy template](#17-component-anatomy-template)
18. [Distribution and frameworks](#18-distribution-and-frameworks)
19. [Characters](#19-characters)
20. [Feedback](#20-feedback)

Units: lengths are CSS pixels. Angles are degrees. Colours are sRGB 0–255 unless a section says
linear. "At 50%" means at the default depth.

## 1. Principles

Each principle is a rule a reviewer can check.

1. **Design in 3D, project down.** Every control is first a 3D object (section 6). Relief, Objects
   and CSS are projections of that object, never separate designs.
2. **Flat faces carry input.** An interactive surface is a flat face, parallel to the panel it sits
   on. Text sits on faces and is never extruded, curved or shaded below its contrast minimum.
3. **The native control is the object's footprint.** Every drawn pixel of a control's object lies
   inside its native element's box. Meshes are decoration driven by native state, never the reverse.
4. **One light per application.** All panels, components and levels in an application share one
   key light. Its direction is configurable per application, never per component.
5. **States are physical.** Hover lifts, press sinks, focus lights an edge, disabled flattens.
   State changes move light, height or pose; they never move a control's hit area.
6. **Space moves, controls do not.** Panels may travel and tilt through depth. Controls stay where
   the layout put them.
7. **Configurable, validated, never silently changed.** Every token may be configured within its
   range. Values that break an invariant are reported, and are never quietly altered or applied.

## 2. Space

**World units are CSS pixels.** The panel plane is z = 0. Heights are measured towards the viewer.

**Camera.** There is one perspective camera per stage, centred on the stage, at distance `D` from
the panel plane, and with a vertical field of view that maps z = 0 one-to-one onto CSS pixels:
`fov = 2 · atan(stageHeight / 2 / D)`.
- **Default distance:** `D` is derived, not fixed: `D = max(camera.distance, r · h_max / taper + h_max)`,
  where `r` is the stage half-diagonal and `h_max` is the tallest object height in use. This keeps the
  [taper rule](#6-objects) satisfied on any screen size.
- **Configuring it:** `camera.distance` may be set explicitly, and validation raises it if needed. It defaults to
  1,600, and to 2,400 when the application's level is `instrument` or `scene`, where the
  [Instrument camera rule](#instrument-camera) applies. The default follows the level the application sets, not the
  level the adjust policy has stepped to, so a step never moves the camera.

**Elevation scale.** Each surface sits on one of five levels. The heights at 50% depth:

| Level | Token | Height at 50% | Used by |
| --- | --- | --- | --- |
| Ground | `elevation.ground` | 0 | Page background, wells |
| Raised | `elevation.raised` | 3 | Controls and cards on a panel |
| Floating | `elevation.floating` | 8 | Panels, toolbars |
| Overlay | `elevation.overlay` | 16 | Menus, popovers, tooltips |
| Modal | `elevation.modal` | 24 | Dialogs, drawers |

**Depth scaling.** Heights scale with depth through `depthScale(depth)`, which is piecewise linear:
0.6 at 0%, 1.0 at 50% and 1.6 at 100%. **Configuring them:** an application may override any
level's height, but the order of the levels is an invariant: ground < raised < floating <
overlay < modal.

**Panel tilt.** Panels may tilt at rest or in motion, up to `camera.tiltMax`, which defaults to 25° and
may be set from 0° to 60°. P0.1 proved exact native hits through perspective up to 55°.

## 3. Light

| Token | Default | Range | Meaning |
| --- | --- | --- | --- |
| `light.azimuth` | 323 | 0–359 | Where the light comes from, clockwise from the top of the screen. 323 = top left. |
| `light.elevation` | 41 | 20–80 | Height of the light above the panel plane |
| `light.intensity` | 1.6 | 0.5–3 | Key light strength (Objects level) |
| `light.ambient` | 0.55 | 0.2–1 | Fill light strength (Objects level) |
| `light.colour` | (255, 255, 255) | any | Key light colour (Objects level) |

- **Direction towards the light** in panel axes (x right, y down, z towards the viewer):
  `(sin a · cos e, −cos a · cos e, sin e)`, where `a` is the azimuth and `e` the elevation.
- **Themes:** a theme changes light intensity and colour, never direction.
- **Invariant, one light per application:** `light.*` is set at the application level only.
  Subtree scopes and components cannot override it.

### Light at the Instrument level

The key light also lights the meshes (a directional light in Lite's PBR), and the [environment](#environment) supplies
the rest of their light.

- **The studio is the fill.** An Instrument layer has no fill light by default (`light.ambient` 0 there; 0.55 stays
  the Objects default): a hemispheric fill's specular term faces the viewer and turns metal tops white
  ([I0.4](instrument-phase0.md#i04-materials-over-the-capture),
  [I1](instrument-phase0.md#i1-prototype-second-iteration)). A fill an application adds is diffuse only. The second
  iteration ran with the fill off.
- **Metals take the full key light.** A metal takes the key light's direct term scaled by its `base.direct` (section
  4), 1 in every preset. The first iteration scaled it by 0.2 because brushed tops changed brightness with a knob's
  size and position under its grey sweep; with the studio of section 4 and crowned tops they no longer do.
- **Emitters** (below) add local light. They are not lights in the sense of the tokens above: `light.*` stays the one
  key light.

### Emitters

An **emitter** is a point light that a lit part carries: a lamp's or LED's lens, a push button's lit ring, a display's
backlight, and the [pointer light](#the-pointer-light). It stands over the centre of its lens, `emitter.height` above
the face, and lights:

- **the face** around it, captured text included, within the guard (below);
- **the outset** past its layer's edge, so a lamp near a panel's edge lights the page, the stage or the panel beneath
  without a Scene backdrop;
- **the meshes** of its layer (sides, caps, bezels), with the same position, colour, strength and radius, so the face
  and the objects agree.

| Token | Lamp | LED | Range | Meaning |
| --- | --- | --- | --- | --- |
| `emitter.radius` | 6 | 6 | 1–20 | Reach `R`, in lens diameters; no light beyond it |
| `emitter.height` | 0.7† | 0.8† | 0.25–2† | Height above the face, in lens diameters |
| `emitter.strength` | 3,200† | 520† | 0–32,000† | Intensity `I` in the falloff below |
| `emitter.guardFeather` | 4† | 4† | 0–16† | Width, in px, over which the guard eases off outside a protected rect |

A [Meter](components/meter.md)'s lit segment is an LED with its own tokens, `emitter.segment.radius` (3†), `emitter.segment.height`
(0.8†) and `emitter.segment.strength` (260† for the 10 px lens): a bar throws many small pools, so each reaches less than a lone LED's.

- **Colour by role:** an emitter takes its lens's role colour: `glowOn` for lamps and lit rings, the StatusLight's
  `colour` role, the `display` role's emissive colour for a backlight. As light, it is that colour's channels in 0–1.
- **Falloff,** Lite's clustered point-light falloff, so the face pass and the mesh lights agree. At a point with
  normal `n`, `d` px from the emitter, with `θ` the angle between `n` and the direction to the emitter:

  ```text
  E = I · colour · cos θ / (π d²) · clamp(1 − (d² / R²)², 0, 1)²
  ```

  The light at a point is the sum over the emitters that reach it, and the face is lit by `× (1 + E)` per channel
  ([rendering model 2D.4](rendering-model.md#2d4-emitters-the-face-pool-and-the-guard)).
- **The face pool is its own pass.** Core's layer blend is straight alpha, so a light term inside a layer's relief
  shading could brighten only that layer, never what lies beneath its outset. The pool is therefore a pass after the
  layer's pass, over the layer's box and its outset (48 px†), multiplying what is already drawn
  ([I0.3](instrument-phase0.md#i03-emitters-and-the-pointer-light)). It is the same pass at the Relief, Objects and
  Instrument levels.
- **Protected rects and the guard.** The GPU helper collects the layer's text runs (the client rects of its text) as
  **protected rects**, at most 64 per layer; a layer with more protects its whole box. Inside a protected rect the
  light is limited so that the face's whole change (its interior factor, the shadows of parts and emitter light
  together) stays within `interior.max`; over `emitter.guardFeather` px outside it, the light returns to full strength.
  A layer's guard has one feather: the largest `guardFeather` of the emitters that reach it (10 px with the pointer
  light, below). Contrast on lit faces (section 8) is measured with the brightest emitter beside the text and the pointer light
  directly over it.
- **Budget: 64 emitters per layer,** binned into a 16 × 9 tile mask per layer, so the cost stays flat as emitters are
  added (at 64, the tiled face pass and the mesh lights together cost less than an untiled face pass alone, I0.3). The
  helper keeps the 64 nearest the layer by reach and reports every emitter it drops. The stage may hold many more.
- **Invariant, emitters add light only:** an emitter never moves, replaces or recolours the key light and casts no
  shadow; the key light's shadows keep their direction, offset, softness and strength (section 7). Shadow-casting
  emitters are not part of the language; bounced light is a post option (section 16).
- **Preferences:** `prefers-reduced-motion` stops blinking and pulsing; `prefers-contrast: more` turns emitters off and
  draws a lit lens as flat unlit colour; under `forced-colors` everything is flat (section 14).

### The pointer light

An application may make the pointer an emitter the visitor carries: a soft pool on the faceplate around the pointer,
and a highlight that travels across metal, coated and glass parts as it passes. It is **not a second key light**. A key
light that followed the mouse would swing every shadow with it, change text contrast from frame to frame and leave the
CSS presentation unable to follow.

| Token | Default | Range | Meaning |
| --- | --- | --- | --- |
| `pointerLight.enabled` | `false` | — | Opt-in, per application |
| `pointerLight.strength` | 16,000 | 0–32,000† | Intensity `I`, on the parts |
| `pointerLight.face` | 0.3 | 0–1† | The share of `strength` that lights the face |
| `pointerLight.guardFeather` | 10 | 0–16† | Its `emitter.guardFeather`, px |
| `pointerLight.radius` | 360 | 60–1,000† | Reach `R`, px |
| `pointerLight.height` | 120 | 20–400† | Height above the face, px |
| `pointerLight.colour` | (255, 242, 224) | any | Light colour, a warm white: (1, 0.95, 0.88) as light |

- **Parts at full strength, the face at 0.3:** the parts take `strength` (the highlight that travels across metal and
  glass); the face pool takes `face` of it with a 10 px feather. At full strength the pool saturated a light faceplate
  and every guarded text box read as a grey patch (the I1 prototype's second iteration).
- **Fine pointers only:** the light exists only under `(pointer: fine)`. It carries no meaning and changes no state;
  hover, focus and selection keep their own cues, so touch and keyboard users lose nothing without it.
- **Preferences:** off under `prefers-contrast: more` and `forced-colors`. Under `prefers-reduced-motion` it stays
  (nothing in the UI moves) but has no fade.
- **Fade:** it exists only while the pointer is over the stage. It fades out over `motion.fast` when the pointer leaves
  the stage, and in when it returns.
- **How it moves:** the GPU helper converts the pointer to stage px once per frame and writes the emitter into every
  layer within reach. Each layer's pass lights only that layer's own content, so where layers overlap the light is
  applied once. A move is a uniform update: no capture, no upload and no change to hit geometry (I0.3, at every level).
- **Levels:** at the Instrument level it also lights the meshes as a clustered light. At the Relief and Objects levels
  it lights the face through the face pool, and its highlight travels across bevels, sides and domes through a
  point-light specular term in the relief shading (core work item 2, [design note](instrument-phase2.md#core-work-item-2-emitters-and-the-pointer-light)). In CSS
  it is a `radial-gradient` overlay placed from two custom properties, its strength capped so no text under it changes
  beyond `interior.max`.
- **Gaps between panels:** it lights what a layer covers. At the Scene level the backdrop is a layer, so the light
  crosses gaps without a seam; without one the gaps stay unlit (the probe lit a full-stage layer).
- **The guard** applies to it as to any emitter.

## 4. Materials

Materials are **open**. A material is a named recipe of layers. Strata ships presets, an
application defines its own in the theme, and every presentation renders the same recipe with what
it can do. Materials are assigned by role (section 8), by scope or per component; components never
hard-code material values.

### Material layers

| Layer | Parameters (range) | Instrument (Babylon Lite PBR) | Objects | Relief (material pass) | CSS |
| --- | --- | --- | --- | --- | --- |
| `base` | colour role; `roughness` 0–1; `metallic` 0–1; `direct` 0–1 (Instrument only, default 1) | Base colour, roughness, metallic; a metal's colour is its base colour (see `reflectance`); `direct` scales the key light's direct term | Base colour, roughness, metallic | Bevel lighting plus a specular lobe whose width follows roughness | Face colour; low roughness adds a highlight gradient |
| `coat` | `strength` 0–1; `roughness` 0–1; `ior` 1.3–1.8 | Clear coat (`setPbrClearCoat`), plus the finish zones on captured caps | Clear coat (`setPbrClearCoat`), reflecting the environment on edges and sides, plus the [finish zones](#finish-zones) on key tops | A sharp highlight and a Fresnel rim on the bevels, plus the finish zones | An inset top highlight, an edge rim and the finish zones as a gradient |
| `sheen` | `colour`; `strength` 0–1; `roughness` 0–1 | Sheen (`setPbrSheen`) | Sheen (`setPbrSheen`) | A soft brightening at grazing bevel angles | A soft inner glow |
| `iridescence` | `strength` 0–1; `thickness` 100–1200 nm | Iridescence (`setPbrIridescence`); barely visible on flat glass (I0.4) | Iridescence (`setPbrIridescence`) | A subtle hue shift on the bevels | Not rendered (the other layers still are) |
| `transmission` | `strength` 0–1; `ior` 1–2.4; `tint` colour role; `frost` 0–1 | The capture refraction of [glass](#glass); never Lite's transmission, which a layer scene cannot use | Not rendered (reserved in the [rendering model](rendering-model.md#5-scope-and-versions)) | A frosted tint over the panel; refraction of decorative backdrops through the Underglass effect path | `backdrop-filter: blur()` plus tint |
| `emissive` | `colour` role; `strength` 0–4 | Emissive colour; a lit lens is also an [emitter](#emitters) and feeds the bloom (section 16) | Emissive colour | An additive glow, not lit | A solid colour and a glow shadow |
| `brush` | `strength` 0–1; `direction` radial, linear or circular | Anisotropy (`setPbrAnisotropy`) with a tangent from the part's UVs (circular around a revolved part, linear along a plate), **always with a `grain` hairline map**: anisotropy alone barely reads (I0.4) | A directional highlight streak on the bevel | A directional highlight streak on the bevel | A `repeating-conic-gradient` or linear hairline pattern |
| `grain` | `kind` hairline, knurl, fluted or sandblast; `strength` 0–1; `scale` px | A normal map generated in code on the part it is assigned to | Not rendered | Not rendered | Not rendered |
| `reflectance` | `f0` 0–1; `tint` colour role | Specular reflectance of **dielectrics** (lacquer, glass, coats) (`setPbrMetallicReflectance`). It does nothing on a metal (I0.4): gold, brass and copper are metals with that base colour | The specular lobe's colour | The specular lobe's colour | The highlight gradient's colour |
| `dispersion` | `strength` 0–1 | One index of refraction per colour channel inside the [glass](#glass) refraction: a prism fringe at the edges of thick caps and lenses | Not rendered | Not rendered | Not rendered |
| `subsurface` | `strength` 0–1; `tint` colour role; `thickness` px | Subsurface scattering (`setPbrSubsurface`) on opaque parts: silicone pads, frosted lens covers, `playful`'s soft caps. Not yet probed | A softened bevel light | A softened bevel light | A softer inner glow |

The Objects column names the PBR feature each layer corresponds to. The analytic Objects shading of
[rendering model part 2B](rendering-model.md#2b-objects-version-2) draws `base`, `coat` and `emissive`, and reserves the
others.

### Presets

| Preset | Recipe | Instrument | Feel |
| --- | --- | --- | --- |
| `matte` (default) | base roughness from depth (0.8 → 0.45 → 0.3), metallic 0 | The recipe, in the role's colour | Plain painted surface |
| `satin` | base roughness 0.4; coat 0.3 at roughness 0.35 | The recipe | Soft sheen |
| `gloss` | base roughness 0.25; coat 0.6 at roughness 0.12 | The recipe | Shiny plastic |
| `lacquer` | base roughness 0.45; coat 1.0 at roughness 0.04, ior 1.5 | Black lacquer: base (28, 28, 30), roughness 0.5; coat 1 at roughness 0.03, ior 1.5 | Glass-coated: a clear, glossy top layer |
| `glass` | transmission 0.9, ior 1.5, frost 0.3, tint from the role; base roughness 0.05 | [Glass](#glass): ior 1.5; `dispersion` 0.2 (a spread of ±0.02); absorption tint (0.84, 0.93, 0.9) at 0.03 per px of path; reflections at 1.5 × `environment.intensity`, a mirror | Translucent glass |
| `metal` | metallic 1, roughness 0.3 | Brushed aluminium: base (239, 240, 241), roughness 0.3; `brush` 0.9 with a hairline `grain` of 0.15 (none on large plates, below) | Brushed metal |
| `polished` | metallic 1, roughness 0.04 | Polished aluminium: base (250, 250, 251) | Spun, bright aluminium |
| `gunmetal` | metallic 1, roughness 0.36 | Base (104, 107, 114); `brush` 0.9 with the hairline `grain` | Dark brushed metal |
| `gold` | metallic 1, roughness 0.18 | Base (255, 219, 147), no brush | Gold, by its base colour |
| `chrome` | metallic 1, roughness 0.04 | Base (250, 250, 252)† | Mirror |
| `emissive` | emissive from the role colour, strength 1 | Emissive; an emitter when the part is a lens | Light source: indicators, active tracks |

- **Instrument colours:** meshes have no captured content, so Instrument presets carry a base colour (sRGB, converted
  from the probe's linear factors). Below Instrument, the recipe column applies and colour comes from the capture or
  the role, as before.
- **Where the values come from:** [I0.4](instrument-phase0.md#i04-materials-over-the-capture), carried into the
  [I1 prototype](instrument-phase0.md#i1-prototype-second-iteration)'s second iteration with its studio, which also set
  `polished`, `gunmetal` and the glass shader's numbers. Every metal takes the key light's full direct term (`direct` 1,
  section 3). `chrome` was not on the prototype page.
- **No grain on large plates:** a wall plate and a display bezel take `brush` without the `grain` map. There the
  hairline map aliased into coarse streaks; on caps, carriages and blocks it reads as brushed metal.

### Defining and assigning materials

- **Custom materials** are any combination of layers, defined in the theme. Each layer
  parameter is a token, so a custom material can blend with depth like any other token.

  ```ts
  createStrataTheme({
    materials: { candy: { base: { roughness: 0.2 }, coat: { strength: 1, roughness: 0.05 } } },
    roles: { buttonPrimary: "candy" },
  });
  // Per subtree or component: <StrataScope material="lacquer">, <Button material="candy">,
  // data-strata-material="candy" in plain HTML.
  ```

- **Material roles** and their defaults:

  | Role | Default |
  | --- | --- |
  | `panel` | `matte` |
  | `control` | `matte` |
  | `buttonPrimary` | `matte` |
  | `field` | `matte` |
  | `knob` | `satin` |
  | `rail` | `metal` |
  | `trackOn` | `emissive` |
  | `indicator` | `emissive` |
  | `overlay` | `matte` (`glass` is a common choice) |
  | `knobCap` | `metal`, its chamfer the same metal polished (roughness 0.06, no brush) |
  | `knobSkirt` | `polished` |
  | `faderCap` | `metal`, its chamfer polished as `knobCap`'s |
  | `lever` | `metal`, polished as a chamfer is |
  | `rockerPlate` | `metal` |
  | `plate` (wall plates) | `metal` on light themes, `gunmetal` on dark themes |
  | `bezel` (bezels of rockers, push buttons and displays; a bat's nut and bushing) | `polished` |
  | `lens` | `glass` |
  | `needle` | Set with the Meter and Gauge components (Phase I4) |
  | `display` (a display's window) | `glass` |
  | `glowOn` | `emissive`, colour (255, 146, 40)† |
  | `glowOff` | `glass` |

  The roles from `knobCap` on are the Instrument roles; their defaults are the `premium` character's
  ([section 19](#19-characters)). Below Instrument they take the Objects or Relief projection of their material.

- **Custom shading.** For looks the layers cannot express, a material may carry custom code:
  - **Relief:** a trusted WGSL colour function, with the same contract as Underglass's
    `defineEffect`. It receives the sampled colour, local position, surface normal, light
    direction and up to four parameters, and returns a colour. It never moves pixels.
  - **Objects:** a Babylon Lite shader or node material.
  - **CSS:** a custom material declares a CSS fallback, or inherits the nearest preset.
  - **Trust:** custom code is trusted application code, never built from user input.

### Finish zones

A material must read at a glance, yet face interiors carry labels whose contrast is protected
(`interior.max`). A centred single-line label sits between 35% and 65% of a raised control's
face height. Finishes therefore work at full strength in the zones labels never reach. Every
presentation renders them from one profile:

| Zone | Height | Coat | Base gloss | Metal |
| --- | --- | --- | --- | --- |
| Top | 0–32% | Reflection band (3–26%), peak `coat × 0.6`, crisper as `coat.roughness` falls, with a dark horizon line (24–32%, `coat × 0.16`) | Sheen fading from the top, `max(0, 0.5 − roughness) × 0.8` | Bright half, `metallic × 0.4` |
| Bottom | 70–100% | — | — | Dark half, `metallic × 0.36` |

- **Relief:** the material pass applies the profile on raised controls.
- **Objects:** a shader-material overlay on each key top applies the same profile over the
  captured label, alongside the real reflections of the environment on the key's sides and edges.
- **CSS:** the profile is sampled into a `background-image` gradient.
- **Contrast rule:** the finish zones are the one place a face may change beyond `interior.max`.
  A component whose text can reach a zone (multi-line, top-aligned or bottom-aligned labels) turns
  that zone off, and its anatomy tests check that text boxes stay clear of the active zones.

### Environment

Reflections (metal, gloss, coat, glass) need an environment.

| Token | Default | Options |
| --- | --- | --- |
| `environment.source` | `studio` | `studio` (a neutral studio generated in code, no asset: mostly dark, with a key softbox matching the key light, a fill opposite it and a strip overhead), `none`, or the URL of an `.hdr` or `.env` file |
| `environment.intensity` | 1 | 0–3 |

**At the Instrument level an environment is required** for metal, coat and glass: an Instrument layer always has one,
and `environment.source: "none"` is rejected there (reported, and the studio used). It has two parts.

- **The studio, generated in code** as an HDR image (no asset), loaded once per engine and turned about the screen's
  vertical (`setEnvironmentRotation`) so that its softbox lies in the key light's direction (I0.4 read it back
  0.40° off). Reflections then agree with the one light. Its radiance is defined exactly in
  [rendering model 2D.5](rendering-model.md#2d5-materials-and-the-environment):

  | Token | Default | Range | Meaning |
  | --- | --- | --- | --- |
  | `studio.key` | 12 | 0–40† | The key softbox, centred on the key light's direction |
  | `studio.keyRadius` | 0.24 rad | 0.05–0.6† | The softbox's angular radius; its edge softens over 0.1 rad |
  | `studio.fill` | 1.2 | 0–10† | A broad fill opposite the key, below the horizon |
  | `studio.front` | 0.12 | 0–2† | A dim panel behind the viewer, so face-on metal reads as metal, not black |
  | `studio.strip` | 2.5 | 0–10† | A ring of light 12–20° above the horizon: the band that crowned caps and chrome catch |
  | `studio.floor` | 0.03 | 0–1† | The room below the horizon |
  | `studio.ceiling` | 0.25 | 0–2† | The room above it |

  `environment.intensity` scales all of it (the prototype's "Reflections" control).
- **The page, reflected.** Each layer has one local environment cube, filled on the GPU from the layer's own capture,
  so a knob's skirt shows the faceplate print and its neighbours. It is 512² with 10 blur mips
  (`environment.pageSize`, 128–1,024), seen from 300 px in front of the face, with box-projection walls 50,000 px away
  so that the studio stays at infinity: a direction that meets the face plane inside the layer sees the capture there,
  any other sees the studio. **It is refreshed only when the layer is captured** (and when the capture texture is
  replaced), never per frame, so poses and motion cost it nothing. Lite's probe set
  (`createPbrLocalEnvironmentProbeSet`) cannot serve: it copies its cubes once. With the studio above it no longer
  whitens metal caps; head-on, a flat top reflects the studio's front more than the page.

### Glass

At the Instrument level glass is a **refraction of the layer's capture** in Strata's own shader, not Lite's
transmission. Inside a layer scene Lite's transmission redirects the render, fails WebGPU validation and sends core to
DOM, and its fixed 1024² grab would blur text ([I0.4](instrument-phase0.md#i04-materials-over-the-capture)). Glass must
read as glass:

- **Lenses are real lenses:** a lens or glass cap is a plano-convex lens standing on the surface below it. Each pixel
  refracts the view ray into the glass by Snell's law, follows it down to the flat bottom, refracts it out and reads
  the capture where it lands on the face, so a domed cap magnifies the print under its centre (×1.46 on the prototype's
  hub ring). Near the rim the ray meets the bottom beyond the critical angle: total internal reflection, and the rim
  shows the dark interior, as real glass does. It is decided on one channel for all three, so the rim does not sparkle.
- **Windows and flat parts** read the capture shifted by the difference between the ray refracted through the surface
  and through a flat pane: exactly zero where the glass is parallel to the face, so the pixel is the capture texel.
- **Dispersion:** one index of refraction per colour channel (`ior − s`, `ior`, `ior + s`, with the spread
  `s = 0.1 · dispersion.strength`, ±0.02 by default), so thick edges show a thin prism fringe.
- **Absorption:** light is tinted along its path inside the glass (the `glass` preset's tint, per px of path), so
  thick glass and steep bevels read greener and darker than thin glass.
- **Reflection, in the same shader:** Schlick Fresnel (`F0` from the `ior`: 0.04 at 1.5) weights the radiance along
  the reflected ray, and the refracted light takes `1 − F`. A ray towards the face meets the polished part the glass
  stands on (a knob's skirt: a mirror of the studio in that part's colour) or the face itself (the capture where the
  ray lands, the exact local reflection that the page cube approximates); a ray away from it sees the studio,
  evaluated from its definition. Glass reflections take 1.5 × `environment.intensity`. The polished stand is what lights
  a cap's rim on a light faceplate: there a ray reflected onto the face sees the same grey as the plain capture, so
  Fresnel alone adds nothing. The first probe drew the reflection as a separate PBR shell over the refraction, which
  added almost nothing on flat glass, so glass read as invisible.
- **Rim:** a window's bevel refracts the window's edge, with the Fresnel above and a darker, tinted rim; a lens's rim
  goes dark by total internal reflection and catches the stand's reflection on the key light's side.
- **Lenses and glass caps** carry no text and take the full Fresnel everywhere. A glass knob cap's pointer is printed in
  the faceplate's ink, so it reads against the magnified plate.
- **Display windows, the finish-zone rule:** the flat region of a display window that carries text stays
  **texel-exact**: no shift, no reflection, no tint, inside its text runs grown by 2 px. A window's reflection is
  measured against the flat pane (`F` less its head-on value, so 0 face-on), and a reflection band may be drawn only in
  the window's top [finish zone](#finish-zones) and on its rim: a band from 3% to 26% of the window, peak 0.3, brighter
  on the key light's side, over a dark horizon line at 25–31%, 0.25. A display whose text can reach a zone turns that
  zone off, as key tops do. Display text contrast is measured through the glass (section 8).

### Guardrails

- **Contrast holds.** Highlights, coats and custom shading reach full strength on bevels, edges,
  mesh sides and knobs. On face interiors, where text may sit, the material pass limits any
  brightness change to `interior.max`, whatever the material or custom code, so the contrast
  invariant (section 8) holds. The change is one factor for the face and its text alike
  ([rendering model 2.9](rendering-model.md#29-the-contrast-guard)). The [finish zones](#finish-zones) are the only exception, and only
  where text stays clear of them.
- **Colour only.** A material may change colour; it never moves pixels or hit areas. The glass refraction moves
  where the capture is read, never where a part is drawn or hit, and never under text.
- **New layers project down or not at all.** A layer renders at Objects, Relief and CSS exactly as the layers table
  says, or is not rendered there. No presentation substitutes a different look for a layer it cannot draw.
- **Preferences:**
  - `prefers-reduced-transparency`: `glass` becomes `matte`, and transmission is off; at the Instrument level a lens
    is then an opaque dome in its role colour, and a display window shows the plain capture.
  - `prefers-contrast: more`: coat, sheen and iridescence are off.
  - `forced-colors`: everything is flat.

## 5. Shape

| Token | Default | Range | Used by |
| --- | --- | --- | --- |
| `radius.small` | 4 | 0–12 | Chips, checkboxes |
| `radius.control` | 8 | 0–20 | Buttons, fields |
| `radius.panel` | 14 | 0–32 | Panels, cards, dialogs |
| `radius.pill` | 999 | — | Switch tracks, badges |
| `bevel.width` | 6 at 50% | 2–12 | Width of the bevel band at the edge of a raised face |
| `bevel.profile` | quarter-round | quarter-round, chamfer, cove | Shape of the bevel's cross-section |

- **Wells** are inset shapes for fields, tracks and checkboxes. They use the same bevel profile
  with the normal inverted, so the edge nearest the light is dark.
- **The bevel profile is one of the language's recognisable marks.** It is configurable, but an
  application uses one profile everywhere.

## 6. Objects

Each control has a canonical 3D object. Relief draws it head-on as lit faces, Objects draws its
mesh, and CSS draws its relief recipe. Anatomy pages define each component's object
(section 17).

**The footprint rule.** The native element's border box is the object's **base**.

**The taper rule.** Under perspective, a point at height `h` shifts on screen by
`drift = r · h / (D − h)`, where `r` is its distance from the vanishing point. Every raised part's
top is inset from its base by `taper ≥ drift(h)`, so every drawn pixel of the object stays inside
the native control (P0.4).
- **Validation:** if a configuration breaks the rule, validation raises `camera.distance` first,
  then `taper`, and reports what it changed.
- **Moving parts:** parts that must rise or move further (levers, knobs, thumbs) stay inside a
  native control whose box covers their whole travel.

**Screen-locked tops.** Raised parts that carry captured content (key tops with labels, field bezels) are
built with each point at height `h` pre-scaled towards the vanishing point by `(D − h) / D`. They then
project exactly onto the native control's pixels: labels map one texel to one pixel, with no resampling
blur, and their drift is zero. The sides between base and top still show the object's depth. The taper rule
remains for parts that are not screen-locked.

| Token | 0% | 50% | 100% | Range |
| --- | --- | --- | --- | --- |
| `object.keyHeight` | 4 | 8 | 12 | 0–24 |
| `object.keyTravel` | 3 | 6 | 9 | 0–keyHeight |
| `object.taper` | 2 | 3 | 4 | ≥ drift |
| `material.matte.base.roughness` | 0.8 | 0.45 | 0.3 | 0–1 |

**Object vocabulary:**

| Control | Object | Moving part |
| --- | --- | --- |
| Button | Rounded tapered key; the captured label is on its top | Travels `keyTravel` on press |
| Text field, text area | Bezel ring just inside the field; the text sits on the face | None |
| Switch | Rounded track (`well`), spherical knob | Knob slides; the track turns `emissive` when on |
| Toggle button | A key that latches down | Holds at `keyTravel` while pressed on |
| Button group | Keys on one raised plinth | The keys, as Button |
| Select | A key with a flat chevron on its top | Travels as Button |
| Checkbox | Small well, with a raised mark when checked | Mark rises |
| Radio | Round well, with a knob when checked | Knob rises |
| Slider | Rail (`metal`) with a puck | Puck follows the value |
| Progress, spinner | Groove (a ring for the spinner) with an `emissive` fill or arc | Fill advances, arc turns |
| Card, panel | Raised slab | None (a panel may move through depth) |
| Link, badge, divider | None: flat text, a flat pill, a groove | None |

### Instrument objects

At the Instrument level each control's object is built from **parts**: meshes generated in code from tokens (revolved
profiles for caps, skirts, lenses and needles; extruded shapes for levers, slots and plates; holes cut by CSG), cached
per parameter set and instanced. The footprint rule holds unchanged. Every part has a name from this vocabulary, which
anatomy pages, tokens, diagnostics and custom parts share:

| Part | What it is | Moves | Captured content |
| --- | --- | --- | --- |
| `cap` | The top a finger touches: a knob's cap, a push button's cap | Turns (knob) or travels (push button) | On push-button caps only |
| `skirt` | The flange at a knob's base, wider than its cap | Turns with the cap | None |
| `collar` | A fixed ring between a knob and the faceplate | No | None |
| `chamfer` | The polished bevel ring at a cap's top edge | With its cap | None |
| `pointer` | The engraved line or notch that shows a knob's value | With its cap | None |
| `carriage` | The block that rides a slot: a fader's cap, a slide switch's block | Slides | None |
| `slot` | The opening a carriage rides in, printed or cut | No | None |
| `grip` | The index line or ridges on a carriage | With its carriage | None |
| `lever` | A bat switch's arm | Tilts about its pivot | None |
| `pivot` | The axis a lever, paddle or needle moves about; a pin where it shows | No | None |
| `ball` | The ball at a lever's end | With its lever | None |
| `nut` | The nut that holds a bushing to the plate | No | None |
| `bushing` | The threaded sleeve a lever stands in | No | None |
| `plate` | A wall plate; a machined card or panel | No | None (the face under it is the page) |
| `paddle` | A rocker's two-facet plate; a wall switch's paddle | Tilts about its pivot | None |
| `bezel` | The ring around a lens, a display window or a push button | No | None |
| `lens` | The glass over a lamp or LED, or a push button's lit ring: an emitter's part | No | None |
| `window` | The flat glass over a display or a meter | No | None: the text is the face under it, read through the glass |
| `needle` | A meter's or gauge's pointer | Turns about its pivot | None |
| `dial` | The printed scale under a gauge's window | No | It is the captured face |
| `segment` | One LED segment of a bar meter, lit or dark | Shown or collapsed | None |
| `plinth` | The block a group of caps stands on (a keypad, a preset bank) | No | None |

- **Heights scale with depth,** as section 2's elevations do: 0.6, 1 and 1.6 times the 50% value at 0, 50 and 100%.
  Widths, diameters, travel and angles do not.
- **Poses.** A moving part has a pose: `travel` (along the face normal), `slide` (in the face plane), `turn` (about the
  face normal) and `tilt` (about an axis in the face plane), about the part's `pivot`. Native state sets one position
  `t` from 0 to 1 along the travel, from one stop to the other, and each moving part of the object takes the pose
  `mix(from, to, t)` ([rendering model 2D.2](rendering-model.md#2d2-parts-profiles-and-poses)).

### Poses and containment

- **Containment over the whole travel.** Every drawn pixel of every pose a part can take, a spring's in-between poses
  included, lies inside `bounds`, the control's border box. The stops alone are not enough: a bat's ball comes closest
  to its box at mid-travel, and faceted revolved parts bind at in-between angles (a knob's cap at `t` = 0.125, its
  pointer at `t` = 0.75) ([I0.2](instrument-phase0.md#i02-moving-parts-and-hits)). Containment is checked on decoded
  GPU pixels at the stops and mid-travel, and by projecting every vertex through the travel
  ([rendering model 2D.9](rendering-model.md#2d9-geometric-guarantees)).
- **Poses never pass a stop.** `t` stays within 0–1, so the travel bounds every pose (section 12).
- **The box rule.** A control's box is its moving parts' orthographic footprint over the whole travel, plus a margin of
  `ceil(drift(h_max) + 1)` on every side, with `h_max` the tallest point of the moving parts and `drift` taken at the
  reference stage (1920 × 1080, `D` = 2,400). A form may ask for a bigger box, never a smaller one. Static parts are
  sized from the box and follow the taper rule.
- **Hits never move.** The box is the hit area at every pose. A pose is a uniform update: no capture and no change to
  hit geometry. Click-to-set scales are printed on the face (height 0), because a click aimed at a tall drawn part lands
  off it by its drift, up to about 4 px at the stage's corners.
- **Breaking the rule:** an object that would draw outside its box is drawn as its Relief primitive, in its place in
  the list, and a diagnostic names it. A layer has one renderer (section 16), so it is never drawn as an Objects object
  inside an Instrument layer.

### Instrument camera

`D = max(2400, max over parts of r · h / inset + h)`, where `r` is the stage half-diagonal and `h` and `inset` belong to
each part's **binding vertex**: over the whole travel, the vertex whose orthographic position comes closest to the box
edge, `h` its height and `inset` its distance inside the box, less 0.5 px. At 1920 × 1080 it gives 2,400, the floor
([I0.1](instrument-phase0.md#i01-mesh-pass)); a larger stage raises `D` instead of shrinking a part. Section 2's
`camera.distance` defaults to this floor at the Instrument and Scene levels.

### Captured caps and the no-shear rule

- **Only parts that stay parallel to the face carry captured content:** push-button and key caps, and the face under
  a display window. Such a cap reads the layer's capture at its own pixel (the texel at the pixel's position less the
  layer's origin), so its label maps one texel to one pixel at every point of its travel, with no resampling. Its text
  runs lie inside its projected top at every pose.
- **Turning, tilting and sliding parts never carry captured content.** A knob's cap carries a pointer; its scale and
  label are printed on the faceplate (principle 2).
- **No shear.** A part's placement is rigid: rotation and translation only. The screen-locking of solids above is
  never built into a sheared world matrix, because Lite derives normals from its upper 3 × 3, so a shear tilts them
  ([I0.1](instrument-phase0.md#i01-mesh-pass)). Captured caps get their exactness from the capture read; every other
  part follows the taper rule.
- **Captured caps are drawn after the post chain** (section 16), so no filter touches their text.

### Custom parts

An application may replace one named part with its own glTF: `parts: { knobCap }` (the GPU helper's option, a glB URL or
buffer with the box its vertices must lie in). Core loads it ([core work item 5](instrument-phase2.md#core-work-item-5-custom-parts)):
asynchronously and never inside a frame, into a per-engine cache under a byte budget; until it is ready, and if it fails, the
part is not drawn and core reports it in `state().instrument`.

- **Anchors.** A custom part declares five anchors in its own units: `base` (the point that stands on the face or on
  the part below), `pivot` (the point it turns or tilts about), `cap` (the height of its top), `pointer` (the direction
  of value 0 on a turning part) and `travel` (the axis it slides or travels along). Fitting by anchors is the helper's and
  is **not implemented yet**: core's custom part takes a uniform `scale` and an `offset` on a glTF reference, in part-local px.
- **The `bounds` check.** The part is checked as a built-in one is, over the whole travel, on the mesh's own vertices. A part
  that fails is not drawn and its object is drawn at the Relief level, with a diagnostic naming it. While the file loads and if it fails, the built-in part stands in: the custom part's `fallback` (the built-in parts, which the
  helper passes) is drawn until the mesh is, and the swap is in the frame the mesh is drawn.
- **Limits:** a custom part carries no captured content, counts as one part kind in the budgets and takes its material
  from its role, so themes and characters still apply.

### Part budgets

| Budget | Value | Counted in |
| --- | --- | --- |
| Parts per layer | 2,048 | Instances |
| Parts per stage | 6,000 | Instances |
| Part kinds per layer | About 16 | Draw calls: a kind is one mesh and material, instanced |
| Objects per layer | 256† | As relief primitives |

- **Measured on one fast GPU** (an RTX 3080, [I0.1](instrument-phase0.md#i01-mesh-pass)). A low-end GPU is still to be
  measured, and may lower them. A layer over budget is drawn at the Objects level and reported.
- **Lit and dark are two kinds:** Lite's PBR ignores per-instance colour, so a meter's lit and dark segments are two
  kinds, each shown or collapsed.
- **Live values are poses.** A meter driven at frame rate moves its segments or needle as a pose; writing
  `<meter value>` each frame would recapture its layer each frame. Its DOM value is synced at a low rate for assistive
  technology.

### Instrument object table

The `premium` character's objects. Heights are at 50% depth; numbers come from the second iteration of the
[I1 prototype](instrument-phase0.md#i1-prototype-second-iteration), whose look sign-off is pending with the owner, and
those it did not use carry a dagger. Components not yet prototyped get theirs in their phase. Components not listed here
keep their Objects object, drawn as meshes of the same shapes. Lit parts give their `emissive` strength lit / unlit.

| Control (form) | Static parts | Moving part | Motion | Box and parts (premium, 50% depth) |
| --- | --- | --- | --- | --- |
| Knob | `collar`; the scale, printed on the face | `skirt`, `cap`, `chamfer` and `pointer`, as one | Turn through `knob.sweep`, 270° | Dial box = skirt + 76 (140). Skirt Ø64, 2.5 high, 0.8 edge break, its top a 7.5° cone (a turned flange that catches the studio's strip). Cap Ø 0.8 × skirt (51), 16 high, with a spun top crowned 1.2 and a 2 px polished chamfer. Pointer 2.2 wide, from 0.28 to 0.86 of the top's radius, engraved in the cap's ink along the crown. Ticks at r + 5, numerals at r + 20 |
| Knob, glass cap | As Knob, with a printed hub ring (r 7) at the centre | `skirt` and a glass `cap` (a lens) with its `pointer` | As Knob | The cap is a plano-convex lens on the skirt: radius 0.45 × the metal cap's diameter (23), a 2 px wall and an elliptical dome to 22 high; its pointer in the faceplate's ink; it casts 0.45 of `shadow.strength` |
| Knob, detented | As Knob | As Knob | Turn in `detents` steps, 11 | 0.8 × the knob's size |
| Fader | `slot`, printed (5 wide); the scale | `carriage` with its `grip` (an index line, 1.6 wide) | Slide along `fader.travel`, 180 | Box 46 wide and the travel plus the carriage long. Carriage 30 × 42, 12 high, taper 0.6, radius 3: a brushed body, a 2 px polished chamfer and a brushed top |
| Switch `slide` | `slot` | `carriage` (a block), with an accent flag when on | Slide 28 | Box 64 × 28. Block 24 × 20, 6 high, taper 0.4, chamfer 2. Flag lit 1.0 when on, hidden when off |
| Switch `rocker` | `bezel`, 2 high | `paddle`: a two-facet plate (facets 12 / 4) on a `pivot`, with an accent flag on its On end | Tilt ±17.7° | Box 54 × 70 (the bezel stays 38 × 62: the tipped paddle's raised corners stand about 29 px at full depth and drift up to 12 px at the stage's edge, so a 38 × 62 box leaves them 6.7 px outside it). Paddle 28 × 50. Flag 18 × 9, 1.0 / 0.12. The paddle's shadow moves to its raised end |
| Switch `bat` | `nut` Ø24, 3 high; `bushing` Ø14, 7 high | `lever` with its `ball`, on a `pivot` | Tilt ±40° | Box 48 × 92. Lever 40 long (it scales with depth, at most × 1.15), pivot 5 up, base r 3.4, neck r 2.7, ball r 5.6: about 28 px head-on, with its shadow |
| Switch `wall` | `plate`, 3 high, radius 6 | `paddle`, with a lit dot near its On end | Tilt ±9° | Box 66 × 92, the plate 58 × 84 inside it (4 px for its edge and shadow). Paddle 30 × 54, 7 high, taper 0.6, chamfer 2, its top crowned 1.6 along its length (the reflection band moves as it tips). Dot 12 × 4, 1.0 / 0.12 |
| PushButton `momentary` | `bezel` (r 27 → 22.6, 3.2 high); the lit ring, a `lens` (r 22.6 → 20.6), 1.0 / 0.22, in the bloom | `cap`, carrying its captured label | Travel 4, while held; a contact gap darkens round the cap as it goes in | Box 64 (room for the halo). Cap Ø40, 6 high, taper 0.6, chamfer 2. As built for any label width: the cap a stadium `size.push` high (40) and as wide as its label, the box the cap + 24 (64 at medium), the bezel a stadium inset 5 and 4.4 wide, the ring a glass plate 0.5 on it of which the cap leaves 2.6 showing, the cap a body 5 high with the captured cap 1 on it. [Anatomy](components/button.md#11-push-button-form-momentary) |
| PushButton `latching` | As momentary, with an LED | `cap` | Travel 4 held, 1.8 latched | As momentary, and the LED a Ø6 glass lens (an 8 px socket) on the bezel's top edge, centred, its own emitter. [Anatomy](components/toggle-button.md#11-push-button-form-latching) |
| Lamp | `bezel`; `lens`, an emitter | None | The emitter turns on | Lens 28† ([I0.3](instrument-phase0.md#i03-emitters-and-the-pointer-light)); the box is the lens + 28 (56), 10 px each side of the bezel for the bloom halo. Bezel Ø lens + 8, 3 high, polished; the lens a glass plano-convex lens 0.4 of its diameter high over a socket printed on the face. [Anatomy](components/lamp.md) |
| StatusLight | `lens`, an emitter | None | `blink`, at most 3 flashes a second | Lens 10† (I0.3); the box is the lens + 16 (26); a glass lens 0.35 of its diameter high over a printed socket, no bezel. `blink.slow`, `normal` and `fast` are 1,600, 1,000 and 400 ms a cycle (never under 334 ms). [Anatomy](components/status-light.md) |
| Meter `bar` | `window` over the printed scale; `segment`s | Each segment an LED lens whose emitter is lit or dark | — | 16 `segments`† (I0.1). Box 286 × 58 (16 segments × 15 + 2 × `max(10 px, 1.6em)` + 8); segment lens Ø `size.meter` 10, 0.35 of its diameter high; window 2.4 high, a 2.2 px bevel. **The glass covers the scale, not the LEDs:** core's glass parts write no depth, and a window's exact pixels cover them where the capture is opaque. [Anatomy](components/meter.md) |
| Meter `needle`, Gauge | `bezel` (a Gauge's ring), `window`, `dial` (printed) | `needle` on a `pivot` | Turn through `meter.sweep` (100°) or `gauge.sweep` (240°), with a damped spring (`spring.meter`, `spring.gauge`) | Needle meter box 264 × 152, gauge `size.gauge` (160) + 24 square. Needle 2.2 wide from a 12 px tail, standing 2.4 over the glass; hub Ø 12, 4 high; window 2.4 high, a 2.2 px bevel; a gauge's bezel 3 high, polished. [Meter](components/meter.md), [Gauge](components/gauge.md) |
| RotarySelector | `collar`; the ring of positions, printed | As Knob | Turn to the selected option, one detent per option | As Knob |
| Display | `bezel`, `window`; the text, a native `<output>` printed under the window | None | The backlight, an emitter† | Box 236 × 58 on the prototype. Bezel 7 wide, radius 8, 2.4 high, chamfer 2, polished, standing 0.5 px inside the box ([I0.4](instrument-phase0.md#i04-materials-over-the-capture)); window 2.4 high with a 2.6 bevel; finish band 0.3, horizon 0.25; the rest in Phase I4 |
| Pad | `plinth` | `cap`: soft (`subsurface`), lit from below | Travel | Phase I5 |
| JogWheel | `collar` | A large `cap` with a finger dimple | Turn, wrapping | Phase I5 |
| Keypad | `plinth` | Push-button `cap`s | Travel | Phase I5 |
| PatchPoint | `plate` (a washer), `bushing` (the jack), `nut` | None; a cable end is shown when connected | — | Phase I5 |

## 7. Elevation and shadow

A surface's shadow follows from the light and its height. No component chooses its own shadow.

- **Offset:** `−light.xy / light.z · h`.
- **Softness:** the shadow grows over `2 · h + 1` px (GPU), and the CSS blur is `1.9 · h + 1`.
- **Strength:** `shadow.strength` is 0.24 at 50%, and runs 0.14 → 0.24 → 0.32 across depth. Range
  0–0.8.
- **Hover and press:** at the Relief level, hover multiplies a raised part's height by `state.hoverHeight` (1.6).
  At the Objects level, hover raises an object by a quarter of its height (a key by `keyHeight / 4`), so its shadow
  moves about as far as a Relief control's. Press multiplies the height by `state.pressHeight` (0.25); a key travels.
- **Outside the box:** shadows may fall outside a panel's box (the GPU outset, P0.5). They never
  receive hits.
- **Analytic, everywhere.** Every caster in the language is a rounded footprint or a circle, so every
  presentation draws shadows from this one formula: the Relief pass, a shader quad per caster at the Objects
  level, and `box-shadow` in CSS. Shadows on a face are always analytic. A shadow map is used only where one part
  falls on another at the Instrument level (below); at the Objects level a map's resolution, depth bias and fitted
  bounds cut and detach the shadow of a thin panel.

### Shadows at the Instrument level

Two kinds of shadow, each where it is exact ([I0.5](instrument-phase0.md#i05-object-on-object-shadow)):

- **On the face: analytic,** the formula above on each part's footprint at its current pose. A part casts the rounded
  box of its footprint at its mean height (a lever along its length); a ball casts a disc at its centre's height.
  Overlapping part shadows take the darkest. A moving part's shadow moves with it, as a uniform update. A glass part
  casts 0.45 of `shadow.strength`.
- **On other parts: a shadow map** from the key light, one per layer, in which every part casts and receives (a lever
  on its plate, a carriage in its slot, a cap on its plinth). The face is not a mesh, so the map never reaches it: face
  pixels outside the analytic footprints do not change.

| Token | Default | Range | Meaning |
| --- | --- | --- | --- |
| `shadow.map.size` | 4,096 | 2,048 or 4,096 | Map resolution, filtered by PCF. 2,048 is the cheaper choice, at a bias of 2.6 px |
| `shadow.map.bias` | 1.95 px | See below | Depth bias, in world px |
| `shadow.map.darkness` | 0.1 | 0–1 | The share of the key light's direct term a mapped shadow leaves |

- **Bias in world px,** below the depth along the light of the thinnest part (a 2 px plate is 3.05 px deep along a ray
  at 41°) and above about 1 px at 4,096 (1.95 px at 2,048). Outside that window a thin plate's shadow acnes or detaches.
  The window is narrow, so the light's depth range is **fitted to the stage**, and each part kind publishes the union
  of its placements for the fit.
- **Re-rendered on pose change only:** a still page does not render the map again.
- **Not used:** cascaded maps (several times the cost, and they split or acne a thin plate's shadow) and exponential
  maps (no usable shadow over a stage-wide depth range).
- **Contact shadows are optional,** off by default (`post.contact`, section 16): the costliest path, barely visible
  head-on, and mostly a copy of the map at cap bases.
- **Emitters cast no shadows** (section 3).
- **Still open for the look sign-off:** the prototype's second iteration runs the map at darkness 0.1, but whether a
  mapped shadow still reads lighter than the face shadow beside it (hence the range of 0–0.15†), and how a sharp mapped
  streak meets the softer face shadow at a plate's edge, are to be judged on its screenshots.

## 8. Colour

Colours are roles, defined per theme. Every role is configurable, and an application may add
themes beyond light and dark.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `stage` | 255, 255, 255 | 24, 26, 31 | Page background |
| `panel` | 233, 235, 239 | 44, 48, 56 | Panel faces |
| `field` | 255, 255, 255 | 30, 33, 40 | Field and well interiors |
| `secondary` | 247, 248, 250 | 62, 67, 78 | Secondary controls |
| `text` | 28, 30, 36 | 232, 234, 240 | Body text (13.96:1 and 11.00:1 on the panel) |
| `muted` | 90, 94, 104 | 168, 174, 186 | Secondary text (5.44:1 and 5.94:1 on the panel) |
| `accent` | 37, 99, 235 | 96, 145, 255 | Primary actions, selection, focus |
| `success` | 21, 128, 61 | 74, 196, 120 | Positive status |
| `warning` | 180, 83, 9 | 245, 166, 60 | Caution |
| `danger` | 196, 43, 43 | 255, 120, 120 | Destructive actions, errors |
| `info` | = `accent` | = `accent` | Information |
| `track` | 205, 209, 217 | 52, 56, 66 | Unfilled tracks |
| `knob` | 252, 252, 253 | 236, 238, 242 | Knobs and thumbs |
| `edge` | 118, 124, 136 | 132, 139, 154 | Boundaries of wells, tracks and knobs |

- **High-contrast themes:** `contrast` and `contrast-dark` take over from light and dark under
  `prefers-contrast: more`, or when set explicitly. Surfaces (`stage`, `panel`, `field`, `secondary`,
  `track`, `knob`) are white or black, text and `edge` are the opposite, and the bevel gain is 0. With the relief
  off, every raised face (controls, cards, panels) carries a 2 px `edge` outline (`outline.width`), so no control
  turns into bare text.

  | Role | `contrast` | `contrast-dark` |
  | --- | --- | --- |
  | `muted` | 46, 49, 56 | 215, 218, 224 |
  | `accent`, `info` | 0, 64, 192 | 140, 180, 255 |
  | `success` | 0, 100, 40 | 110, 220, 150 |
  | `warning` | 138, 60, 0 | 255, 190, 90 |
  | `danger` | 168, 20, 20 | 255, 150, 150 |

- **Role colours as text** (`accent-text`, `danger-text` and so on, for links and messages) are derived: the
  role colour mixed towards `text` by the smallest step that reaches 4.5:1 on every surface at every lit state.
  With the defaults, light `accent` (3.97:1 on the lit panel) and `danger` (4.33:1) need it.
- **Text on role colours** (`on-accent`, `on-success` and so on) is derived: white or near-black
  (16, 18, 22), whichever contrasts more.
- **Lit contrast:** with the defaults, every role keeps at least 4.7:1 with its text at the
  brightest lit state.
- **Non-text contrast (WCAG 1.4.11):** a control's shape and state never rest on fills that are close to
  the panel (`field`, `track`).
  - **Boundaries:** wells, tracks and unchecked marks carry a 1 px `edge` outline, at least 3:1 against the
    lit panel and against fields.
  - **Fills:** an `accent` fill (progress, slider, switch on) is at least 3:1 against the unfilled `track`.
  - **Knobs:** a knob is at least 3:1 against the track under it, or carries an `edge` ring. A knob keeps its
    colour in every state; on an `accent` fill it carries an `on-accent` ring instead.
  - **Not by colour alone:** state is also shown by position or shape (knob position, check mark).
- **Invariant, contrast on lit faces:** text against its face is at least 4.5:1, and large text and
  non-text indicators at least 3:1. This is measured on the **lit** face at the largest interior
  brightening and darkening (`interior.max`, 4%), not only at rest. Disabled controls are exempt,
  as in WCAG 1.4.3. At the Instrument level the lit face includes emitter light at its worst (the brightest emitter
  beside the text, the pointer light over it), and display text is measured through its glass.

## 9. Typography

Text lives on faces. Strata never lights, extrudes or tilts text at rest; tilted panels carry
their text with them.

- **Anti-aliasing:** text drawn by the GPU presentations comes from the browser's HTML-in-Canvas capture, which uses
  greyscale anti-aliasing. The CSS presentation uses the platform's (often LCD subpixel on Windows), which looks
  slightly sharper. This is a browser capture property, not a Strata setting.
- **One texel per pixel:** captured text is never resampled at rest: panels map 1:1, and raised tops are
  screen-locked (section 6). At the Instrument level it is never filtered either: no stage of the post chain reaches
  the face or a captured cap (section 16).

| Token | Default | Range |
| --- | --- | --- |
| `font.family` | `system-ui, sans-serif` | any |
| `font.mono` | `ui-monospace, monospace` | any |
| `font.size.caption` / `small` / `body` / `subtitle` / `title` / `headline` / `display` | 12 / 13 / 14 / 16 / 18 / 22 / 28 | 10–64, ascending |
| `font.weight.regular` / `strong` | 400 / 600 | 100–900 |
| `font.lineHeight.body` / `heading` | 1.45 / 1.25 | 1–2 |

## 10. Iconography

- **Default icons** are flat line icons on faces. They take the text colour and follow the text's
  contrast rule.
- **3D glyphs** (extruded icons) are allowed only at the Objects and Scene levels, as decoration
  beside a labelled control, and never as the only label.
- **Icon set:** configurable. Strata ships none of its own; it accepts SVG or an icon component.

## 11. Interaction states

Each state is a change of height, light, material or pose. None changes layout or the hit area.

Raised parts (keys, knobs) change height on hover and press as below. Wells (fields, checkbox and radio
wells, tracks) keep their depth: hover and press change only their interior light, by `state.hoverLift`
and `state.pressSink`.

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | Height `raised` | Key at `keyHeight` | Each moving part at the pose its native value gives | Relief recipe |
| Hover | Height × 1.6; interior +4% (`state.hoverLift`, clamped by `interior.max`) | Key rises by `keyHeight / 4` | No pose change: hardware does not rise under a finger†; the pointer light, where on, is the cue | Larger shadow; `brightness(1.04)` |
| Pressed | Height × 0.25; interior −4% (`state.pressSink` 6%, clamped) | Key travels `keyTravel` | A push button's cap travels its travel; other parts move only as their value changes | Smaller shadow; `brightness(0.96)` |
| Focus-visible | Accent edge 0.5–3.5 px outside the shape, anti-aliased | Emissive glow on the object | The Relief focus edge around the control's box; a lit ring brightens where the object has one | `outline: 3px solid`, offset 0.5 px |
| Selected or checked | `emissive` fill on the track or mark (`material.roles.trackOn`, `material.roles.indicator`) | Mark rises, track lights | The pose of the state (a lever thrown, a cap latched) and its emitter on | Accent fill |
| Disabled | Height 0, no bevel gain, 38% opacity text | Object flattened to the face | As Objects, flattened to the face†; emitters off | Flat; `opacity: 0.38` on content |
| Invalid | `danger` focus-style edge and message | Same, plus the edge on the bezel | As Relief, plus the edge on a display's bezel | `outline` in `danger` |
| Busy | `emissive` progress on the face | Same | A meter's segments or an LED ring; pulsing stops under reduced motion | Same |

At the Instrument level a state is a pose (section 6), a material value or an emitter. None of them recaptures the
layer, and none moves the hit area.

## 12. Motion

| Token | Default | Range | Used by |
| --- | --- | --- | --- |
| `motion.fast` | 120 ms | 0–400 | Hover, press, focus |
| `motion.normal` | 200 ms | 0–600 | Switch throw, key travel, small panels |
| `motion.slow` | 320 ms | 0–1000 | Panels entering and leaving through depth |
| `motion.easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` | any | Most transitions |
| `motion.easing.press` | `cubic-bezier(0.3, 0, 0.6, 1)` | any | Press and release |

- **Panel motion:** panels enter and leave through depth (from `elevation.modal` towards their
  level, optionally with tilt). Interactive content stays inert during such transition effects.
  - **CSS presentation:** `strataEnter(panel, { tilt })` and `strataLeave(panel)` from `@underglass/ui/dom` set
    `data-strata-motion` and `inert` and resolve when the motion ends, over `motion.slow`, with the tilt clamped to
    `camera.tiltMax`. A panel that has left stays invisible and inert until it enters again.
  - **Face mode (GPU on):** the CSS motion is off, because an enrolled panel's boundary never carries a CSS transform.
    The same calls move the panel on the GPU: core's `transition` scales it by `D / (D − elevation.modal)` about its
    centre, with the same tilt and fade, and its relief height travels between `elevation.modal` and its own level.
- **Invariant, reduced motion:** under `prefers-reduced-motion: reduce`, states change instantly,
  with no travel, tilt, parallax or particles. A theme cannot turn this off.

### Springs, detents and snaps

At the Instrument level a moving part follows a **spring** towards the pose its native state gives. Springs run in
Strata on the CPU with a fixed step, so a test reproduces a motion exactly. Their poses are uniform updates, sampled
into core keyframes: motion never recaptures ([I0.1](instrument-phase0.md#i01-mesh-pass),
[I0.2](instrument-phase0.md#i02-moving-parts-and-hits)).

- **The spring** acts on the position `t` along the travel, per unit mass, in fixed steps of 4 ms:
  `v += (−stiffness · (t − target) − damping · v) · dt`, then `t += v · dt`. It rests when `|t − target| < 10⁻⁴` and
  `|v| < 10⁻³`. Its damping ratio is `damping / (2 √stiffness)`: 1 arrives without overshoot, less overshoots.
- **Stops:** `t` is clamped to 0–1, and the velocity into a stop is dropped there. An underdamped spring therefore
  overshoots only between the stops (a detent settling), never past one, so containment over the travel (section 6)
  covers every frame.

| Token | Stiffness | Damping | Damping ratio | Moves |
| --- | --- | --- | --- | --- |
| `spring.knob` | 420† | 41† | 1.00 | A continuous knob's cap |
| `spring.detent` | 900† | 42† | 0.70 | A detented knob or selector settling on its detent |
| `spring.fader` | 420† | 41† | 1.00 | A fader's carriage |
| `spring.slide` | 600† | 49† | 1.00 | A slide switch's block |
| `spring.rocker` | 1,200† | 58† | 0.84 | A rocker's paddle |
| `spring.bat` | 1,400† | 45† | 0.60 | A bat switch's lever |
| `spring.wall` | 1,200† | 58† | 0.84 | A wall switch's paddle |
| `spring.button` | 1,600† | 80† | 1.00 | A push button's cap |
| `spring.meter` | 360† | 28† | 0.74 | A needle meter's needle |
| `spring.gauge` | 160† | 20† | 0.79 | A gauge's needle |

Stiffness ranges over 50–4,000† and damping over 5–200†.

- **Detents:** `detents` on a knob or selector makes it stepped. The native `step` is the source of truth (a detented
  knob's `step` is its range over `detents − 1`); the value changes only through the native input, and the detent
  spring then settles the cap on the new position. A RotarySelector has one detent per `<option>`.
- **Snaps:** levers, rockers and paddles move between their two stops. A click anywhere on the control, or a drag past
  centre, changes `checked`; the pose then throws to the other stop on its spring. The snap is visual: the native state
  changes once.
- **Reduced motion:** every pose is instant (`t` = target, no spring), detents and snaps do not animate, blinking and
  pulsing stop, and the pointer light has no fade. A character cannot change this.
- **Flashing:** blink and pulse tempos stay under three flashes a second (WCAG 2.3.1).

## 13. Layout and density

- **Spacing scale:** 2, 4, 8, 12, 16, 20, 24, 32, 40, 48 (`space.1`–`space.10`). The base unit is
  configurable (default 4).
- **Density:**

  | Density | Control height | Panel padding | Gap between controls | Gap between groups |
  | --- | --- | --- | --- | --- |
  | `compact` | 28 | 12 | 8 | 16 |
  | `comfortable` (default) | 34 | 18 | 12 | 20 |
  | `spacious` | 40 | 24 | 16 | 24 |

- **Spacing between controls:** components have no outer margin; the page places them. Separate controls in a row
  stand at least `gap.control` apart, and groups (fields, rows of controls, sections) at least `gap.group`. A raised
  control's cast shadow covers part of any gap, so a gap that looks generous in a flat design looks cramped here.
  Controls joined on purpose, such as the keys of a ButtonGroup, Toolbar or SegmentedControl on their plinth, are
  one control and keep their own spacing. A row that may be too narrow for its controls wraps; it never squeezes a
  control below its content. `.ug-stack` (groups, one under another) and `.ug-cluster` (a wrapping row of
  controls) apply these gaps.

- **Layering:** panels are the GPU layer unit, so pages should use a few large panels, not one
  panel per control (layer budget 32–64; 256 relief primitives per panel, P0.3).
- **Instrument density:** the level is built for about 250 controls on one screen at 60 fps, within the part
  budgets of section 6 and the 64 emitters per layer of section 3.
- **Component size:** independent of density, `data-strata-size` (`small`, `medium` by default, or `large`) on a
  component or a scope sizes its controls:

  | Token | Small | Medium | Large | Used by |
  | --- | --- | --- | --- | --- |
  | `size.indicator` | 16 | 20 | 24 | Checkbox and radio box, switch track height |
  | `size.switchWidth` | 30 | 36 | 44 | Switch track width |
  | `size.control` | −6 | 0 | +6 | Added to the density's control height (buttons, fields, selects) |
  | `size.font` | `font.size.small` | `font.size.body` | `font.size.subtitle` | Control text |

- **Invariant, target size:** every interactive target is at least 24 by 24 CSS px, whatever the
  density. Links inside a sentence are exempt, as in WCAG 2.5.8; a checkbox, radio or switch meets it
  through its label row.

## 14. Accessibility

Strata targets **WCAG 2.2 AA** and follows the **WAI-ARIA Authoring Practices** for every
component, in every presentation. The [plan](plan.md#accessibility) lists the tests. Language
rules:

- **Native first:** native elements first; ARIA only where no native element exists.
- **Contrast:** every configuration is checked on lit faces (section 8).
- **Focus:** the focus indicator is at least 2 px wide (default 3) with 3:1 against its
  surroundings, in GPU, CSS and forced colours.
- **Depth as a preference:** an application may expose depth to visitors ("less 3D"). Depth 0% is
  a complete, usable design, not a degraded one.
- **User preferences, applied automatically:**

  | Preference | Effect |
  | --- | --- |
  | `prefers-reduced-motion` | No travel, tilt, parallax or particles |
  | `prefers-reduced-transparency` | `glass` → `matte` |
  | `prefers-contrast: more` | The high-contrast theme: larger contrast margins, bevel gain 0, solid focus |
  | `forced-colors` | Flat 2D, system colours, no shadows or GPU shading |
  | `prefers-color-scheme` | Picks the light or dark theme, unless the application fixes one |

### Instrument controls

Knobs and faders are native range inputs, so name, role, value and keyboard come from the element. Their interaction
model was proven with real pointer and keyboard input in plain DOM and on the GPU
([I0.7](instrument-phase0.md#i07-interaction-and-accessibility)):

| Token | Default | Range | Meaning |
| --- | --- | --- | --- |
| `knob.sweep` | 270 | 90–330† | The cap's turn from minimum to maximum, degrees |
| `knob.dragPx` | 200 | 50–1,000† | Vertical drag for a full sweep, px |
| `knob.fine` | 0.1 | 0.01–1† | The drag rate while Shift is held |
| `knob.tapSlop` | 4 | 1–12† | A press that moves less than this, in px, is a tap |
| `knob.snap` | 2 | 0–5† | A ring click within this many degrees of a printed numeral sets exactly its value |

- **One native control covers the dial.** A transparent native input covers the whole dial, cap and scale ring; the
  drawn ring and cap are `aria-hidden` with `pointer-events: none`, so every click lands on the original control.
- **Drag:** vertical (the audio-plugin convention) at `knob.dragPx` per sweep, finer with Shift. The knob cancels the
  native `pointerdown` default, so the browser never sets the value from the pointer's x, and focuses the input itself.
  A circular drag may be offered as an option.
- **Ring click-to-set:** a click on the scale ring, outside the skirt, sets the value by angle: 0° at the top,
  clockwise over `knob.sweep`; a click in the gap below goes to the nearer end. The ring is printed on the face, so the
  click is not offset by drift. A click within `knob.snap` degrees of a printed numeral sets exactly that numeral's
  value (a numeral's box sits on whole pixels, about 0.5° off its true angle): the prototype's clicks on "0", "3", "5",
  "7" and "10" set 0, 30, 50, 70 and 100.
- **Cap tap, the single-pointer alternative (WCAG 2.5.7):** a tap inside the skirt (on the skirt or the cap) steps up
  by a **notch** on its upper half, down on its lower half. A notch is the input's `step`, at least 1% of its range:
  a 0.1 step on a 0–100 knob would need 1,000 taps. Taps reach every value a drag can.
- **Wheel:** one notch per wheel notch, through a **document-level**, non-passive wheel listener that finds the control
  with `elementFromPoint` and cancels scrolling only over a knob or a fader. A listener on the input itself is
  unreliable inside the canvas subtree.
- **Double-click** returns to the default value. **Keys** are the native range input's: arrows, Page Up, Page Down,
  Home, End.
- **Events:** every change goes through the input's `value`, firing `input`, then `change` at the end of a gesture, so
  forms behave as with the plain input.
- **Faders** are native vertical range inputs (`writing-mode: vertical-lr; direction: rtl`, with
  `aria-orientation="vertical"`). The native thumb is sized to the carriage's travel footprint, so dragging the drawn
  carriage moves the value. Track click, wheel, double-click and keys behave as on the knob.
- **Units:** `aria-valuetext` carries units ("−6 dB", with U+2212). Automation cannot hear it (the browser's protocol
  does not report `aria-valuetext` for a native range, and accessibility snapshots show the number), so **the manual
  screen-reader pass gains a script per new component** (a knob with units, a detented selector, meter values, a lamp's
  state), recorded with VAL-002 in [open issues](../open-issues.md) until performed.
- **Target size (2.5.8):** caps, levers and paddles are at least 24 × 24, and the box covers the whole travel, so the
  target never moves.
- **Meaning never rides on light alone (1.4.1):** a lamp's state is also its switch's and its label's, and LED colours
  pair with text or a shape. Sound and haptics are never the only feedback (section 20).
- **Forced colours, the CSS recipe:** under `forced-colors: active` Chrome strips every gradient and shadow, which left
  the prototype's fader, switches and push button invisible ([I0.6](instrument-phase0.md#i06-css-parity)). The
  Instrument recipe therefore has explicit rules: every object draws a 1 px system-colour border (`CanvasText`;
  `ButtonText` on buttons) on its box and on its moving part; state shows by position and a `Highlight` fill (a thrown
  lever, a latched cap, a lit lamp); focus is a system-colour outline. It also has a `prefers-contrast: more` branch.
- **Forced colours, the GPU:** core's functional admission marker fails under forced colours, so GPU never starts
  ([#133](https://github.com/RaananW/underglass/issues/133)). The page is then the CSS presentation, which the rules
  above keep usable, as the preference table asks.

### Invariants

These are validated in every configuration. Development builds report a broken invariant as an
error, and strict mode throws.

| Invariant | What validation does |
| --- | --- |
| One light per application | `light.*` in a subtree scope or component is rejected. |
| Footprint and taper | Raises `camera.distance`, then `taper`, and reports the change. |
| Contrast on lit faces | Reports the failing role and ratio. Derived on-colours are picked automatically. Configured colours are never altered. |
| Visible focus | Rejects focus width under 2 px or contrast under 3:1. |
| Target size | Reports controls under 24 by 24 px. |
| Reduced motion | Cannot be disabled by any token or character. |
| Elevation order | Rejects levels out of order. |
| Containment over the whole travel | Rejects a form whose box is smaller than the box rule (section 6). At runtime, an object that would draw outside its box is drawn as its Relief primitive and reported. |
| Emitters add light only | No emitter or pointer-light token reaches `light.*`; emitters cast no shadows. |
| Captured text is never filtered | The post chain's order, its clip and the place of captured caps are fixed (section 16); only its options are tokens. |
| An environment at the Instrument level | Rejects `environment.source: "none"` for Instrument layers and uses the studio. |
| Feedback is opt-in | `feedback.*` is off by default; no character turns it on; sound never starts before a user gesture. |

## 15. Theming and configuration

Strata exposes as much as possible to its users. **Every token in this document is
configurable**, within its range, unless the invariants table says otherwise.

### Layers

Configuration comes in layers. Each later layer overrides the earlier ones, token by token:

1. **Defaults:** the values in this document and in `strata.tokens.json`, then the character's
   ([section 19](#19-characters)).
2. **Theme:** an application theme, built once, for example
   `createStrataTheme({ depth: 0.4, light: { azimuth: 45 }, colour: { accent: "#0f766e" } })`. It
   can be serialised to and from the token JSON.
3. **Runtime updates:** the application changes any theme token while running (a dark-mode
   toggle, a depth control, a brand switch).
4. **Scope overrides:** a subtree overrides tokens for its contents. For example, a flatter
   sidebar is `<StrataScope depth={0.2}>` in React, `data-strata-depth="0.2"` in HTML, or the
   matching CSS custom properties. Light tokens are not scope-overridable.
5. **Component props:** a component accepts the tokens that apply to it, for example
   `material`, `density` or a colour role.
6. **Visitor preferences:** OS media queries (section 14) and any preference the application
   exposes, for example depth.

### What can be configured

| Group | Tokens | Scope-overridable |
| --- | --- | --- |
| Depth | `depth` (0–1), plus any individual depth token (it overrides the blend) | Yes |
| Light | `light.azimuth`, `elevation`, `intensity`, `ambient`, `colour`; `pointerLight.*` | No (application only) |
| Emitters | `emitter.*` | Yes |
| Camera | `camera.distance`, `tilt.max` | Yes (`tilt.max`) |
| Elevation | `elevation.*` | Yes |
| Shape | `radius.*`, `bevel.width`, `bevel.profile` | Yes (`bevel.profile`: application only) |
| Objects | `object.*`; at the Instrument level the part tokens of section 6, `knob.*`, `fader.*`, `detents`, `form` and custom `parts` | Yes |
| Springs | `spring.*` | Yes |
| Materials | Every preset's layers, custom materials, the material for each role, `environment.*`, `studio.*` | Yes (`environment.*` and `studio.*`: application only) |
| Shadows | `shadow.strength`, `shadow.map.*` | Yes (`shadow.map.*`: application only) |
| Post chain | `post.*` | No (application only) |
| Character | `character` | Yes |
| Feedback | `feedback.*` | Yes |
| Colour | Every role in every theme, plus additional themes | Yes |
| Typography | `font.*` | Yes |
| Spacing and density | `space.base`, `density` | Yes |
| Motion | `motion.*` | Yes |
| Focus | `focus.width`, `focus.offset`, `focus.colour` | Yes |
| Presentation | `level` (`relief`, `objects`, `instrument`, `scene`), adjust policy | Yes (`level`) |
| States | `state.hoverHeight`, `pressHeight`, `hoverLift`, `pressSink`, `interior.max` | Yes |

### How depth blends

Each depth token has three anchors, at 0%, 50% and 100% (the A, B and C prototypes).
`depth` interpolates piecewise-linearly between them. An application may:
- set `depth` alone (the common case);
- override individual tokens, which then ignore the blend;
- replace the anchors, defining its own "subtle" and "bold".

### Runtime mechanism

- **CSS:** tokens resolve to CSS custom properties (`--strata-depth`, `--strata-light-azimuth`,
  `--strata-colour-accent`, …) on the root and on each scope element. The CSS presentation
  computes its relief from these variables with `calc()`, so a token change restyles without
  regenerating CSS.
- **GPU:** the GPU presentation reads the resolved tokens per scope each frame.
  - Depth, light, material and state tokens are uniform updates: no capture.
  - Colour, typography, radius and density change the DOM's paint, so the affected panels capture
    fresh pixels as for any content change.
- **No fallback:** a configuration change never switches GPU off.
- **Serialisation:** a theme serialises to the W3C Design Tokens format, so it can be shared,
  versioned and loaded at runtime.
- **API:** `createStrataTheme(input)` builds and validates a theme (layer 2); `applyStrataTheme(theme)` writes it
  into the `strata.theme` cascade layer, between the defaults and the components, and its `update` applies runtime
  changes (layer 3); `strataScope(element, overrides)` applies scope overrides (layer 4). Invalid configuration is
  reported as an error by default; strict mode (`report: "throw"`, or `strict` when building a theme) throws.
- **Scope colours:** a scope that overrides colour roles names its theme, so contrast is checked against that
  theme's surfaces; the derived on- and -text colours are set with them.

## 16. Presentation levels and adjust policy

| Level | Default | What it adds | Without GPU |
| --- | --- | --- | --- |
| `relief` | Yes | Lit faces, bevels, wells, shadows, physical states | CSS relief |
| `objects` | Opt-in | PBR meshes per section 6, with travel and pose | CSS relief |
| `instrument` | Opt-in | Parametric meshes per section 6, with turn, tilt and throw; PBR lit by the studio and the reflected page; glass; emitters; shadows of parts on parts; the post chain; springs and detents; optional sound and haptics | The CSS skeuomorphic recipe |
| `scene` | Opt-in | Decorative 3D around the UI: particles, physics, environment light, over the Instrument level | Nothing (decorative) |

- **The ladder:** `relief < objects < instrument < scene`. `scene` adds the stage (backdrop, particles, environment
  light) to the level below it, which is now `instrument`, so an application at `scene` draws its panels at the
  Instrument level. The adjust policy's ladder stays linear: `scene → instrument → objects → relief`.
- **Granularity, per layer:** a panel with any component at the Instrument level is drawn with core's `instrument`
  material, and its components at the Objects level are drawn as meshes of the same shapes. A layer never mixes
  analytic and mesh objects, so one panel has one renderer.
- **Without GPU, the CSS skeuomorphic recipe:** conic and radial gradients for caps and lenses, layered `box-shadow`
  from the shadow formula and CSS 3D transforms for levers and rockers, from the same tokens. It is bound by a parity
  budget per component over the control's box, far looser than Relief's, because CSS cannot draw reflections,
  perspective or lit facets ([I0.6](instrument-phase0.md#i06-css-parity)).

- **Setting the level:** per application, per scope or per component. The Scene level's decorative layers belong to
  the stage, so they follow the level of the root (the application's, or a scope around the root). On the GPU (`@underglass/ui/gpu`) each
  element takes its own `data-strata-level`, else its nearest scope's, else the application's; a panel with any
  component at the Objects level is drawn with core's `objects` material.
- **Adjust policy (opt-in):** `adjust: { enabled, frameBudgetMs, stepDownAfterFrames,
  stepUpAfterFrames }`. When the 95th-percentile frame time stays over budget, components step
  down from `scene` to `objects` to `relief`, and they step back up after a recovery window.
  - **Reporting:** every step fires a diagnostic event.
  - **GPU stays on:** the policy never switches GPU off. Defaults are set from measurements on a
    low-end GPU (open: until then, 25 ms over a 60-frame window, 120 frames down and 600 up; open issue VAL-009).
  - **Where it runs:** `@underglass/ui/gpu` measures frame intervals itself and caps every element's level; the
    95th percentile ignores intervals over 250 ms (hidden tabs, stalls).
  - **The Instrument step:** `instrument → objects` redraws each Instrument layer with the `objects` material, whole
    layers at a time, and reports it; the camera stays (section 2). At the Instrument level the policy also reads the
    mesh pass's GPU time (Lite's per-task timings), since frame intervals stay pinned at the display's rate. The
    Objects forms must stay within a recorded parity budget of the Instrument look, so a panel keeps its character
    when it steps down; for the switches the prototype's Objects copy is further from Instrument than CSS is
    ([I0.6](instrument-phase0.md#i06-css-parity)), which the components must close.

### The Instrument post chain

At the Instrument level a layer's meshes draw into an offscreen target of their own, cleared transparent with its own
depth, and pass through a chain before they meet the captured face
([I0.8](instrument-phase0.md#i08-post-chain-and-reflections)):

1. **The mesh pass:** the layer's parts, captured caps excepted.
2. **Options,** off by default, in this order when on: TAA (first, since it jitters the mesh pass), contact shadows,
   bounced light (SSGI).
3. **SMAA,** the anti-aliasing.
4. **Emitter bloom:** bloom of an emitter target into which only the lit lenses are drawn; the composite adds
   `max(bloom − source, 0)`. A luminance threshold would also bloom specular highlights, because Lite's PBR clamps its
   output. Lamp boxes leave room for the halo.
5. **The clipped composite** over the layer's face, premultiplied and **multiplied by the mask of the controls' rounded
   boxes**. The clip is mandatory: SMAA, TAA and SSGI spill 0.2–2 px past part edges, and bloom further.
6. **Captured caps** and their LEDs, drawn after the composite.

| Token | Default | Stage |
| --- | --- | --- |
| `post.smaa` | `true` | Anti-aliasing |
| `post.bloom` | `true` | Emitter bloom |
| `post.taa` | `false` | Temporal anti-aliasing, an option |
| `post.contact` | `false` | Contact shadows, an option |
| `post.ssgi` | `false` | Bounced light, an option |

- **Captured text is never filtered.** The face is drawn by the layer's own pass, not in the mesh target, and captured
  caps come after the chain, so every stage leaves text pixels exactly as they were. The order, the clip and the place
  of captured caps are not tokens.
- **The face is not in the mesh depth buffer,** so contact shadows and bounced light act only between parts,
  consistent with the analytic face shadows of section 7.
- **The budget rule:** a stage is on by default only if its task costs about 2 ms or less at the 95th percentile at
  DPR 2, and the look justifies it. **TAA** stays an option until Lite's TAA clamps or reprojects: a plain history
  blend trails on parts that change state at once, such as meters. **Contact shadows** cost the most and barely show
  head-on. **SSGI** is a soft bounce, mostly of switch thumbs onto their tracks.
- **Without a stage:** with every `post` token off, the mesh pass may draw straight into the layer's target after the
  layer's pass, with the same result.

## 17. Component anatomy template

Every component has an anatomy page under [`docs/ui-library/components/`](components/README.md) with the
headings below. The [conventions](components/README.md#conventions) define the class names, the `data-strata-`
attributes and the seven relief primitives (`raised`, `well`, `groove`, `knob`, `mark`, `ring`, `flat`).

1. **Purpose and native element:** which element it renders (`<button>`, `<input type=checkbox
   role=switch>` and so on) and the WAI-ARIA pattern it follows.
2. **Object:** the canonical 3D object, its parts, moving parts and their travel. At the Instrument level: its
   parts by the names of section 6, their poses and travel, its box under the box rule, its emitters and its sounds.
3. **Faces and materials:** each face's role, colour role and material.
4. **Elevation per state:** rest, hover, pressed, focus, selected, disabled, invalid, busy.
5. **Relief primitives:** the shapes the material pass lights, as `data-strata-face`
   markers on the DOM.
6. **Tokens it reads:** and which it accepts as props.
7. **DOM structure and overlay needs:** the boundary element, and whether it portals to the
   overlay host.
8. **Keyboard and screen reader:** keys, roles, states and announcements.
9. **CSS presentation:** the recipe it uses, and any component-specific rules.
10. **Tests:** plain DOM, GPU (stays on, fresh pixels, native hits), accessibility, parity.

## 18. Distribution and frameworks

Strata is **standalone-first**. The language lives in framework-neutral layers; framework
packages are thin bindings that render the same markup and wire the same behaviour.

| Layer | Subpath | Contents | Depends on |
| --- | --- | --- | --- |
| Tokens | `@underglass/ui/tokens` | The token JSON, the typed token runtime, theme creation, validation | Nothing |
| HTML + CSS | `@underglass/ui/css` | The stylesheet: class names, custom properties, relief and face modes. Works with no JavaScript. | Nothing |
| Behaviour | `@underglass/ui/dom` | Plain-DOM behaviour where native elements need help (tabs, menus, dialogs, roving focus), state sync, scope attributes | Nothing |
| GPU | `@underglass/ui/gpu` | Relief, Objects and Scene levels, adjust policy | `@underglass/core` (optional peer) |
| React | `@underglass/ui/react` | Components and `StrataProvider` / `StrataScope` | `react` (optional peer) |
| Vue | `@underglass/ui/vue` | The same components and providers for Vue 3 | `vue` (optional peer) |
| Astro | `@underglass/ui/astro` | `.astro` components that render the markup on the server | `astro` (optional peer) |

- **One package, one version.** Framework dependencies are optional peers, so an application
  installs only what it uses.
- **One markup contract.** Each component's anatomy page (section 17) defines its DOM: elements,
  classes, attributes and ARIA. Every binding renders exactly that markup, so a plain HTML page, a
  React app, a Vue app and an Astro site look and behave the same. Binding tests compare the
  rendered DOM with the contract.
- **Order:** React first, then Vue, then Astro. Other stacks (Svelte, Solid, Angular, server
  templates) use the markup with `/css` and `/dom`; more bindings can follow.
- **Astro.** Astro components have no shared context, so they render the same markup through a slightly different
  API: controls take the Field props (`label`, `help`, `error`, `required`) and render their own Field, and
  RadioGroup renders its radios from `options`. The behaviours native elements need without a binding (ToggleButton
  state, `aria-disabled` blocking, checkbox `indeterminate`) come from `attachStrata` in `/dom`, which the components
  load as one small script.
- **Server rendering.** The markup and CSS render on the server with no JavaScript, so pages are
  readable and usable before scripts load. Astro components do exactly that. Behaviour and GPU
  presentation attach in the browser: through the plain-DOM runtime, or through React or Vue
  islands (`client:only`, as the [frameworks guide](../guide/frameworks.md) describes for
  Underglass). This gives Strata server rendering even though Underglass's own mounting is
  client-only (SCOPE-003 in the open issues).
- **No Web Components as the shared layer.** Strata relies on real native elements in the light
  DOM for forms, labels, focus order and ARIA relationships, which shadow roots make harder (form
  association and ARIA references do not cross shadow boundaries without extra machinery). Shadow
  DOM drawing in HTML-in-Canvas was reported fixed in Chromium
  ([WICG #116](https://github.com/WICG/html-in-canvas/issues/116), closed 2026-08-11), but neither
  Underglass nor Strata has probed it on the installed build. Light-DOM markup with small bindings
  is simpler and more robust.

## 19. Characters

A **character** is a bundle of Instrument tokens that gives the hardware its proportions, finish and feel. The
mechanics are the same in every character: parts, poses, containment, interaction, light and every invariant.

| Character | Feel | Reference | Status |
| --- | --- | --- | --- |
| `premium` | Machined aluminium and glass, understated, soft light, little ornament | Apple, Bang & Olufsen, Leica | **First,** and the default |
| `studio` | Precise, minimal, industrial: clean geometry, crisp detents, small exact indicators | Braun, Teenage Engineering, modular synths | Phase I5 |
| `hifi` | Heavy, generous, warm: big machined knobs, glowing dial windows, needle meters, chunky toggles | Marantz, McIntosh, 1970s receivers | Phase I5 |
| `playful` | Chunky, soft, rounded: big travel, springy motion, friendly shapes | Toys, game controllers, appliances | Phase I5 |

- **Setting it:** `createStrataTheme({ character: "premium" })`, per scope `<StrataScope character="hifi">`, and
  `data-strata-character` in plain HTML. A character is a validated theme layer on top of the defaults (section 15),
  so an application's theme still overrides any of its tokens.
- **What a character may set,** each within its token's range:
  - the part tokens of section 6: dimensions and profiles (cap shapes, skirt heights, chamfers), tapers, travel and
    throw angles, detent counts, `knob.sweep`;
  - the springs (section 12);
  - each component's default `form` (premium: Switch is `slide`);
  - material presets and role assignments, per theme (premium: `plate` is `metal` on light themes, `gunmetal` on dark);
  - emitter strengths and the `glowOn` and `glowOff` colours;
  - its sound set (section 20), never whether sound is on;
  - the studio and `environment.intensity`, but only when it is the application's character, since `environment.*` is
    application only; a scoped character's values for them are reported and not applied.
- **What a character may not set:** `light.*`; the elevation order; colour roles other than `glowOn` and `glowOff`
  (themes own colour, so contrast is checked once); focus; target size; the box rule; the guard; the post chain's
  order and clip; whether feedback is on; reduced motion; any invariant. Values that would break one are reported and
  not applied, as for any theme.

**Premium.** The first character's defaults, from the second iteration of the
[I1 prototype](instrument-phase0.md#i1-prototype-second-iteration) (the look sign-off on it is pending with the owner):
Switch's form is `slide` (the `bat` lever, now 40 px long and thrown ±40°, projects about 28 px head-on and is available
as a form); the theme picks the faceplate (`metal` on light, `gunmetal` on dark; an explicit plate overrides it); every
metal takes the key light's full direct term and reads from the studio and the page; glass is the capture refraction of
section 4; lit rings and flags are emissive and feed the emitter bloom; the pointer light, where an application turns it
on, lights the face at 0.3 of its strength; the numbers are those of the
[Instrument object table](#instrument-object-table), section 12's springs† and section 4's presets. They ship as
`@underglass/ui`'s token layer `characters/premium.json`, which lists its provisional values (the daggers) inside it;
`createStrataTheme({ character: "premium" })` applies it, reports anything a character may not set, and returns the
provisional tokens it set in `theme.character.provisional`.

## 20. Feedback

Instrument controls may click, tick and snap, and pulse under a finger. Feedback is **decorative**: nothing depends on
it.

| Token | Default | Meaning |
| --- | --- | --- |
| `feedback.sound` | `false` | Synthesised sound |
| `feedback.haptics` | `false` | A vibration pulse, where the device has one |

- **Opt-in,** per application or scope (`feedback: { sound, haptics }`), off by default.
- **Synthesised:** no audio assets. A character's sound set has four sounds: a **click** (a push button's press and
  release), a **tick** (a detent passed), a **thunk** (a latch) and a **snap** (a lever, rocker or paddle thrown). Each
  is made from three parameters per character, settled with Phase I3.
- **The engine:** Lite's audio engine (`createAudioEngineAsync`), each sound placed at its control's position on the
  stage. It is created only after the visitor's first gesture, as browsers require, and stays silent while the system
  is muted or the application turns sound off. The behaviour layer of section 18 depends on nothing, so where this
  lives (a subpath that may load Lite) is settled with Phase I3.
- **Haptics:** a short pulse through the Vibration API where present, only in answer to the visitor's own input on the
  control.
- **Never the only feedback:** every sound and pulse goes with a visible change of pose or state and with the native
  control's own state, so a visitor with sound off, a muted device or no vibration loses nothing.
- **Audio in:** a Meter or Gauge may take an audio source (`source`), analysed with Lite's `createAudioVisualizer`. The
  signal drives the pose, not the DOM value, which is synced at a low rate (section 6).

## Change log

- 2026-10-15: first draft. Depth at 50%, light from the top left (323°, 41°), light theme with
  a blue accent, and dark theme. The configuration model is "everything configurable within
  invariants".
- 2026-10-15: section 4 rewritten: open, layered materials (base, coat, sheen, iridescence,
  transmission, emissive), presets including `lacquer` (glass-coated), custom materials and custom
  shading, a generated studio environment, and contrast guardrails.
- 2026-10-15: the coat band became the finish zones (top 0–32%, bottom 70–100%), shared by Relief,
  Objects and CSS, after the tuning page showed materials were too subtle to see.
- 2026-10-15: screen-locked raised tops (section 6), the dark studio environment, and the captured-text
  anti-aliasing note (section 9).
- 2026-10-15: shadows are analytic in every presentation (section 7).
- 2026-10-15: added section 18: standalone-first layers, one markup contract, React, Vue and Astro
  bindings, and server rendering.
- 2026-10-16: anatomy pages for every Tier A component, with the markup conventions and relief primitives
  (section 17). From their review: the `edge` colour and non-text contrast rules, a darker dark-theme
  `track` (the accent fill reached only 2.5:1), objects for the remaining Tier A controls, wells that keep
  their depth on hover and press, cards at `raised`, and the inline-link target exemption.
- 2026-10-16: the high-contrast themes `contrast` and `contrast-dark` (section 8). The token source moved to the
  `@underglass/ui` package, which validates it and generates the token stylesheet.
- 2026-10-16: derived role colours as text (`accent-text` and so on, section 8), from the specimen's contrast checks.
- 2026-10-16: review of the specimen: lower relief (`shadow.strength` 0.24 at 50%, panels at 8), a switch knob
  that keeps its colour (ringed in `on-accent` when on), a tinted face for toggle buttons that are on, and a 2 px
  `edge` outline on raised faces in the high-contrast themes (`outline.width`).
- 2026-10-16: the Astro components and `attachStrata` (section 18).
- 2026-10-16: panel motion helpers for the CSS presentation (section 12).
- 2026-10-16: the theme runtime API (section 15): `createStrataTheme`, `applyStrataTheme`, `strataScope`, and the
  `strata.theme` cascade layer.
- 2026-10-16: component sizes (`size.*`, `data-strata-size`, section 13); checkbox, radio and switch default to 20 px.
- 2026-10-16: the Relief look is specified engine-neutrally in the [Strata Rendering Model](rendering-model.md).
  Interior changes are one factor for a face and its text (section 4, guardrails), and the token validator checks
  text and face scaled together.
- 2026-10-17: the Instrument level, from its [plan](instrument.md) and the [Phase I0 report](instrument-phase0.md),
  specified engine-neutrally in [rendering model part 2D](rendering-model.md#2d-instrument-version-4):
  - section 3: light at the Instrument level, emitters with protected rects and their budget, and the pointer light;
  - section 4: the `brush`, `grain`, `reflectance`, `dispersion` and `subsurface` layers, an Instrument column for every
    layer and preset, the `polished`, `gunmetal`, `gold` and `chrome` presets, the Instrument roles, a required
    environment (the generated studio and the reflected page) and glass as a refraction of the capture. The Objects
    column no longer claims transmission, which part 2B does not draw;
  - section 6: the part vocabulary, poses, containment over the whole travel, the box rule, the camera rule, captured
    caps and the no-shear rule, custom parts, the part budgets and the Instrument object table;
  - section 7: the shadow map for parts on parts; faces keep analytic shadows;
  - sections 11 and 12: Instrument states, and springs, detents and snaps;
  - section 14: the knob and fader interaction model and forced colours;
  - sections 15 and 16: the `instrument` level, the ladder, the Instrument step of the adjust policy and the post
    chain;
  - sections 19, Characters, and 20, Feedback.

  An application at `scene` now draws its panels at the Instrument level, and its `camera.distance` defaults to 2,400.
  Values marked † are provisional ([spec notes](instrument-spec-notes.md)).
- 2026-10-17: the Instrument values from the prototype's second iteration, which took the owner's review of the first
  ([spec notes](instrument-spec-notes.md) list each value's status):
  - section 3: no fill light at the Instrument level (the studio is the fill); metals take the full direct term
    (`direct` 1, was 0.2); the pointer light's warm colour, its face share of 0.3 and its 10 px guard feather; one
    guard feather per layer;
  - section 4: the presets' second-iteration values (`polished` 0.04, `gunmetal` brush 0.9, `lacquer` (28, 28, 30)),
    no grain on large plates, a `bezel` role in `polished` (bezels were in `plate`), glass as real lenses with
    absorption along the path and its reflection traced to the stand, the face or the studio (dispersion 0.2, was 0.5;
    the rim tint became an absorption tint), and the display window's finish band;
  - section 6: the object table's second-iteration numbers (2 px chamfers, crowned tops, a 7.5° skirt cone, a glass
    cap, a longer bat lever thrown ±40°, rocker ±17.7°, wall ±9°, push-button travel 4 / 1.8 in a 64 px box, the
    display);
  - section 7: glass casts 0.45 of the shadow strength; the map's darkness 0.1 is confirmed;
  - section 14: ring clicks snap to a printed numeral (`knob.snap`), and taps and the wheel step by a notch of at least
    1% of the range;
  - section 19: the premium defaults.
- 2026-10-18: section 3, the pointer light at the Relief and Objects levels: its highlight now travels across bevels,
  sides and domes (core's point-light specular term, core work item 2). No token or rule changed.
- 2026-10-18: section 6, the Instrument object table, from the switch forms (#146): the rocker's box is 54 × 70 (v2's
  38 × 62, which the bezel keeps, leaves the tipped paddle's corners outside it at the stage's edge), and the wall plate
  is 58 × 84 inside its 66 × 92 box. `premium.json` follows.
