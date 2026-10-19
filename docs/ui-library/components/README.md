# Strata component anatomy

One page per component, with the headings from
[section 17 of the design language](../design-language.md#17-component-anatomy-template). Each page is
the component's **markup contract** (section 18): plain HTML, React, Vue and Astro render exactly the DOM
it shows, and binding tests compare against it.

## Conventions

**Class names** use the `ug-` prefix, Bootstrap-style: a block (`ug-button`), modifiers
(`ug-button--accent`) and parts (`ug-switch__knob`). States come from native pseudo-classes and ARIA or
native attributes (`:hover`, `:active`, `:focus-visible`, `:checked`, `:disabled`, `aria-invalid`,
`aria-busy`, `aria-pressed`), never from state classes.

**Strata attributes** use the `data-strata-` prefix:

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-strata-face` | Any element the material pass lights | The relief primitive: `raised`, `well`, `groove`, `knob`, `mark`, `ring` or `flat` (below) |
| `data-strata-material` | A face, a component or a scope | A material role (`buttonPrimary`) or preset (`lacquer`); overrides the role default |
| `data-strata-elevation` | A raised face | An elevation token name (`raised`, `floating`); the component's default when absent |
| `data-strata-level` | A component or a scope | `relief`, `objects`, `instrument` or `scene`, overriding the scope's level |
| `data-strata-depth` | A scope | Depth for the subtree, 0–1 |
| `data-strata-theme` | The root or a scope | `light`, `dark`, `contrast` or `contrast-dark`; the root follows the system without it |
| `data-strata-density` | The root or a scope | `compact`, `comfortable` or `spacious` |
| `data-strata-size` | A component or a scope | `small`, `medium` (default) or `large`: indicator, switch and control sizes |
| `data-strata-mode` | The root or a scope | `face`: the GPU paints relief, so CSS paints flat faces (no bevel, shadow or finish) |
| `data-strata-preview` | A control | `hover`, `active` or `focus`: shows a state statically, for specimens and tests only |
| `data-strata-form` | A Switch's row, or a Button or ToggleButton | `slide`, `rocker`, `bat` or `wall`: the switch's hardware form ([Switch, Forms](switch.md#11-forms)); `momentary` (Button) or `latching` (ToggleButton): a push button ([Button](button.md#11-push-button-form-momentary), [ToggleButton](toggle-button.md#11-push-button-form-latching)) |
| `data-strata-down` | A push button, or a latching form's key (`.ug-latch`) | `true` while it is held (the pointer or a key down), `false` once released: its ring lit and its cap down; set by `attachStrataPushButtons` |
| `data-strata-form` (latching forms) | A Checkbox's row, a RadioGroup's or SegmentedControl's fieldset | `latching` (Checkbox, SegmentedControl) or `bank` (RadioGroup): the native control drawn as latching buttons; `flush`, or none, is the look before ([Checkbox](checkbox.md#11-latching-form-latching), [RadioGroup](radio.md#11-latching-form-the-preset-bank-bank), [SegmentedControl](segmented-control.md#11-latching-form-latching)) |
| `data-strata-form` (structural forms) | A Slider's drawn root (`.ug-knob`, `.ug-fader`), a Card, a Panel, a Dialog or a Drawer | `knob` or `fader` (Slider), `plate` or `tray` (Card, Panel), `plate` (Dialog) or `tray` (Drawer): the control drawn as the Knob's or the Fader's object over the Slider's own input, as a machined plate or a recessed tray, a plate that rises out of the chassis or a tray that slides out of its edge; `flush`, or none, is the look before ([Slider](slider.md#11-hardware-forms-knob-and-fader), [Card](card.md#11-plate-and-tray-forms), [Panel](panel.md#11-plate-and-tray-forms), [Dialog](dialog.md#11-plate-form), [Drawer](drawer.md#11-tray-form)) |
| `data-strata-colour` | A Lamp or StatusLight | The lens's colour role: `glowOn` (default), `accent`, `success`, `warning`, `danger` or `info` ([Lamp](lamp.md)) |
| `data-strata-lit` | A StatusLight | `false`: an unlit light (lit when absent) |
| `data-strata-form` (indicator forms) | A Rating's fieldset, a Badge, a ProgressBar's wrapper (`.ug-progress-bar`) or a Spinner | `lamps` (Rating), `led` (Badge), `meter` (ProgressBar) or `ring` (Spinner): the control drawn as LED lenses, each an emitter lit by `--strata-lit`; `flush`, or none, is the look before. `data-strata-colour` is the lenses' role there too, `accent` by default for a bar and a ring ([Rating](rating.md#11-indicator-form-lamps), [Badge](badge.md#11-indicator-form-led), [ProgressBar](progress-bar.md#11-indicator-form-meter), [Spinner](spinner.md#11-indicator-form-ring)) |
| `data-strata-blink` | A StatusLight | A tempo token, `slow`, `normal` or `fast`: a lit light blinks, off under reduced motion ([StatusLight](status-light.md)) |
| `data-strata-backlight` | A Display's root (`data-strata-form="display"`, a TextField's `display` form or a read-only Display) | The backlight's role: `glowOn` (default, absent), `accent`, `success`, `warning`, `danger`, `info` or `off`; `data-strata-lit="false"` on it switches the light off ([Display](display.md)) |

**Relief primitives.** Each is a rounded box (or a circle) taken from the element's border box and its
`border-radius`. The GPU reads them from the markers, and the CSS presentation styles the same elements.

| Primitive | Shape | Lighting | Shadow | Examples |
| --- | --- | --- | --- | --- |
| `raised` | Rounded box at an elevation | Bevel lit from the light, interior within `interior.max` | Cast, from height | Button key, card, panel |
| `well` | Rounded box sunk by `elevation.well` | Inverted bevel: the edge nearest the light is dark | Inner, from the rim | Field, switch track, checkbox box |
| `groove` | A thin well, at most 8 px high | As `well`, narrower bevel | Inner | Progress bar, slider rail, divider |
| `knob` | Circle (or pill) on a well | Spherical shading | Cast onto the well | Switch knob, slider thumb, radio dot |
| `mark` | A glyph or shape raised inside a well | Bevel on its outline | Small cast | Check mark, indeterminate bar |
| `ring` | Annulus, with an optional arc | As `groove`; the arc as the fill | Inner | Spinner |
| `flat` | Rounded box, no height | Material only, no bevel | None | Badge, divider in forced colours |

**Edges.** Wells, tracks and unchecked marks carry a 1 px `colour.edge` outline, so their shape meets 3:1
against the panel ([non-text contrast](../design-language.md#8-colour)). Knobs carry one when they do not
reach 3:1 against their track.

**Derived parts.** A slider's puck and a progress bar's fill have no element of their own: the GPU and the
CSS pseudo-elements (`::-webkit-slider-thumb`, `::-webkit-progress-value` and their equivalents) place them
from the native value.

Moving parts (`knob`, `mark`, a pressed key) never change the native element's box. Their travel lives in
the GPU pose and in CSS `transform`, inside the box (the [footprint rule](../design-language.md#6-objects)).

**Overlays.** Dialog and Drawer are top-level panels rendered into a container: the page body, or the Underglass
root, where `@underglass/ui/gpu` presents each as its own GPU panel over a GPU-faded scrim. They are never inside a layer
and are made modal by `showStrataDialog` (inert background, focus, Escape). Other floating parts (menus, popovers,
tooltips, select popups) still portal to the Underglass overlay host and are CSS-presented there; Tooltip and Popover
portal to `<body>` and float in the top layer. Tier A has no
overlays: the native `<select>` opens the browser's own list.

## Specimen

The [specimen page](../../../examples/playground/ui-specimen.html) (`ui-specimen.html` in the playground) shows
every token, material, elevation and Tier A state from `@underglass/ui/css` in plain HTML and CSS. Its browser
test is the accessibility harness: axe in every theme and under forced colours, contrast on decoded pixels, the
light and depth, reduced motion, keyboard input and reflow.

## Tier A

| Component | Native element | Object |
| --- | --- | --- |
| [Button](button.md) | `<button>` | Key; `form="momentary"`: a push button, a machined cap with a lit ring |
| [IconButton](icon-button.md) | `<button>` with `aria-label` | Square key |
| [ToggleButton](toggle-button.md) | `<button aria-pressed>` | Latching key; `form="latching"`: a push button that stays down, with an LED |
| [ButtonGroup](button-group.md) | `<div role="group">` | Keys on one plinth |
| [Link](link.md) | `<a href>` | None (flat text) |
| [Field](field.md) | `<div>` with `<label>`, help and error | None (layout) |
| [TextField](text-field.md) | `<input>`; `form="display"`: a glass window in a bezel ([Display](display.md)) | Well with a bezel |
| [TextArea](text-area.md) | `<textarea>` | Well with a bezel |
| [Checkbox](checkbox.md) | `<input type="checkbox">` | Small well with a raised mark; `form="latching"`: a small latching square button whose ring lights when checked ([Latching form](checkbox.md#11-latching-form-latching)) |
| [Radio and RadioGroup](radio.md) | `<input type="radio">` in `<fieldset>` | Round well with a knob; `form="bank"`: a preset bank, interlocking latching keys on one plinth ([Latching form](radio.md#11-latching-form-the-preset-bank-bank)) |
| [Switch](switch.md) | `<input type="checkbox" role="switch">` | Track well with a knob; hardware [forms](switch.md#11-forms): slide, rocker, bat and wall |
| [Select](select.md) | `<select>` | Key with a chevron |
| [Slider](slider.md) | `<input type="range">` | Rail groove with a puck; `form="knob"` or `"fader"`: the Knob's or the Fader's object over the same input ([Hardware forms](slider.md#11-hardware-forms-knob-and-fader)) |
| [Card](card.md) | `<article>` or `<section>` | Raised slab; `form="plate"`: a machined plate, `"tray"`: the body a recessed tray ([Plate and tray forms](card.md#11-plate-and-tray-forms)) |
| [Panel](panel.md) | `<section>` | Raised slab, the GPU layer unit; `form="plate"` or `"tray"` as the Card ([Plate and tray forms](panel.md#11-plate-and-tray-forms)) |
| [Divider](divider.md) | `<hr>` | Groove |
| [Badge](badge.md) | `<span>` | Flat pill; `form="led"`: an LED pill, the StatusLight's lens before the text ([Indicator form](badge.md#11-indicator-form-led)) |
| [Spinner](spinner.md) | `<span role="status">` | Ring groove with an emissive arc; `form="ring"`: a ring of eight LEDs chasing at `chase.spinner` ([Indicator form](spinner.md#11-indicator-form-ring)) |
| [ProgressBar](progress-bar.md) | `<progress>` | Groove with an emissive fill; `form="meter"`: a groove of LED segments lit from the value, a running head while indeterminate ([Indicator form](progress-bar.md#11-indicator-form-meter)) |

## Tier B

| Component | Native element | Object |
| --- | --- | --- |
| [Dialog](dialog.md) | `<section role="dialog" aria-modal>` | Raised slab at `elevation.modal`, over a scrim; `form="plate"`: a plate that rises out of the chassis ([Plate form](dialog.md#11-plate-form)) |
| [Drawer](drawer.md) | `<section role="dialog" aria-modal>` | Raised slab on a viewport edge; `form="tray"`: a tray that slides out of its edge ([Tray form](drawer.md#11-tray-form)) |
| [Accordion](accordion.md) | `<details>` with `<summary>` | A stack of raised slabs; the header's chevron turns |
| [AppBar](app-bar.md) | `<header>` | A raised slab across the top, with controls on it |
| [Avatar](avatar.md) | `<span role="img">` or an `<img>` | A raised coin |
| [Chip and Tag](chip.md) | `<span>`, or `<button aria-pressed>` | A small raised pill; a filter chip latches |
| [Breadcrumb](breadcrumb.md) | `<nav>` around an `<ol>` of links | None (flat links) |
| [List](list.md) | `<ul role="list">` of `<li>` rows | One raised slab; actionable rows are flat links or buttons |
| [MessageBar](message-bar.md) | `<div role="status">` or `role="alert"` | A raised slab with an intent stripe |
| [Pagination](pagination.md) | `<nav>` around page links or buttons | A row of small keys; the current page is held down |
| [Skeleton](skeleton.md) | `<span aria-hidden>` placeholders | None (flat, shimmering) |
| [Tooltip](tooltip.md) | `<div role="tooltip" popover>` | A small floating slab in the top layer |
| [Toast](toast.md) | A `<section>` region with a `role="status"` list, from script | Floating MessageBars in the top layer |
| [Toolbar](toolbar.md) | `<div role="toolbar">` | Keys on one plinth, one tab stop |
| [Table](table.md) | `<table>` with `<caption>` and sortable headers | One raised slab; rows are flat |
| [Tabs](tabs.md) | `<button role="tab">` in a `role="tablist"` | Flat tabs over a rail groove; the selected tab's indicator is a mark in it |

## Tier C

| Component | Native element | Object |
| --- | --- | --- |
| [SegmentedControl](segmented-control.md) | Native radios in a `<fieldset>` | Keys on one plinth; the selected key is held down; `form="latching"`: interlocking latching keys with an LED each ([Latching form](segmented-control.md#11-latching-form-latching)) |
| [Rating](rating.md) | Native radios in a `<fieldset>`; a `role="img"` display | Stars printed on the panel (captured, no relief) |
| [Stepper](stepper.md) | An `<ol>` with `aria-current="step"` | Coins on a groove; steps to come are flat |
| [NavigationRail](navigation-rail.md) | A `<nav>` with a list of links, `aria-current="page"` | Keys on a raised slab down the start edge |
| [Popover](popover.md) | `<div popover role="dialog">` opened by a `<button popovertarget>` | A floating slab in the top layer |
| [TreeView](tree-view.md) | `<ul role="tree">` of nested `treeitem`s | One raised slab; rows are flat |
| [Carousel](carousel.md) | A `<section aria-roledescription="carousel">` of slides, with buttons | Captured slides in a frame, keys under it |
| [Menu](menu.md) | `<div popover role="menu">` of `menuitem` buttons, opened by a menu button | A floating slab with flat rows |
| [Combobox](combobox.md) | `<input list>` with a `<datalist>`; the browser's own list | A TextField well with a printed chevron |
| [DatePicker](date-picker.md) | `<input type="date">`; the browser's own calendar | A TextField well with a printed calendar |

## Instrument

The [Instrument level](../instrument.md)'s components: hardware objects over native controls, at every presentation.

| Component | Native element | Object |
| --- | --- | --- |
| [Knob](knob.md) | `<input type="range">` over a printed dial | A skirt and a cap with a turning pointer, a scale printed on the face |
| [Fader](fader.md) | `<input type="range">`, vertical (`writing-mode: vertical-lr`) or horizontal, its thumb the carriage | A slot in the faceplate with a capped carriage, a scale printed beside it |
| [RotarySelector](rotary-selector.md) | `<select>` over a printed dial, one detent per `<option>` | A knob that turns to the chosen option, the options' labels printed round it |
| [Lamp](lamp.md) | `<input type="checkbox" role="switch">` in its label row, or a `<button aria-pressed>` when `momentary` | A lens on a bezel: dark glass off, glowing and emitting on |
| [StatusLight](status-light.md) | `<span role="img" aria-label>`, a `<span>` with its label, or a live `<output>` | A small lens with an emitter; `colour` a role, `blink` a tempo token |
| [Meter](meter.md) | `<meter>` (role `meter`) with `min`, `max`, `low`, `high`, `optimum` | A bar of LED segments lit from the value (each an emitter, in its zone's colour), or a needle on a printed arc on `spring.meter`; a held `peak` |
| [Gauge](gauge.md) | `<meter>` (a bounded measurement; not `<progress>`) | A round dial under glass: a needle on `spring.gauge` over a printed scale, a red zone from `high` |
| [Display](display.md) | The TextField's `<input>` as `form="display"`, or a read-only `<output>` | A glass window in a bezel over the printed text, backlit by emitters (`backlight` a colour role); the text stays captured content |
