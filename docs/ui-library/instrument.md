# Plan: the Instrument level, a 3D-first component library in Strata

**Status:** proposed plan (2026-10-17), for review. Nothing in it is implemented. It extends the
[Strata plan](plan.md) with a fourth presentation level and new components; it changes no existing component's
default look.

**Progress (2026-10-17):** Phase I0 (all eight probes) and the Phase I1 prototype page are done, reported in
the [Phase I0 report](instrument-phase0.md) (Canary 158.0.8110.0). The prototype's
[second iteration](instrument-phase0.md#i1-prototype-second-iteration) answers the owner's review of the first
(environment lighting, real glass, round knobs, crisper hardware); the look sign-off on it is pending with the owner.

**Upstream check (2026-10-17):**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit.
  Issues touched since the Carousel: [#186](https://github.com/WICG/html-in-canvas/issues/186) (rotated `canvasClip`
  hit testing, 2026-10-14, still open) and [#185](https://github.com/WICG/html-in-canvas/issues/185) (origin-trial
  feedback, 2026-10-13). [#148](https://github.com/WICG/html-in-canvas/issues/148) (precise hit testing) is still
  open. None of them changes this plan: Instrument objects never take hits, and every control stays a flat face.
- **Chromium hotlist:** not accessible without signing in; not rechecked.
- **Tested on:** no browser was run for this plan. The most recent Strata work was tested on Canary 158.0.8108.0,
  Windows 11. Phase 0 below names the build it tests.

## Goal

A library of **3D-first components that emulate real hardware**: knobs, faders, rockers, toggles, wall switches,
lamps, LEDs, meters, gauges, rotary selectors, illuminated push buttons and glass displays, next to the everyday
components (fields, tabs, dialogs) re-made as honest hardware. Every one of them is a **real HTML control**: a knob
is an `<input type="range">`, a rotary selector is a `<select>`, a lamp is an `<input type="checkbox"
role="switch">`, a meter is a `<meter>`. The GPU draws them as lit, shadowed, reflective objects mounted on the
live page, and in any other browser the same markup is a rich CSS rendering of the same object.

Requirements, in the user's words and ours:

- **Real, consistently styled, 3D-first.** Every element is re-thought as a physical object. How an object
  *works* (its parts, travel, pivots, detents, how states read) is the design language. What it is *made of*
  (brushed aluminium, glass, gold, black lacquer) is configuration.
- **Stunning, smooth, practical, performant.** The first character is **Modern premium** (machined metal and glass,
  soft light, tight tolerances, no ornament). Three more characters follow once the mechanics are settled
  ([Characters](#characters)).
- **Lights and shadows.** Lit lamps and LEDs really light the surrounding HTML; objects cast shadows onto the page.
- **Real HTML as the wall.** Objects are mounted on live HTML content; the page is the chassis and the faceplate.
- **Fully accessible,** under the same WCAG 2.2 AA and WAI-ARIA Authoring Practices rules and automated tests as
  the rest of Strata, with the extra rules a knob or a fader needs ([Accessibility](#accessibility)).
- **Within the GPU-first contract:** the original control, exact native hits, fresh pixels, GPU stays on, never a
  canvas clone.

## Decisions from the planning interview (2026-10-17)

| Topic | Decision |
| --- | --- |
| Relationship to Strata | **A new Strata level**, `instrument`, above `objects`: the same catalogue, API, tokens, themes, a11y harness and core, with every component re-imagined as a physical object. Not a sibling library. |
| What "real HTML" means | Controls stay native HTML (`<input>`, `<select>`, `<button>`, `<meter>`); the page is the wall the objects stand on, with their shadows and light falling on it. |
| Without GPU | **Rich CSS skeuomorphic** rendering from the same tokens: a knob still reads as a knob. Materials are simpler (no reflections, refraction or light spill). |
| Use | Audio and music tools, control panels (smart home, IoT, dashboards), showpiece pages and everyday app UI, in that order of catalogue priority. |
| Character | **Modern premium first.** Studio hardware, vintage hi-fi and playful are planned as later characters. |
| Camera | **Head-on, deep:** Strata's stage camera, with taller objects. Controls never move on screen. |
| Geometry | **Parametric with a custom slot:** every built-in object is generated in code from tokens; an application may supply a glTF for a part through documented anchors. |
| Feedback | **Opt-in sound and haptics,** off by default, synthesised (no assets). |
| Catalogue | **Forms plus new components:** every existing component gets a physical form at the new level, chosen by prop; new hardware components join the catalogue and also get Relief and CSS projections. |
| Everyday components | **Hardware-honest:** the layout people expect, built as real hardware (tabs are latching buttons on a rail), not literal metaphors (binder dividers). |
| Density | **About 250 controls** on one screen (a synth or a smart-home dashboard) at 60 fps. |
| Name | The level is **Instrument**: `level="instrument"`. |

## What the Instrument level is

Strata's levels become `relief` < `objects` < `instrument` < `scene`. Instrument includes everything Objects does
and adds:

| Part | Objects today | Instrument |
| --- | --- | --- |
| Geometry | Eight analytic kinds (key, slab, bezel, well, rail, mark, knob, puck), evaluated in the layer's pass | **Parametric meshes** with real profiles (a knurled cap with a chamfer and a skirt, a fader cap with a grip, a lever on a pivot, a rocker plate), in a mesh pass per layer |
| Moving parts | Travel and slide, along the screen plane | **Rotation, tilt and throw:** knobs turn, levers swing, rockers tip, needles sweep |
| Materials | The Strata recipe, lit analytically with a studio term | The same recipe on real PBR (Babylon Lite): clear coat, **anisotropic brushed metal**, transmission that **refracts the captured page**, iridescence, sheen |
| Light | The one key light; emissive materials glow but light nothing | The key light, plus **emitters**: lamps and LEDs that light nearby faces and objects, with glow that spills past a panel's edge; optionally the **pointer** as a light the visitor carries (also available at Objects and Relief) |
| Shadows | Analytic, on the face | Analytic on the face, plus object-on-object shadows where parts overlap |
| Motion | Easing tokens | Easing, plus **springs and detents** (a knob clicks through 11 positions, a lever snaps over centre) |
| Feedback | None | Optional synthesised sound and haptics |
| Without GPU | CSS relief | **CSS skeuomorphic** from the same tokens |

What does **not** change, because it is the language and the contract:

- **Flat faces carry input.** Every interactive surface is still the native element's box, parallel to the panel.
  A rocker's tilted plates and a lever are decoration; the click lands on the checkbox whose box covers the whole
  rocker. The box covers the whole travel of every moving part.
- **The native control is the object's footprint.** Every drawn pixel of an object lies inside its control's box
  (`bounds`), checked over the whole travel of each moving part (I0.2: parts bind at in-between poses, not only at
  the extremes), and an object that would break the rule is drawn one
  level down with a diagnostic, as Objects does today.
- **One key light per application.** Emitters add light; they never replace, move or recolour the key light, and
  the key light's shadows keep their one direction.
- **Text sits on faces,** never on a curved, tilted or turning part. A knob's cap carries a pointer and a scale,
  never a label; labels are printed on the faceplate (the page) next to it.
- **States are physical and hits never move.** Turning, throwing and tipping are uniform changes, not recaptures.
- **One token source.** The mesh profiles, the PBR parameters, the Objects and Relief projections and the CSS
  recipe come from the same tokens.
- **The Scene level includes Instrument** when the application is at `instrument` or above, so the adjust policy's
  ladder stays linear: `scene` → `instrument` → `objects` → `relief`.

### Characters

A **character** is a preset bundle: token values (heights, radii, travel, taper, detent counts, cap profiles),
default forms per component, default material roles and a sound set. The mechanics are the same in every
character; the proportions, finish and feel differ.

| Character | Feel | Reference | Status |
| --- | --- | --- | --- |
| `premium` | Machined aluminium and glass, understated, soft light, little ornament | Apple, Bang & Olufsen, Leica | **First.** The prototypes and all of Phase I3 ship in it. |
| `studio` | Precise, minimal, industrial: clean geometry, crisp detents, small exact indicators | Braun, Teenage Engineering, modular synths | Phase I5 |
| `hifi` | Heavy, generous, warm: big machined knobs, glowing dial windows, needle meters, chunky toggles | Marantz, McIntosh, 1970s receivers | Phase I5 |
| `playful` | Chunky, soft, rounded: big travel, springy motion, friendly shapes | Toys, game controllers, appliances | Phase I5 |

`createStrataTheme({ character: "premium" })`, per scope `<StrataScope character="hifi">`, `data-strata-character`
in plain HTML. A character never changes the light, the elevation order or any invariant; it is a validated theme
layer like any other ([design language section 15](design-language.md#15-theming-and-configuration)).

### Materials are configuration

Strata's materials are already open recipes with `glass`, `metal`, `lacquer` and `emissive` presets and colour
roles. "Make it gold" is `materials: { gold: { base: { metallic: 1, roughness: 0.25, colour: "gold" } } }` and a
role assignment; "cover it in glass" is `coat` at full strength or the `glass` preset on `knobCap`. Instrument adds
two material layers the real PBR can show:

| Layer | Parameters | Instrument (Lite PBR) | Objects and Relief | CSS |
| --- | --- | --- | --- | --- |
| `brush` | `strength` 0–1, `direction` radial, linear or circular | Anisotropy (`setPbrAnisotropy`) with a tangent map generated from the direction | A directional highlight streak on the bevel | A `repeating-conic-gradient` or linear hairline pattern |
| `grain` | `kind` knurl, fluted, sandblast; `scale` | A procedural normal pattern on the part it is assigned to | Not rendered | Not rendered |
| `reflectance` | `f0` 0–1, `tint` colour role | Specular reflectance (`setPbrMetallicReflectance`) of **dielectrics** (lacquer, glass, coats). I0.4: Lite applies the tint to dielectric F0 only, so on a metal it does nothing; what tells gold from chrome and brass from steel is the metal's **base colour** | The specular lobe's colour | The highlight gradient's colour |
| `dispersion` | `strength` 0–1 | Chromatic dispersion in glass (per channel in the capture-refraction shader, below; Lite's `setPbrDispersion` rides on its transmission, which a layer scene cannot use): prism colour at the edges of thick caps and lenses | Not rendered | Not rendered |
| `subsurface` | `strength` 0–1, `tint` colour role, `thickness` | Subsurface scattering (`setPbrSubsurface`): silicone pads, frosted lens covers, the `playful` character's soft caps | A softened bevel light | A softer inner glow |

Materials that reflect (metal, coat, glass) reflect the **captured page**, not only a studio: each panel's capture feeds a
local environment probe (`setPbrLocalEnvironment`, parallax-corrected with `enablePbrLocalCubemap`), so a knob shows the
faceplate print and the neighbouring controls on its skirt. The studio or HDR environment fills in what the page does not
cover, rotated with `setEnvironmentRotation` so its brightest region sits at `light.azimuth`: reflections then agree with
the one key light. See the [Lite feature map](#babylon-lite-feature-map).

Settled by [I0.4](instrument-phase0.md#i04-materials-over-the-capture):

- **Glass transmission is a custom capture-refraction shader, not Lite's transmission.** Inside a layer scene Lite's
  `setPbrTransmission` retargets the render task to an offscreen, clears the swapchain with a full-screen pass and
  lacks the scene's separate depth target: WebGPU validation fails and core falls back to DOM, and its fixed 1024²
  grab would blur text. The shader loads the layer's capture per pixel: flat glass shows exactly the capture texel,
  bevels and lenses refract it by Snell's law per colour channel (the `dispersion` layer), and a Lite PBR reflection
  shell sits over it.
- **`brush` needs a grain normal map** with the anisotropy; anisotropy alone barely reads.
- **The page reflection** is one local environment cube per layer, refreshed only when the layer is captured
  (`createPbrLocalEnvironmentProbeSet` copies its cubes once, so it cannot follow a live capture).

New material roles: `knobCap`, `knobSkirt`, `faderCap`, `lever`, `rockerPlate`, `plate` (wall plates and bezels),
`lens` (lamp and LED covers), `needle`, `display` (the glass of a display window), `glowOn` and `glowOff`.

## Catalogue

### New components

Every new component ships at every presentation (CSS, Relief, Objects, Instrument), with its anatomy page, its
WAI-ARIA pattern and the full test set, like every Strata component. The native element is the control; the
object is drawn around it.

| Component | Native element and pattern | Object (premium) | Moving part | Wave |
| --- | --- | --- | --- | --- |
| **Knob** | `<input type="range">`, Slider pattern; `detents` makes it stepped (`step`); `aria-valuetext` for units | A machined cylinder: chamfered cap with a pointer line, skirt, a printed scale on the faceplate around it | Cap turns through `knob.sweep` (default 270°); detented knobs click | 1 |
| **Fader** | `<input type="range">` vertical (`writing-mode: vertical-lr`, `aria-orientation="vertical"`) or horizontal | A slot in the faceplate with a capped carriage, a printed scale alongside | Cap slides the slot | 1 |
| **Switch forms** | The existing Switch, `<input type="checkbox" role="switch">` | `slide` (default in premium): a flush slide switch. `rocker`: two plates on a pivot. `bat`: a lever that snaps over centre. `wall`: a wall plate with a paddle | Tip, throw, slide | 1 |
| **Lamp** | `<input type="checkbox" role="switch">` with the lamp as its label, or a `<button aria-pressed>` when it is a momentary control | A lens on a bezel; off it is a dark glass dome, on it glows and **emits** | None; the emitter turns on | 2 |
| **StatusLight** (LED) | `<output>` or a `<span role="img" aria-label>`; an optional `aria-live` region names changes | A small lens; `colour` from a role; `blink` is a tempo token, off under reduced motion | None; emitter | 2 |
| **Meter** | `<meter>` (implicit role meter); `min`, `max`, `low`, `high`, `optimum` | A bar of LED segments behind a window (`segments`), or a needle meter (`form="needle"`) | Segments light; a needle sweeps with a damped spring | 2 |
| **Gauge** | `<meter>` or `<progress>` with `aria-valuetext` | A round dial under glass with a needle and a printed scale | Needle | 2 |
| **RotarySelector** | `<select>`; the native popup stays in the overlay host, as Select does today | A knob with a pointer over a ring of printed positions, one detent per `<option>` | Cap turns to the selected position | 2 |
| **PushButton** forms | The existing Button and ToggleButton, `<button>` | `momentary`: a machined cap with a lit ring. `latching` (ToggleButton): stays down with an LED on | Travel; ring lights | 2 |
| **Display** | The existing TextField, `<input>`, as `form="display"`; read-only displays are `<output>` | A glass window in a bezel, backlit, with the text printed under the glass | None; backlight is an emitter | 2 |
| **Pad** | `<button>`, with `aria-pressed` for latching pads | A square soft cap in a grid, lit from below when active | Travel; emitter | 3 |
| **JogWheel** | `<input type="range">` with `wrap` (an endless encoder: the value steps, the visual position wraps) | A large flat wheel with a finger dimple | Turns | 3 |
| **Keypad** | A `<fieldset>` of `<button>`s, Grid pattern for arrow keys | Push buttons in a grid on one plinth | Travel | 3 |
| **PatchPoint** | `<input type="checkbox">` or a `<button>` per jack; a `PatchBay` is a `<fieldset>` | A jack in a washer; a connected jack shows a cable end | None | 3 |

### Everyday components at the Instrument level

Hardware-honest forms, keeping the layout people expect. The default form is per character; `form` (prop, or
`data-strata-form`) chooses another. Components not listed stay at their Objects form (a card is a plate, a
divider a groove) or stay flat, because they are print on the faceplate.

| Component | Default form (premium) | Other forms |
| --- | --- | --- |
| Button | `momentary` push button, machined cap, lit ring on focus | `flush` (a key, as Objects) |
| ToggleButton | `latching` push button with an LED | `rocker` |
| Switch | `slide` | `rocker`, `bat`, `wall` |
| Checkbox | A small latching square button whose cap lights when checked | `flush` |
| Radio, RadioGroup | A **preset bank**: interlocking latching buttons, one down at a time (where the name comes from) | `selector` (a RotarySelector over the group) |
| Select | `selector` (RotarySelector) | `display` (a display with step buttons), `flush` |
| Slider | `fader` | `knob`, `wheel` |
| TextField, TextArea | `display` (a glass window in a bezel) | `flush` (a well, as Objects) |
| Tabs | Latching buttons on a rail; the panel is the faceplate under them | `flush` |
| SegmentedControl | Interlocking latching buttons on one plinth | `flush` |
| ProgressBar, Spinner | Segment meter, ring of LEDs | `flush` |
| Badge | An LED pill (a StatusLight with text) | `flush` |
| Rating | A row of lamps | `flush` |
| Card, Panel | A machined plate (`plate`); no screws in premium | `plate`, `tray` |
| Dialog | A plate that rises out of the chassis (depth entry), with its controls on it | `flush` |
| Drawer | A tray that slides out of the chassis edge | `flush` |
| Tooltip, Menu, Popover, Toast | Unchanged: overlay-host CSS, as today | — |

### Interaction, in detail

- **Knob:** pointer drag is vertical (the audio-plugin convention) at `knob.dragPx` per full sweep, finer with
  Shift; a circular drag is an option. The wheel steps; double-click returns to the default value. Keyboard is the
  native range input's (arrows, Page keys, Home, End). **Single-pointer alternative (WCAG 2.5.7):** a click on the
  scale ring sets the value, and a tap on the cap's upper or lower half steps it, so no drag is ever required.
- **Fader:** native vertical range input with the same drag and click-to-set behaviour.
- **Detents:** `detents` on a knob or selector snaps to `step` positions with a spring; the native `step` is the
  source of truth.
- **Levers and rockers:** a click anywhere on the control throws it; a drag past centre throws it too. The snap is
  visual.
- **Sound and haptics:** `feedback: { sound: false, haptics: false }` per application or scope. Sounds are
  synthesised (click, tick, thunk, snap, three parameters each, per character; no assets) through Lite's audio
  engine (`createAudioEngineAsync`), which places each click at its control's position with spatial audio and
  unlocks after the first user gesture as browsers require; silent when the system is muted or the application says
  so. Haptics use the Vibration API where present. Both are decorative: nothing depends on them.
- **Live audio into meters:** a Meter or Gauge may take an audio source (`source` prop), analysed with Lite's
  `createAudioVisualizer`, so a real signal drives the segments or the needle.

## Light: emitters

The one change to the light model. A lit lamp, LED, lit ring or display backlight is an **emitter**: a point light
at the lens's position, a small height above the face, with a colour from its role, a strength and a radius.

- **What it lights:** the panel's captured face around it, the objects near it (their sides and caps), and
  neighbouring panels whose scenes include it. Glow that reaches past a panel's edge draws in the shadow outset
  (P0.5), so a wall lamp lights the plain page around its panel without a Scene backdrop. At the Scene level the
  backdrop is lit too.
- **Falloff:** inverse square with a smooth cutoff at `emitter.radius` (default 6 lens diameters, range 1–20).
- **The contrast guard still holds.** The GPU helper collects the boxes of text-bearing elements into the scene as
  *protected rects*. Inside them, emitter light is capped at `interior.max` like any other interior change; outside
  them, it works at full strength. Decoded-pixel contrast samples test the worst case (a lamp beside a label, on
  both themes).
- **How they are lit:** emitters are Lite **clustered point lights** (`createClusteredLightContainer`,
  `createClusteredPointLight`), so a mixer with hundreds of LEDs pays a near-constant cost; the analytic additive
  term is what the Objects and Relief projections use for the same emitter.
- **Glow:** a bloom pass (`createBloomPostProcessTask`) runs on the mesh pass only, never on the captured face, so
  lamps bloom and text does not. **Settled by [I0.8](instrument-phase0.md#i08-post-chain-and-reflections):** bloom
  reads an **emitter target** (only the lit lenses are rendered into it), not a luminance threshold over the mesh pass:
  Lite's PBR clamps its output to [0, 1], so a threshold also blooms specular highlights. Lamp boxes leave room for
  the halo, and the composite is clipped to the controls' boxes.
- **Budget:** at most 64 emitters per layer scene (`setMaxLights`), **settled by
  [I0.3](instrument-phase0.md#i03-emitters-and-the-pointer-light) at 64 per layer with tiling**: emitters are binned
  into a 16×9 tile mask per layer, and the tiled face pass plus the clustered mesh lights cost about 2.1 ms at DPR 2
  (an untiled loop costs 2.30–2.63 ms for the face pass alone). The helper keeps the nearest by reach and reports when
  it drops one. The stage may have many more.
- **The face pool is a separate pass** (I0.3): a per-layer effect task drawn right after the layer's pass over its box
  and the outset, multiplying what is already on the canvas by `1 + E`. Core's straight-alpha layer blend cannot
  brighten what lies beneath, so a light term inside the relief shading cannot light the outset.
- **Shadows from emitters:** none in the first version; emitter light is additive. Shadow-casting emitters are a
  later step if the prototypes miss them. Bounced light (`createScreenSpaceGlobalIlluminationPostProcessTask`) is
  probed in I0.8 and adopted only if it fits the budget. I0.8 recorded it as an option, off by default: 1.50 /
  1.95 ms task p50 / p95 at DPR 2 for a soft bounce, mostly switch thumbs onto their tracks.
- **Preferences:** `prefers-reduced-motion` stops blinking and pulsing; `prefers-contrast: more` turns emitters
  into flat colour on the lens only; `forced-colors` flattens everything, as today.

### The pointer as a light

An application may make the pointer an **emitter the visitor carries**: `pointerLight: { enabled, strength,
radius, height, colour }`, off by default. It is not a second key light. The key light keeps its direction and its
shadows; the pointer light is additive, like a lamp, and the one-light invariant holds unchanged.

- **What it does:** a soft pool of light on the faceplate around the pointer, and a highlight that travels across
  every metal, coated and glass part as the pointer passes. Glossy knobs catch it on their skirts; brushed metal
  shows its streak turn with the pointer. Over the gaps between panels it draws in the shadow outset, so the light
  crosses from one panel to the next without a seam.
- **Where it works:** at the Instrument level as a clustered light, and at the **Objects and Relief levels** through
  the same analytic emitter term, so it is the one Instrument feature that reaches down to every GPU level. In CSS
  it is a `radial-gradient` overlay positioned from two custom properties, with the strength capped so no text
  under it changes beyond `interior.max`.
- **How it moves:** the GPU helper tracks `pointermove` on the stage, converts the pointer to stage px once per
  frame, and writes the emitter's position into every layer scene within reach. Scene data changes are uniform
  updates: no recapture, no relayout, no change to hit geometry. The light fades out over `motion.fast` when the
  pointer leaves the stage and fades in when it returns.
- **Guard rails:** the contrast guard applies as to any emitter, so text the pointer crosses is capped at
  `interior.max`. The light exists only on devices with a fine pointer (`pointer: fine`); it is off under
  `prefers-contrast: more` and `forced-colors`; `prefers-reduced-motion` keeps it (nothing in the UI moves) but
  removes the fade. It never carries meaning: hover, focus and selection stay as they are.
- **Why not a key light that follows the pointer:** moving the key light would move every shadow on the page
  with the mouse, so the "one consistent light is the signature of the language" rule would break, text contrast
  would change from frame to frame, and the CSS fallback could not follow.

## Rendering: decisions

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | **How Instrument objects are drawn.** | **A Lite mesh pass per layer** (the alternative that [Objects decision 2](phase4-objects.md#decisions) set aside): parametric meshes, thin instances per kind, a depth buffer cleared per layer, drawn after the layer's own pass so panels keep their painter's order. Real profiles, rotation, tilt, glTF custom parts and Lite's PBR (anisotropy, transmission, clear coat) need meshes; P0.4 proved 16,384 instances for under 1 ms. **I0.1 ([report](instrument-phase0.md#i01-mesh-pass)):** the pass draws straight into the layer's pass target with colour loaded, each scene in its own render task with `clr: false`; with the post chain of decision 10 it draws into a per-layer offscreen target instead (I0.8). Lite has no public call to insert a rendering context at a position; the probe reorders `getRenderingContexts` in place, which Lite documents as not writable, so Phase I2 needs a Lite API for the ordering or core owning one frame graph. | Signed-distance ray-marching of lathe and rotated shapes in the existing analytic pass. Reference-exact and no new pass, but no custom parts, costlier per pixel, and the material layers Instrument is for (brushed metal, refraction) would be approximations. |
| 2 | **What the standard guarantees.** | **Geometric and sampled:** version 4 of the [Rendering Model](rendering-model.md) defines each object's profile, pose per state, containment, cast footprint, emitters and the guard exactly, and lit colour at sample points within a tolerance, not texel-exact. Caps that carry captured content (push buttons, displays) stay exact, as screen-locked tops do today. | Colour-exact as Relief and Objects. Would force the standard to re-specify Lite's PBR. |
| 3 | **Captured content on parts.** | **Screen-locked caps sample the layer's capture,** as Objects does: labels on push-button caps and text under display glass map one texel to one pixel. Turning parts never carry captured content. | Capture per part. Breaks the one-capture-per-panel rule. |
| 4 | **Shadows.** | **Analytic on the face** (the Relief formula on each part's footprint, consistent with every other level), plus **screen-space contact shadows** (`createScreenSpaceContactShadowsPostProcessTask`) where a cap meets its plate, and a **per-layer PCF shadow map from the key light for object-on-object shadows only** (a lever on its plate, a cap in its slot), masked off the face. **Amended by [I0.5](instrument-phase0.md#i05-object-on-object-shadow):** (1) the map is PCF 4096 at bias 1.5e-3 (≈ 1.95 px world), with the light's depth range fitted to the stage, the bias set in world px (below a part's depth along the light, 3.05 px for a 2 px plate) and re-rendered on pose change only, about 0.07–0.14 ms at 60 controls; the face is not a mesh, so the map never reaches it; (2) CSM and ESM are not alternatives here (CSM costs 0.44–0.68 ms and splits or acnes thin plates; ESM gives no usable shadow over a stage-wide depth range); (3) contact shadows are **optional, not default** (1.5–3.2 ms, mostly duplicating the map at cap bases), decided by I0.8's budget. | Shadow maps for everything. Detached, cut shadows on thin parts (the Objects finding). |
| 5 | **Emitters.** | **Additive local lights in the shading of the face, the objects and the outset,** with protected rects for the guard. | Emitters as full Lite point lights with shadows. Richer, costlier, and the shadow direction invariant gets harder to explain. |
| 6 | **Geometry source.** | **Parametric in code,** from tokens: revolved profiles (caps, skirts, lenses, needles), extruded and swept parts (levers, slots, plates) built as mesh data, with **CSG** (`createMeshFromCsg`) cutting slots, wells and holes out of plates; cached per unique parameter set and instanced. **Mesh blending** (`createMeshBlendingPostProcessTask`) rounds the join where a skirt meets its plate, so a control reads as milled from one block. **Custom slot:** `parts: { knobCap: url }` loads a glTF for one named part, fitted to the documented anchors (base, pivot, cap, pointer, travel axis) and checked against `bounds`. | Authored glTF for everything. Downloads, fixed proportions, no theming. |
| 7 | **Level order and the Scene level.** | `relief < objects < instrument < scene`; `scene` adds the stage to the level below it, now Instrument. The ladder stays linear. | A separate `stage` flag orthogonal to the control level. Cleaner in theory; changes the existing level API and the adjust policy. |
| 8 | **Granularity.** | **Per layer,** as today: a panel with any component at the Instrument level is drawn with the instrument material and its Objects-level components are drawn as meshes of the same shapes. Mixed analytic and mesh objects in one panel are never drawn, so one panel has one renderer. | Per object. Two renderers in one panel, with their small differences side by side. |
| 9 | **Without GPU.** | **CSS skeuomorphic from the tokens:** conic and radial gradients for caps and lenses, layered `box-shadow` from the shadow formula, CSS 3D transforms for levers and rockers, with a parity budget looser than Relief's. | Pre-rendered sprite strips. Realistic, but assets per material and no live configuration. |
| 10 | **Anti-aliasing and the post chain.** | **TAA on the mesh pass** (`createTaaPostProcessTask`; SMAA where TAA ghosts on turning parts), then contact shadows, then bloom, all on the mesh pass **before** it is composited over the captured face, so captured text is never filtered. **Amended by [I0.8](instrument-phase0.md#i08-post-chain-and-reflections):** the default is **SMAA → emitter bloom → a composite clipped to the controls' boxes**, with the local environment probe as a material layer (frame p95 3.89 ms at DPR 1, 5.49 at DPR 2), and the mesh pass draws into a per-layer offscreen target for it. **TAA is an option** until Lite's TAA clamps or reprojects (a plain history blend: meters trail on 20–22% of their pixels); when on it runs first. **Contact shadows are optional** (I0.5 and I0.8: 2.78 ms task p95 at DPR 2, barely visible head-on), and SSGI an option. The clip is mandatory (TAA, SMAA and SSGI spill 0.2–2 px, bloom more), and captured key tops are drawn after the composite. Every stage left text pixels unchanged. | No post chain; rely on resolution. Bevel and skirt edges alias on every screen. |
| 11 | **Motion engine.** | **CPU springs and detents** in Strata (seeded, fixed-step, testable), sampled into core keyframes; Lite's animation manager (`createPropertyAnimationClip`, blending) drives the poses on the GPU side. **Havok hinge constraints** (`createPhysicsConstraint`) are the `playful` character's option for bat snap and jog-wheel inertia, since Havok is a WASM download. | Havok for everything. Real, but a download before the first click and a nondeterministic step. |
| 12 | **The pointer light.** | **An emitter the visitor carries** ([above](#the-pointer-as-a-light)): additive, no shadows, guarded like any emitter, available at Relief, Objects and Instrument, opt-in. | A key light that follows the pointer. Every shadow would swing with the mouse, breaking the one-light signature and the contrast guard. |

### Core work (additive)

Each item is its own PR with GPU tests, in order:

1. **Done** ([design note](instrument-phase2.md)). **`instrument` material kind:** `setMaterial(id, { kind: "instrument", scene })`, a mesh pass per layer with a
   depth buffer, thin instances with GPU culling (`enableThinInstanceGpuCulling`) and LOD partners for small
   parts, captured screen-locked caps, analytic face shadows and the containment check with its diagnostic and
   step-down. A mesh budget (provisionally 256 objects and 2,048 parts per layer, settled by I0.1) measured with
   Lite's per-task GPU timings (`getRenderTaskGpuTimings`), which the adjust policy reads too. **Settled by
   [I0.1](instrument-phase0.md#i01-mesh-pass):** 2,048 parts per layer and 6,000 per stage (5,920 parts cost about
   3 ms GPU p95 on the RTX 3080), counted in part kinds (draw calls), about 16 per layer; a low-end GPU is still to be
   measured. The pass must also apply the layer's clip and opacity, which the probe's meshes ignore, and update
   instances in the same frame as layout.
2. **Done** ([design note](instrument-phase2.md#core-work-item-2-emitters-and-the-pointer-light)). **Emitters** as clustered lights in the `instrument` material and as the analytic term in the `objects` and
   `relief` materials, with protected rects and the outset glow. The pointer light is an emitter whose position
   the helper rewrites each frame, through the one call this step adds (`handle.setEmitters`, uniform writes only).
3. **Shadows and post chain:** contact shadows, the per-layer PCF map from the key light masked to parts, TAA and
   bloom on the mesh pass.
4. **Reflections and glass over the capture:** the layer's capture as a local environment probe, and transmission
   that refracts it.
5. **Custom parts:** glTF loading for named parts, anchor fitting and the bounds check. Core never fetches at
   render time; the helper loads and hands core mesh data.

### Babylon Lite feature map

Checked against `@babylonjs/lite` 1.33.0 (1,191 exports). Core uses Lite only as an effect runner today
(`createEngine`, effect wrappers, dynamic textures, screenshots); Instrument is the first use of its scene stack.

| Lite feature | Use in Instrument | Where |
| --- | --- | --- |
| PBR: base, clear coat, anisotropy, sheen, iridescence, transmission, emissive | The Strata material recipe on real surfaces | [Materials](#materials-are-configuration) |
| `setPbrMetallicReflectance`, `setPbrDispersion`, `setPbrSubsurface` | The `reflectance`, `dispersion` and `subsurface` layers | Materials |
| Local environment probes, `enablePbrLocalCubemap`, `setEnvironmentRotation` | The captured page reflected in metal and glass; HDR aligned with the key light | Materials |
| Directional light, PCF/CSM shadow generators | The key light and object-on-object shadows (PCF; I0.5 ruled out CSM and ESM) | Decision 4 |
| Clustered point lights, `setMaxLights` | Emitters at mixer density | [Emitters](#light-emitters) |
| Screen-space contact shadows, bloom, highlight extraction, TAA, SMAA | The mesh-pass post chain | Decisions 4 and 10 |
| Screen-space global illumination | Bounced lamp light; an option, off by default (I0.8) | Emitters |
| Thin instances, GPU culling, LOD partners | 250 controls at 60 fps | Core work 1 |
| Extrude, tube, cylinder, torus, `createMeshFromData`, CSG, mesh blending | The parametric builder | Decision 6 |
| Animation manager, property clips, blending | GPU-side pose animation from Strata's springs | Decision 11 |
| Havok constraints | The `playful` character's physical snap and inertia | Decision 11 |
| Audio engine, spatial audio, `createAudioVisualizer` | Clicks placed at the control's position; a Meter driven by real audio | [Feedback](#interaction-in-detail), wave 2 |
| GPU timings | Probe budgets and the adjust policy | Core work 1 |
| GPU picking | Tests only: proving no mesh pixel lies outside its control's box. Never input. | Verification |
| glTF loading | Custom parts | Core work 5 |
| Sprites, billboards, XR, navigation, character controller, splatting, skeletons, flow graph, lightmaps, procedural sky | Not used: HTML is the 2D layer, and nothing here is a game | — |
| `createHtmlTexture` / `updateHtmlTexture` | Lite's own HTML-in-Canvas capture path. Core captures with its own paint listener and `drawElementImageToTexture`; whether Lite's path should replace it is a core question tracked as an issue, not a plan decision | Phase I2 |

Nothing here touches capture, native hits or geometry: objects are decoration over the captured layer, driven by
native state, as the contract already says for Objects.

## Phase I0: feasibility probes

Required by [AGENTS.md](../../AGENTS.md) before presentation work. Each probe is a playground page and a browser
test, reported in `docs/ui-library/instrument-phase0.md` with the WICG SHA, the hotlist access and the exact Canary
build. The probes share pages with the Phase I1 prototypes.

| Probe | Question | Pass condition | Result |
| --- | --- | --- | --- |
| I0.1 Mesh pass | Can a Lite mesh pass per layer run inside the shared engine next to the relief passes, keep painter's order across panels and hold 60 fps with 250 controls (about 1,500 parts) at 1920×1080, DPR 1 and 2? | GPU stays active; a panel over a panel hides its objects; frame time under 16 ms on the GPU runner and the dev laptop; state animation (50 meters, 20 knobs turning) causes zero captures over 300 frames. The mesh and part budgets are chosen. | **Passed** on one machine (RTX 3080; no low-end GPU yet) ([report](instrument-phase0.md#i01-mesh-pass)) |
| I0.2 Moving parts and hits | Do levers, rockers and fader caps stay inside their control's box through their whole travel, and do native hits land on the control at every pose? | 0 drawn pixels outside `bounds` over the whole travel (originally "at the extreme poses"; I0.2 showed parts bind at in-between poses); `elementFromPoint` and real pointer input hit the native input everywhere on the control; headless and headful. | **Passed** ([report](instrument-phase0.md#i02-moving-parts-and-hits)) |
| I0.3 Emitters | Can a lit lamp light the captured face, nearby objects and the outset without breaking the guard or hits? And can the pointer light move across panels at 60 fps? | Decoded pixels show the light pool on the face and past the panel edge; contrast samples beside a label stay above AA on both themes; hits unchanged; cost per emitter measured, the per-layer budget chosen. The pointer light crossing three panels over 300 frames causes zero captures and zero hit-geometry updates, at Relief, Objects and Instrument. | **Passed**, three caveats ([report](instrument-phase0.md#i03-emitters-and-the-pointer-light)) |
| I0.4 Materials over the capture | Do brushed metal, clear coat and glass transmission read as such over captured content, and does text under display glass keep its contrast? | Visual sign-off on the prototype screenshots; decoded contrast of display text above AA; GPU active through typing into the display. | **Passed** on the measured conditions; visual sign-off pending ([report](instrument-phase0.md#i04-materials-over-the-capture)) |
| I0.5 Object-on-object shadow | Does a per-layer PCF map give a clean lever-on-plate shadow without touching the face? | Shadow pixels on the plate, none on the face outside the analytic footprint; cost measured. | **Passed** (DPR 1 and 2, headless and headful); decision 4 amended ([report](instrument-phase0.md#i05-object-on-object-shadow)) |
| I0.6 CSS parity | How close can CSS knobs, faders and switches get to the GPU look from the same tokens? | A perceptual difference budget per component state, looser than Relief's, recorded. | **Answered**: budgets recorded ([report](instrument-phase0.md#i06-css-parity)) |
| I0.7 Interaction and a11y | Do the knob and fader pass as sliders with real pointer and keyboard input, with the 2.5.7 alternative, in plain DOM and GPU mode? | Playwright drives drag, click-to-set, wheel and keys; `aria-valuenow` and `aria-valuetext` follow; axe passes; accessibility snapshots match across modes. | **Passed** ([report](instrument-phase0.md#i07-interaction-and-accessibility)) |
| I0.8 Post chain and reflections | What do TAA, contact shadows, bloom, SSGI and a per-layer local environment probe cost at 250 controls, and does the captured text stay untouched by all of them? | Per-task GPU timings per stage; decoded pixels of text regions identical with the chain on and off; the stages that fit the I0.1 budget are adopted, the rest are recorded as options. | **Passed** (DPR 1 and 2, headless and headful), with the composite clipped ([report](instrument-phase0.md#i08-post-chain-and-reflections)) |

**If I0.1 fails** on budget, Instrument ships with a lower density target and the adjust policy; the look does not
change. **If I0.3 fails** on the guard, emitters light bevels, sides and the outset only, never face interiors.

## Phase I1: prototypes and the spec

Playground pages, not components, in the premium character: a **knob** (continuous and detented), a **fader**, and
the **rocker**, **bat** and **wall** switch forms, on one chassis panel with printed labels and scales, at the
Instrument and Objects levels next to the CSS rendering. Iterate on proportions, cap profile, skirt, travel,
detent feel, metal and glass until the look is accepted, then write the numbers into the spec.

Spec work, in [`design-language.md`](design-language.md):

- Section 3 (Light): emitters, their tokens, the protected rects and the budget.
- Section 4 (Materials): the `brush` and `grain` layers and the new roles.
- Section 6 (Objects): the Instrument vocabulary (cap, skirt, carriage, slot, lever, pivot, plate, paddle, lens,
  bezel, needle, dial, window), their tokens at 0, 50 and 100% depth, the pose rule for moving parts and the custom
  part anchors.
- Section 12 (Motion): springs (`stiffness`, `damping`), detents and snaps, and their reduced-motion forms (instant
  pose).
- Section 16: the `instrument` level and the ladder.
- New section 19, **Characters**, and section 20, **Feedback** (sound and haptics).
- Version 4 of the [Rendering Model](rendering-model.md): part 2D, Instrument, with its conformance suite
  (`instrument-4.json`: containment, poses, emitters, guard, sampled colours).
- Anatomy pages for Knob, Fader and the Switch forms.

## Phase I2: core

The five core items above, in order, each behind the same GPU tests the Objects pass has: stays on, fresh pixels,
native hits on the control, no recapture on state change, headful check.

## Phase I3: wave 1 components

Knob and Fader, and the `slide`, `rocker`, `bat` and `wall` forms of Switch, at every presentation: tokens, CSS,
plain-DOM behaviour (drag, click-to-set, detents), React, Vue and Astro bindings, the GPU scene builder in
`@underglass/ui/gpu`, anatomy pages and the full test set. Sound and haptics land here as the opt-in option, with
the premium sound set.

## Phase I4: wave 2 and the everyday forms

Lamp, StatusLight, Meter, Gauge, RotarySelector, the PushButton forms and Display; then the everyday forms table
above. The showcase gains an **Instrument** gallery page and one showpiece (a synthesiser panel or a smart-home wall,
decided then).

## Phase I5: wave 3 and characters

Pad, JogWheel, Keypad and PatchPoint; then the `studio`, `hifi` and `playful` characters, each a token bundle, form
defaults, material roles and a sound set, proven on the Phase I1 prototype page before its components are tuned.

## Accessibility

Everything in the [Strata plan's accessibility section](plan.md#accessibility) applies unchanged. Instrument adds:

- **Knobs and faders are native range inputs:** name, role, value and keyboard come from the element; `aria-valuetext`
  carries units (`"−6 dB"`); `aria-orientation` is set on vertical faders.
- **Dragging movements (2.5.7):** every drag has a single-pointer alternative (click-to-set, step on tap). Tested
  with real pointer input.
- **Target size (2.5.8):** caps, levers and paddles are at least 24 × 24 CSS px; the control's box covers the whole
  travel, so the target never moves.
- **Meaning never rides on light alone (1.4.1):** an on lamp also shows its state in the switch and its label; LED
  colours pair with text or a shape.
- **Motion and flashing:** blink and pulse tempos stay under three flashes per second (2.3.1); reduced motion makes
  poses instant and stops blinking; springs and detent animation are off.
- **Sound** is never the only feedback, is off by default, and starts only after a user gesture.
- **Contrast on lit faces** includes emitter light in the worst case, with the pointer light directly over the
  text; display text under glass is measured through the glass.
- **The pointer light carries no meaning** and changes no state; keyboard and touch users lose nothing when it is
  absent.
- **Forced colours:** every object flattens to the system-colour 2D control, as the rest of Strata does. Phase I0
  found two gaps ([findings](instrument-phase0.md#findings-for-later-phases)):
  - **Core's admission marker fails under `forced-colors: active`** (I0.3, I0.6): the marker is recoloured, the
    functional capture probe reports missing marker pixels and GPU never starts on any page. The page stays usable
    native DOM, but core's marker needs to opt out of forced colours (probably `forced-color-adjust: none`).
  - **The CSS recipe needs explicit `forced-colors` rules** (I0.6): Chrome strips every gradient and shadow, so the
    fader, the switches and the push button lose all their edges and only the knobs survive as outlines. Each object
    needs borders and `CanvasText` fills under forced colours, and the recipe a `prefers-contrast: more` branch,
    which it ignores today.
- **Screen readers:** the manual pass gains a script per new component (knob with units, detented selector, meter
  values, lamp state), recorded in [open issues](../open-issues.md) until performed.

## Verification

Per [AGENTS.md](../../AGENTS.md#verifying-a-change) and the [Strata plan](plan.md#verification), plus:

- **Containment and poses:** for every object with a moving part, 0 drawn pixels outside `bounds` over its whole
  travel, checked on decoded GPU pixels at the extreme and mid-travel poses and by a projection of every vertex
  through the travel (I0.2).
- **No recapture under motion:** turning, sweeping and blinking over 300 frames add zero captures.
- **Emitter guard:** decoded contrast samples beside the brightest emitter on both themes.
- **Density:** the 250-control page stays under budget on the GPU runner; the adjust policy steps from `instrument`
  to `objects` and back, reporting each step.
- **Parity:** CSS screenshots of the Instrument specimen within the I0.6 budget; Objects screenshots of the same
  panel within a recorded budget against Instrument, so one panel does not change character when it steps down.
- **Headful Canary** for every probe and every core PR.

## Repository layout

```text
packages/ui/src/tokens/instrument.ts      profiles, poses, emitters: the version 4 reference
packages/ui/src/tokens/characters/        premium.json, later studio.json, hifi.json, playful.json
packages/ui/src/css/instrument/           CSS skeuomorphic recipes per component
packages/ui/src/dom/                      knob, fader, detent and feedback behaviour (plain DOM)
packages/ui/src/gpu/instrument/           mesh builders, scene builder, emitters, custom parts
packages/core/src/                        instrument material, mesh pass, emitters, shadows, transmission
docs/ui-library/instrument.md             this plan; instrument-phase0.md the probe report
docs/ui-library/components/               knob.md, fader.md, lamp.md, ... (new); switch.md gains its forms
examples/playground/instrument-*.html     probes and prototypes
examples/showcase/                        the Instrument gallery and showpiece
tests/browser/ui-instrument-*.test.mjs    new files, so suites do not conflict
```

## Risks

- **Two renderers, one language.** Objects is analytic and Instrument is meshes; the same panel must not change
  character when the adjust policy steps down. Mitigated by one token source, one shadow formula, one guard and a
  measured Objects-to-Instrument parity budget.
- **The standard loosens.** Sampled colour within a tolerance is weaker than texel-exact. Mitigated by keeping
  containment, poses, captured caps, emitter placement and the guard exact.
- **Emitters and the guard.** A light pool next to text is exactly the case the guard exists for. Mitigated by
  protected rects, measured contrast and the I0.3 fallback.
- **Density.** 250 controls with meters animating is the densest page Strata has drawn. Mitigated by instancing,
  per-layer budgets, uniform-only state changes and the adjust policy; settled by I0.1.
- **Drag on a native range input.** Custom pointer handling on the control must never fight the native thumb or
  break form behaviour. Mitigated by driving `value` through the input and dispatching `input` and `change` events,
  tested in plain DOM first.
- **Vertical range inputs** rely on `writing-mode` support; verified on the installed build, with `aria-orientation`
  set explicitly.
- **Scope.** Four characters and three waves is a long catalogue. Phases are ordered so that each wave is
  shippable on its own and the premium character is complete before any other starts.
- **Overlays stay flat.** Menus, popovers and tooltips remain CSS, next to very physical panels. A later step may
  give them an Instrument CSS recipe.

## Left to Phase I1

Phase I0 settled some of these; the [report](instrument-phase0.md#decisions-taken-in-phase-i0) lists its decisions.

- ~~Exact tokens: cap profiles, skirt heights, travel and throw angles, detent counts and spring constants, emitter
  radius and strength, the premium material roles.~~ Proposed by the [I1 prototype](instrument-phase0.md#i1-prototype)
  and I0.3 (lamp radius 6 diameters, intensity 3,200), pending the look sign-off.
- ~~The part budget per layer~~ (2,048 per layer, 6,000 per stage, about 16 kinds per layer, I0.1) and the frame
  budget on a low-end GPU (not yet measured).
- ~~Whether the rocker and bat default to `slide` in premium, or whether premium has a visible lever at all.~~
  Proposed: `slide` by default, the bat kept but small (a lever projects about 12 px head-on), unless the look
  iteration makes a larger lever read.
- The sound set's three parameters per sound.
- The showpiece page.

The look iteration, on the prototype page. The [second iteration](instrument-phase0.md#i1-prototype-second-iteration)
took the owner's review of the first:

- ~~The materials and studio: carry I0.4's studio, material values and capture refraction into the prototype.~~ Done:
  I0.4's studio rotated to the key light, a capture probe per layer, brushed metal with the grain map, and glass as a
  capture-refraction shader with its reflection built in (rim +25.9 levels, hub magnified ×1.46, display text exact).
- ~~Chamfer width, the bat lever's size, visible paddle and push-button travel.~~ Done: 2 px polished chamfers, a
  40 px lever thrown ±40° with a 5.6 px ball, lit flags and a crowned wall paddle, 4 px button travel with a lit ring.
  `slide` stays the default.
- ~~The guard's feather or near-text cap.~~ Proposed: the pointer light lights the face at 0.3 of its strength with a
  10 px feather (the parts take all of it); lamps are still to be judged at I0.3's strength.
- ~~Object-on-object shadows.~~ In: analytic plus the PCF map at darkness 0.1. The softness change at a plate's edge
  is still to be judged on the screenshots.
- ~~The post chain's look.~~ In: SMAA, emitter bloom (the REC ring and lit flags) and the clipped composite; the probe
  no longer whitens the caps (I0.4's studio and box reach).
- ~~The panel's unused space.~~ The display window fills it. The Objects panel's drop shadow at 100% depth is still
  clipped by the frame.
- Still open: the sign-off itself, and the second iteration's own list of what still looks wrong (glass on flat
  blocks, the wall paddle's near-white "on", the push button's head-on travel, a subtle pointer light on dark).

## Pull request sequence

One concern per PR, each based on `main`:

1. This plan (docs only).
2. Phase I0 probes and the Phase I1 prototype page, with the probe report.
3. Design-language sections and version 4 of the Rendering Model (3a); 3b: its reference implementation,
   `instrument-4.json` with its GPU conformance test, and `premium.json` with the character runtime.
4. Core: `instrument` material and the mesh pass. 5. Core: emitters. 6. Core: object-on-object shadows.
7. Core: transmission over the capture. 8. Core: custom parts.
9. Knob (wave 1: [anatomy](components/knob.md); CSS, Relief, Objects and Instrument done, with the helper's `instrument` level). 10. Fader. 11. Switch forms, with sound and haptics as the opt-in option.
12. Wave 2 components, one or two per PR. 13. Everyday forms, a few per PR. 14. Instrument gallery and showpiece.
15. Wave 3 components. 16. Characters: studio, hifi, playful, one per PR.

PR 11, the Switch forms ([anatomy](components/switch.md#11-forms)): `slide`, `rocker`, `bat` and `wall` done in CSS, Relief and
Objects, with sound and haptics as the opt-in option; their Instrument parts are defined for the helper's `instrument` level.
