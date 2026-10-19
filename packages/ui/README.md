# Strata for Underglass experimental private package

`@underglass/ui@0.1.0` is **Strata**, the 3D design language and component library for Underglass. It is
private and not published or release-qualified. The design language is specified in
[docs/ui-library](../../docs/ui-library/design-language.md).

This version ships the **tokens** layer and the **CSS** for the Tier A components:

```ts
import { strataTokens, resolve, validateTokens } from "@underglass/ui/tokens";

const values = resolve(strataTokens, { depth: 0.2, theme: "dark" });
values["elevation.raised"]; // "2.4px"
validateTokens(strataTokens); // [] when every invariant holds
```

```html
<link rel="stylesheet" href="node_modules/@underglass/ui/dist/css/tokens.css" />
<!-- or, with a bundler: import "@underglass/ui/css/tokens.css"; -->

<html data-strata-theme="dark">            <!-- light, dark, contrast, contrast-dark; default: follows the system -->
  <aside data-strata-scope style="--strata-depth: 0.2" data-strata-density="compact">…</aside>
</html>
```

- **Every token is a custom property:** `colour.accent` is `--strata-colour-accent`, and `object.keyHeight` is
  `--strata-object-key-height`.
- **Depth:** depth-blended tokens follow `--strata-depth` (0–1). Set it on the root, or on a `data-strata-scope`
  element for a subtree.
- **Themes:** without `data-strata-theme`, the root follows `prefers-color-scheme`. `prefers-contrast: more`
  selects the high-contrast themes.
- **Derived values:** `--strata-colour-on-accent` (text on role colours), `--strata-light-x`, `-y` and `-z` (the
  light vector), `--strata-shadow-dx` and `-dy` (shadow offset per pixel of height), and
  `--strata-control-height` and `--strata-panel-padding` (from the density).

The stylesheet sits in the `strata.tokens` cascade layer, so unlayered application CSS overrides it. The build
validates the tokens against the design language's invariants (contrast on lit faces in every theme, non-text
contrast, elevation order, the taper rule) and fails on any broken rule.

`@underglass/ui/css` is the whole stylesheet: tokens plus the Tier A components, in the `strata.components` layer.
The markup for each component is its [anatomy page](../../docs/ui-library/components/README.md); the relief comes
from `data-strata-face` on that markup, lit from the configured light. `@underglass/ui/css/tokens.css` and
`@underglass/ui/css/components.css` are the two halves.

```html
<button type="button" class="ug-button ug-button--accent" data-strata-face="raised">Save</button>
```

## Themes and scopes at runtime

```ts
import { createStrataTheme } from "@underglass/ui/tokens";
import { applyStrataTheme, strataScope } from "@underglass/ui/dom";

// An application theme, validated against every rule of the design language.
const theme = createStrataTheme({ depth: 0.4, light: { azimuth: 45 }, colour: { accent: "#0f766e" } });
const applied = applyStrataTheme(theme);         // report: "error" (default), "warn", "silent" or "throw"
applied.update({ depth: 0.7 });                   // runtime change, on top of the theme in effect

// A flatter, compact sidebar. Light tokens are application-only and are refused here.
strataScope(document.querySelector("aside"), { depth: 0.2, density: "compact", size: "small" });

// Themes serialise to W3C Design Tokens JSON.
const json = theme.toJSON();
```

- **Theme layer:** an applied theme's stylesheet goes into the `strata.theme` cascade layer, above the defaults and
  below the components, whichever stylesheet loads first.
- **Scope colours:** colour overrides in a scope need the scope's `theme`, so their contrast can be checked. The
  derived on- and -text colours are set with them.

## Layout

Components have no outer margin. Two classes put the design language's gaps between them, scaled by density
(`--strata-gap-control`: 8, 12 or 16 px; `--strata-gap-group`: 16, 20 or 24 px):

```html
<section class="ug-panel ug-stack" data-strata-face="raised">
  <div class="ug-field">…</div>
  <p class="ug-cluster"><button class="ug-button" data-strata-face="raised">Save</button> …</p>
</section>
```

- `.ug-stack` puts groups (fields, rows, sections) one under another, `gap.group` apart.
- `.ug-cluster` is a wrapping row of controls, `gap.control` apart: a row too narrow for its controls wraps
  instead of squeezing them. Buttons never shrink below their label.

## Rendering model

The Relief and Objects looks are specified independently of any engine in the
[Strata Rendering Model](../../docs/ui-library/rendering-model.md). This package ships its scene format, a reference
implementation and its conformance suite:

```ts
import { sceneSettings, shadePoint, strataTokens, validateScene } from "@underglass/ui/tokens";

const scene = { format: "strata-scene", version: 1, extent: { width: 200, height: 120 },
  ...sceneSettings(strataTokens, { depth: 0.5, theme: "light" }),
  primitives: [{ face: "raised", rect: [0, 0, 200, 120], radius: 14, height: 8, material: "matte" }] };
validateScene(scene);                                                       // [] when valid
const colour = shadePoint(scene, () => [0.91, 0.92, 0.94, 1], 100, 60);    // sRGB, 0–1
```

- **`@underglass/ui/scene.schema.json`:** the scene format as a JSON Schema.
- **`@underglass/ui/conformance/relief-1.json`:** scenes, sample points and expected colours. A renderer conforms
  when its decoded pixels are within 3 (of 255) on every channel.
- **`@underglass/ui/conformance/scene-3.json`:** version 3, the Scene level: stage scenes (`format: "strata-stage"`,
  a lit backdrop and particles, `shadeStage`) and objects reflecting an environment map.
- **`@underglass/ui/conformance/objects-2.json`:** the same for version 2, the Objects level. Version 2 scenes add a
  `camera` and may mix objects (`{ object: "key", rect, height, base, taper, travel, material }`, or a dome such as
  `{ object: "knob", rect, height, base, material, colour, bounds }`) into the back-to-front list.

## GPU presentation

With Underglass, Strata panels can be presented on the GPU: CSS paints flat faces and core's `relief` material paints
the depth, from the same tokens. Panels must be direct children of the Underglass root.

```ts
import { attachStrataGpu } from "@underglass/ui/gpu";

const strata = attachStrataGpu(controller);   // enrolls each .ug-panel among the root's children
// In the mount options: onStatusChange: () => strata.refresh()
strata.detach();                               // back to the CSS presentation
```

- **React and Vue:** `useStrataGpu(controller)` from `@underglass/ui/react` or `@underglass/ui/vue` attaches for the
  component's lifetime. It attaches in a microtask, so it works in a component of `mountCanvasApp`'s first render (the
  showcase's [Strata gallery](../../docs/showcase.md) is one).
- **Astro:** call `attachStrataGpu` from a client `<script>` once Underglass is mounted.
- **What it reads:**
  - token values from each panel's resolved `--strata-*` custom properties, so depth, themes and scopes apply as
    they do in CSS;
  - states from `:hover`, `:active`, `:focus-visible` and `:disabled`;
  - geometry from layout, followed through CSS transitions.
- **When GPU is off** (fallback, forced colours or disabled): panels leave face mode, and the CSS relief is back.
- **The Objects level:** `attachStrataGpu(controller, { level: "objects" })`, or `data-strata-level="objects"` on a
  component, a panel or a scope (`level` on the bindings), presents components as objects (design language section
  6): buttons and selects become keys that travel when pressed, panels and cards slabs, fields gain a bezel,
  checkboxes, radios and switches become wells with their mark, dot or knob standing in them, and sliders a metal
  rail with a puck. The panel then takes core's `objects` material, seen through a camera centred on the stage. Knobs
  and pucks are drawn as domes in their own colour, so their CSS paint is hidden while the GPU draws them. Any
  component can set `data-strata-level="relief"` to stay at the Relief level inside an Objects panel.
- **The adjust policy** (off by default): `attachStrataGpu(controller, { level, adjust: { enabled: true },
  onAdjust })`. While the 95th percentile of frame intervals stays over `frameBudgetMs` (25) for
  `stepDownAfterFrames` (120) frames, levels step down, Scene to Objects to Relief. After `stepUpAfterFrames` (600)
  frames under 80% of the budget they step back up, never above what the page asks for. Every step calls `onAdjust`
  and dispatches `strata-adjust` on the root; `strata.cap()` reads the current cap. GPU stays on throughout. The
  defaults are provisional (open issue VAL-009).

## The Scene level

`attachStrataGpu(controller, { level: "scene" })` (or `data-strata-level="scene"` on the root or a scope around it) adds
decorative 3D around the UI, on the GPU only:

```ts
const strata = attachStrataGpu(controller, { level: "scene", backdrop: { pool: 0.5, vignette: 0.35 }, environment: "/studio.hdr" });
form.addEventListener("submit", () => strataBurst(submitButton));   // or strata.burst(element, { count: 80, seed })
```

- **Backdrop:** the stage is lit by the application's one light: a pool of light and a vignette.
- **Confetti:** `strataBurst` bursts lit particles over the UI with simple physics. They take no input: a click goes
  through to the controls. Nothing is drawn under `prefers-reduced-motion` or below the Scene level.
- **Settling:** panels entering at the Scene level settle with a spring through depth and tilt.
- **Environment light:** `environment` loads an `.hdr` image once; objects reflect it instead of the studio, at any level.
- The Scene level includes the Objects level, and the adjust policy can step it down.

## Panel motion

```ts
import { strataEnter, strataLeave } from "@underglass/ui/dom";

await strataLeave(panel);           // out through depth; inert meanwhile, invisible afterwards
await strataEnter(panel, { tilt: 8 }); // back in, tilted 8° while moving
```

Instant under `prefers-reduced-motion`. In face mode (GPU on) the same calls move the panel on the GPU:
`attachStrataGpu` hands it to core's `transition`, which scales, tilts and fades the layer about its centre as the CSS
motion does, while the panel's relief height travels from the modal level so its shadow follows. Native hits follow
the moving panel, and it stays inert until it has entered.

## Switch forms and feedback

The Switch's hardware forms: `form="slide" | "rocker" | "bat" | "wall"` (or `data-strata-form` on the row) draws the
same native `<input type="checkbox" role="switch">` as a slide switch, a rocker, a bat-handle toggle or a wall switch,
over a transparent box that covers the whole throw. A click or tap anywhere on it, the label and Space throw it, as
native; a drag released past centre throws it too, and one held short of centre springs back (`attachStrataSwitches`
in `@underglass/ui/dom`, which `attachStrata` and the components attach). The throw animates on the form's spring
(instant under reduced motion). Any other `form` value is still the native form owner.

```tsx
<Switch form="rocker" checked={power} onChange={event => setPower(event.target.checked)}>Power</Switch>
```

On the GPU the parts are Relief primitives or Objects-level slabs and domes, every part and shadow inside the box; at the
helper's `instrument` level each form is an object of parts (`gpu/instrument-switch.ts`: the block, paddle or lever and
ball, with the bezel, plate, nut and bushing and the lit flags), posed by the same CSS throw, its shadows kept inside the
input's box. A detented Knob plays `tick` as its pointer passes a detent when feedback is on (off by default).
[Anatomy](../../docs/ui-library/components/switch.md#11-forms).

**Feedback** is opt-in and off by default: `createStrataTheme({ feedback: { sound: true, haptics: true } })`, a
scope's `feedback`, or `attachStrataFeedback({ sound, haptics, muted })`. Sounds (click, tick, thunk, snap) are
synthesised from three tokens each, with no assets, and audio starts only on the visitor's first gesture on a control
whose sound is on; pulses use the Vibration API and stop under reduced motion. A switch form plays `snap` on every
throw; `strataFeedback(element, kind)` is the hook other controls call.

## React

```tsx
import "@underglass/ui/css";
import { Button, Field, StrataProvider, StrataScope, TextField } from "@underglass/ui/react";

<StrataProvider theme={{ colour: { accent: "#0f766e" } }}>
  <section className="ug-panel" data-strata-face="raised" aria-label="Account">
    <Field label="Email" help="We only use it for receipts." error={error} required>
      <TextField type="email" value={email} onChange={event => setEmail(event.target.value)} />
    </Field>
    <Button variant="accent" onClick={save}>Save</Button>
  </section>
  <StrataScope depth={0.2} density="compact">…</StrataScope>
</StrataProvider>
```

Every Tier A component: `Button`, `IconButton`, `ToggleButton`, `ButtonGroup`, `Link`, `Field`, `TextField`,
`TextArea`, `Checkbox`, `RadioGroup` with `Radio`, `Switch`, `Select`, `Slider`, `Card`, `Panel`, `Divider`, `Badge`,
`Spinner` and `ProgressBar`. Each renders exactly
the markup on its [anatomy page](../../docs/ui-library/components/README.md), forwards a ref to its native element,
and passes `className`, `style` and native attributes through. `size`, `material` and `level` become the Strata
attributes. React 18.3 and 19 are optional peers.

## Vue

```ts
import "@underglass/ui/css";
import { Button, Field, StrataProvider, TextField } from "@underglass/ui/vue";

// Render functions or templates; the same components, props and markup as React.
h(Field, { label: "Email", error: error.value }, () => h(TextField, { type: "email", modelValue: email.value, "onUpdate:modelValue": set }));
h(Button, { variant: "accent", onClick: save }, () => "Save");
```

All 19 Tier A components, with `v-model` on TextField, TextArea, Select and Slider (`modelValue`), Checkbox and Switch
(a boolean), RadioGroup (the selected value), and ToggleButton (`v-model:pressed`). Attributes and listeners fall
through to the native element; Checkbox, Switch and Radio send `class` and `style` to the label row and the rest to the
input. Vue 3.5 is an optional peer.

## Astro

```astro
---
import "@underglass/ui/css";
import { Button, Panel, RadioGroup, TextField } from "@underglass/ui/astro";
---
<Panel title="Account">
  <TextField label="Email" type="email" help="We only use it for receipts." required />
  <RadioGroup legend="Plan" value="free" options={[{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }]} />
  <Button variant="accent" type="submit">Save</Button>
</Panel>
```

The same 19 components, rendered to HTML on the server with no JavaScript. Controls take the Field props themselves,
and RadioGroup renders its radios from `options`. ToggleButton state, `aria-disabled` and checkbox `indeterminate`
come from `attachStrata` (`@underglass/ui/dom`), which the components load. For plain HTML or other server templates,
call `attachStrata()` yourself. Astro 7.3 is an optional peer.

## Dialog and Drawer

`Dialog` and `Drawer` are modal top-level panels at `elevation.modal`, following the APG modal dialog pattern. They
are Strata panels, not `<dialog>` elements, so the GPU presentation can enroll them like any panel. Each renders a
`<section role="dialog" aria-modal="true">` and a `.ug-scrim` before it, into a container (the page body by default),
never inside a layer. Closed, React and Vue render nothing and plain HTML and Astro render both with `hidden`.
With `attachStrataGpu`, render them into the Underglass root (`container={controller.container}`): there they fill
the stage and are presented on the GPU while open, over a scrim the GPU fades.

```tsx
import { Button, Dialog, Drawer } from "@underglass/ui/react";

<Dialog open={open} onClose={() => setOpen(false)} title="Discard changes?" description="Your edits will be lost."
  actions={<Button variant="accent" onClick={discard}>Discard</Button>}>…</Dialog>
<Drawer open={filters} onClose={() => setFilters(false)} side="start" title="Filters" closeOnScrim>…</Drawer>
```

```html
<button data-strata-open="help">Help</button>
<!-- Astro: <Dialog id="help" title="Help">…<Fragment slot="actions"><Button data-strata-close="">Close</Button></Fragment></Dialog> -->
```

```ts
import { showStrataDialog } from "@underglass/ui/dom";

const dialog = showStrataDialog(panel, { onClose: reason => dialog.close(), closeOnScrim: true });
await dialog.close();               // reason is "escape", "scrim" or "close"
```

`showStrataDialog` is the one implementation behind every binding: it makes the rest of the page `inert` (each prior
value restored exactly), moves focus to `initialFocus`, the `[autofocus]` descendant or the first tabbable element,
returns it to the opener, closes on Escape (only the topmost of nested dialogs), and runs the panel motion. A click on the
scrim, outside the panel, closes it only with `closeOnScrim` (a prop in React, Vue and Astro;
`data-strata-close-on-scrim` in plain HTML), as a native `<dialog>` does; drawers often turn it on. In plain HTML, `data-strata-open="id"` opens a panel and
`data-strata-close` inside it closes it (`attachStrata`). Anatomy: [Dialog](../../docs/ui-library/components/dialog.md),
[Drawer](../../docs/ui-library/components/drawer.md).

Next: the GPU presentation (`/gpu`), as the
[plan](../../docs/ui-library/plan.md) describes.

## Tabs

`Tabs` follow the APG Tabs pattern with automatic activation: a `tablist` of `<button role="tab">` elements and a
`tabpanel` for each. A rail runs under the tabs, and the selected tab's accent indicator stands in it; on the GPU they
are a groove and a lit mark. Only the selected tab is in the tab order; the arrow keys (Up and Down when vertical),
Home and End move between tabs and select them, skipping disabled ones.

```tsx
import { Tab, TabList, TabPanel, Tabs } from "@underglass/ui/react";

<Tabs id="account" value={tab} onChange={setTab}>
  <TabList label="Account">
    <Tab value="profile">Profile</Tab>
    <Tab value="security">Security</Tab>
  </TabList>
  <TabPanel value="profile">…</TabPanel>
  <TabPanel value="security">…</TabPanel>
</Tabs>
```

- **Selection:** `value` and `onChange` (`v-model` in Vue), or `defaultValue`. Give one of them: with neither, no
  tab is selected. Ids are `{id}-tab-{value}` and `{id}-panel-{value}`.
- **Options:** `orientation="vertical"`; `activation="manual"` makes the arrows move focus only, until Enter or Space.
- **Astro:** `<Tabs label="Account" tabs={[{ value: "profile", label: "Profile" }]} value="profile">` with one slot per
  panel, named by its value; it selects the first enabled tab by default.
- **Plain HTML:** the markup on the [anatomy page](../../docs/ui-library/components/tabs.md), wired by `attachStrata`,
  which dispatches `strata-tab-change` with `{ tab, panel }`.

## Accordion

`Accordion` is a stack of native `<details>` sections, each a raised slab with a `<summary>` header and a chevron
that turns. The browser gives the keyboard (Enter and Space), the expanded state and find-in-page, so plain HTML and
Astro need no script. Sections that share a `name` are exclusive: opening one closes the others.

```tsx
import { Accordion, AccordionItem } from "@underglass/ui/react";

<Accordion exclusive>
  <AccordionItem title="Shipping" defaultOpen>Orders ship within two days.</AccordionItem>
  <AccordionItem title="Returns" open={returns} onOpenChange={setReturns}>Return any item within 30 days.</AccordionItem>
</Accordion>
```

- **Open state:** `defaultOpen`, or `open` with `onOpenChange` (`v-model:open` in Vue), from the native `toggle` event.
- **Exclusive:** `exclusive` generates a shared `name`; or give your own `name`. In Astro, put the same `name` on each
  `AccordionItem`.
- [Anatomy](../../docs/ui-library/components/accordion.md).

## List

`List` is a native `<ul role="list">` on one raised slab, with rows separated by hairlines. A row is static, a link or
a button; an actionable row's link or button fills the row, so the whole row is the target.

```tsx
import { List, ListItem } from "@underglass/ui/react";

<List label="Mailboxes">
  <ListItem href="/inbox" current="page" start={<InboxIcon />} primary="Inbox" secondary="12 unread" end="Now" />
  <ListItem primary="Archive" onClick={archive} />
  <ListItem primary="Storage" secondary="4.2 GB of 15 GB used" />
</List>
```

- A row with `href` is a link (`current` sets `aria-current`); with `onClick` (React), a click listener or `button`
  (Vue, Astro) it is a button (`disabled` disables it); otherwise it is static.
- `start` is decorative (`aria-hidden`); `end` is read. [Anatomy](../../docs/ui-library/components/list.md).

## Table

`Table` is a native `<table>` with a caption on one raised slab. Header cells have `scope="col"`, numeric columns
align to the end, and a sortable column's header holds a button; the sorted column carries `aria-sort`.

```tsx
import { Table } from "@underglass/ui/react";

<Table caption="Invoices" defaultSort={{ key: "number", direction: "ascending" }}
  columns={[{ key: "number", header: "Number", sortable: true }, { key: "amount", header: "Amount", numeric: true, sortable: true }]}
  rows={invoices} />
```

- **Sorting:** controlled with `sort` and `onSortChange` (`v-model:sort` in Vue), or by the component with
  `defaultSort` (numbers by value, text with `localeCompare`). Astro renders `sort` as `aria-sort`, without buttons.
- **Cells:** values by default; `renderCell(row, column)` in React and the `cell` slot in Vue render your own.
- [Anatomy](../../docs/ui-library/components/table.md).

## Breadcrumb

`Breadcrumb` is a `<nav>` landmark named "Breadcrumb" around an ordered list of links; the last one is the current
page (`aria-current="page"`). The separators are drawn by CSS and are not read.

```tsx
<Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Settings", href: "/settings" }, { label: "Profile", href: "/settings/profile" }]} />
```

[Anatomy](../../docs/ui-library/components/breadcrumb.md).

## Avatar

`Avatar` is a raised coin with initials or a picture: `<Avatar name="Ada Lovelace" />` shows "AL" and is read as
"Ada Lovelace"; `src` shows a picture whose `alt` is the name; `decorative` hides it, for an avatar beside the
name in text. It is 1.6 × the indicator size across (`size`). [Anatomy](../../docs/ui-library/components/avatar.md).

## Chip and Tag

`Chip` is a small raised pill in three forms: a tag (`<Chip>Design</Chip>`), a filter chip that latches like a
ToggleButton (`pressed` or `defaultPressed` with `onPressedChange`; `v-model:pressed` in Vue) and a removable chip
(`onRemove`; a `remove` listener in Vue) whose remove button is named "Remove {label}". In plain HTML and Astro,
`attachStrata` toggles filter chips and dispatches `strata-remove` from a chip whose remove button is pressed.
[Anatomy](../../docs/ui-library/components/chip.md).

## Skeleton

`Skeleton` holds the place of loading content: `<Skeleton lines={3} />`, `<Skeleton shape="circle" />` or
`<Skeleton shape="rect" width="100%" height={120} />`. Placeholders are flat, shimmer (still under reduced motion) and
are hidden from assistive technology; put `aria-busy="true"` and a status on the region that is loading.
[Anatomy](../../docs/ui-library/components/skeleton.md).

## MessageBar

`MessageBar` is an inline message on a raised slab with a stripe and an icon in its `intent` (`info`, `success`,
`warning`, `danger`). It is a live region: `status` for information and success, `alert` for warnings and errors, so
render it when the message appears. `actions` holds buttons; `onDismiss` (a `dismiss` listener in Vue,
`dismissible` in Astro, `strata-dismiss` in plain HTML) adds a dismiss button.

```tsx
<MessageBar intent="warning" title="Storage almost full" actions={<Button>Upgrade</Button>} onDismiss={hide}>You have used 95% of your space.</MessageBar>
```

[Anatomy](../../docs/ui-library/components/message-bar.md).

## Pagination

`Pagination` is a `<nav>` named "Pagination" around a row of page keys: links with `href` (a function; a `{page}`
template in Astro), or buttons with `onPageChange` (`v-model:page` in Vue). It shows the first and last pages, the
current page and `siblings` (1) either side, with ellipses for the gaps; the current page's key is held down.

```tsx
<Pagination page={page} count={12} onPageChange={setPage} />
```

[Anatomy](../../docs/ui-library/components/pagination.md).

## Toolbar

`Toolbar` puts controls on one plinth as one tab stop (APG Toolbar): Tab enters and leaves it, and the arrow keys,
Home and End move between its controls. The roving tabindex is applied when focus first enters, so the markup is the
same with and without script; `attachStrata` does it for plain HTML and Astro.

```tsx
<Toolbar label="Formatting"><ToggleButton>Bold</ToggleButton><ToggleButton>Italic</ToggleButton><Divider orientation="vertical" /><Button>Undo</Button></Toolbar>
```

[Anatomy](../../docs/ui-library/components/toolbar.md).

## AppBar

`AppBar` is the application's top bar: a `<header>` (the banner landmark at the top level) on a raised slab, with
`start` and `end` controls and a `title` between them that truncates. [Anatomy](../../docs/ui-library/components/app-bar.md).

```tsx
<AppBar title="Underglass" start={<IconButton label="Menu" icon={<MenuIcon />} />} end={<Button>Sign in</Button>} />
```

## Tooltip

`Tooltip` describes one trigger (APG Tooltip): shown 300 ms after the pointer rests on it or at once on keyboard
focus, kept while the pointer is on the tooltip, hidden on leave, blur or Escape. It is a `role="tooltip"` popover in
the top layer, portalled to `<body>` (`container` in React, `to` in Vue), never inside an Underglass layer.

```tsx
<Tooltip content="Copies the address to the clipboard"><IconButton label="Copy link" icon={<LinkIcon />} /></Tooltip>
```

In plain HTML and Astro, give the trigger `aria-describedby` and put the `.ug-tooltip` at the end of the page;
`attachStrata` runs it. [Anatomy](../../docs/ui-library/components/tooltip.md).

## Toast

`showStrataToast` (`toast` in React and Vue) shows a brief message in one region at the end of `<body>`, in the top
layer and outside every Underglass layer, announced politely through a persistent `role="status"` list:

```ts
const handle = toast({ message: "Message sent.", intent: "success", action: { label: "Undo", onAction: undo } });
```

A toast is a MessageBar at `elevation.overlay`. It goes after `duration` (5000 ms; `Infinity` to keep it); the time
stops while the pointer or focus is in the region. At most three are shown. [Anatomy](../../docs/ui-library/components/toast.md).

## Combobox

A TextField with suggestions: a native `<input list>` and its `<datalist>`, so the browser filters and shows the list
and any other text may still be typed. Use a Select when only the listed values are allowed.

```tsx
<Field label="Fruit"><Combobox options={["Apple", "Apricot", { value: "Banana", label: "Yellow" }]} value={fruit} onChange={event => setFruit(event.target.value)} /></Field>
```

Vue uses `v-model`; Astro takes `options` and the Field props. The list is the browser's own, never drawn by the GPU.
[Anatomy](../../docs/ui-library/components/combobox.md).

## DatePicker

A TextField that takes a date: a native `<input type="date">`, so the browser provides the segmented field and its own
calendar. The value is `YYYY-MM-DD`, whatever the display language; `min` and `max` give native validity.

```tsx
<Field label="Due date"><DatePicker min="2026-01-01" max="2026-12-31" value={due} onChange={event => setDue(event.target.value)} /></Field>
```

Vue uses `v-model`; Astro takes the Field props. The calendar is the browser's own, never drawn by the GPU.
[Anatomy](../../docs/ui-library/components/date-picker.md).

## Carousel

A few items shown one at a time, by the WAI-ARIA Carousel pattern without rotation: Previous and Next (wrapping), a
picker key per slide (the current one held down, `aria-current`), and a polite live region for the slides:

```tsx
<Carousel label="Featured" slides={[<Story id={1} />, <Story id={2} />]} index={index} onIndexChange={setIndex} />
```

Vue takes one slide per element of its default slot (`v-model:index`); Astro takes `count` and the named slots
`slide-1`, `slide-2`… and `attachStrata` reports `strata-slide`. [Anatomy](../../docs/ui-library/components/carousel.md).

## TreeView

A hierarchy to browse and pick from, by the WAI-ARIA Tree View pattern: one tab stop, the arrow keys, Home and End to
move, open and close, and Enter, Space or a click to select. Items are data:

```tsx
<TreeView label="Files" items={[{ value: "src", label: "src", children: [{ value: "src/index.ts", label: "index.ts" }] }]}
  expanded={open} onExpandedChange={setOpen} selected={file} onSelect={setFile} />
```

Vue uses `v-model:expanded` and `v-model:selected`. In plain HTML and Astro, `attachStrata` runs it from the markup and
reports `strata-expand` and `strata-select` from the item. [Anatomy](../../docs/ui-library/components/tree-view.md).

## Popover

Interactive content one button opens beside itself, on the native Popover API: the browser toggles it, closes it on
Escape or a click outside, returns focus and exposes the button's expanded state; CSS anchor positioning places it
below the button, flipped above when there is no room. It is portalled to `<body>`, outside every Underglass layer:

```tsx
<Popover trigger={<Button>Filters</Button>} title="Filters" onOpenChange={setOpen}>
  <Checkbox>Open only</Checkbox>
</Popover>
```

Vue takes the trigger in its `trigger` slot and emits `toggle`; in Astro any button with `popovertarget` set to the
popover's `id` opens it. [Anatomy](../../docs/ui-library/components/popover.md).

## Menu

A short list of actions one button opens, by the WAI-ARIA Menu Button pattern on the native Popover API: opening
focuses the first item (the last with Up), the arrow keys, Home, End and a typed letter move, choosing an item closes the
menu and returns focus, and a disabled item does nothing:

```tsx
<Menu trigger={<Button>Actions</Button>} label="Actions" items={[{ label: "Rename", onSelect: rename }, "separator", { label: "Delete", disabled: true }]} />
```

In Astro the trigger is any button with `popovertarget` and `aria-haspopup="menu"`; `attachStrata` reports
`strata-select` from the chosen item. [Anatomy](../../docs/ui-library/components/menu.md).

## NavigationRail

An application's top-level destinations in a column at the start edge: a `<nav>` landmark with a list of native links,
the current one `aria-current="page"` and its key held down. A click reaches `onNavigate(href, event)` (Vue:
`navigate`), so a router can prevent the default and route:

```tsx
<NavigationRail label="Main" items={[{ label: "Inbox", href: "/inbox", icon: <InboxIcon /> }]} current={path} onNavigate={(href, event) => { event.preventDefault(); navigate(href); }} />
```

In Astro an item's `icon` is SVG markup. [Anatomy](../../docs/ui-library/components/navigation-rail.md).

## Stepper

Where the user is in a task of ordered steps, as an `<ol>` whose current step carries `aria-current="step"`; complete
steps say so in a visually hidden " (completed)" (`completedLabel`). It shows progress only: the task's own buttons
move `current`.

```tsx
<Stepper label="Checkout progress" steps={["Cart", "Shipping", "Payment"]} current={1} />
```

`orientation="vertical"` stacks the steps. [Anatomy](../../docs/ui-library/components/stepper.md).

## Rating

A score out of `max` (5) as stars. `Rating` is native radios in a `<fieldset>`, one per score, named "1 star", "2 stars"
(`itemLabel` changes the wording), so arrow keys and forms work natively; `RatingDisplay` shows a read-only score,
fractions included, as one image named "4.5 out of 5 stars":

```tsx
<Rating label="Your rating" value={score} onChange={setScore} />
<RatingDisplay value={4.5} />
```

Vue uses `v-model`; Astro takes `value` and `name`. The stars are captured content on the GPU, not relief.
[Anatomy](../../docs/ui-library/components/rating.md).

## Indicator forms: Rating, Badge, ProgressBar and Spinner

The second of the Instrument level's everyday forms: LED lenses on the native indicators. `form="lamps"` on a **Rating** puts a lamp lens in each star's place, lit up to the score (a
hovered star and the ones before it half lit, where hover is real); `form="led"` on a **Badge** puts the StatusLight's lens before the text on a dark pill, in the variant's colour (a
neutral badge's is dark glass); `form="meter"` on a **ProgressBar** draws a groove of LED segments lit from the value (`segments`, 20 by default), and, while indeterminate, a head
running along it; `form="ring"` on a **Spinner** draws eight LEDs round a ring with a head chasing clockwise. The native control stays the control (the radios, the `<span>`, the
`<progress>` with its role and value, the status with its label), the accessibility snapshot is the same with and without the form, and `flush`, or no `form`, is the markup and the look they
had before, pixel for pixel; on a Rating any other `form` string is still the native form owner. `colour` is the lenses' role, as the Lamp's.

```tsx
<Rating form="lamps" label="Your rating" value={score} onChange={setScore} />
<Badge form="led" variant="success">Active</Badge>
<ProgressBar form="meter" aria-label="Upload" value={40} segments={20} />
<Spinner form="ring" label="Loading" />
```

Vue takes the same props (`v-model` on the Rating); Astro takes `value`, `name` and `segments`. A bar's value reaches the drawing through `attachStrataProgress` in `@underglass/ui/dom`
(which `attachStrata` and the components attach). On the GPU every lens is an emitter at every level (a Rating's 1,045 at 16 px, a Badge's or a ring's LED 520 at 10 px scaled by the square
of its diameter, a segment 260), lit by `--strata-lit`, so a score, a value and a chase are uniform writes: 300 frames of a chasing ring cause 0 captures, 0 uploads and 0
hit-geometry updates. The chase runs at `chase.spinner` (900 ms) and `chase.bar` (1,600 ms), never under 334 ms, and is a steady comet or pattern under reduced motion. Relief draws each lens as a ring
face, Objects as a dome, the Instrument level as a glass LED lens (`gpu/indicator-forms.ts`); every part and shadow is inside the native control's box. Anatomy:
[Rating](../../docs/ui-library/components/rating.md#11-indicator-form-lamps), [Badge](../../docs/ui-library/components/badge.md#11-indicator-form-led),
[ProgressBar](../../docs/ui-library/components/progress-bar.md#11-indicator-form-meter), [Spinner](../../docs/ui-library/components/spinner.md#11-indicator-form-ring).

## SegmentedControl

One choice from two to five short options, as keys on a plinth: native radios in a `<fieldset>`, so arrow keys and
forms work natively. The selected key is held down.

```tsx
<SegmentedControl label="View" options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} value={view} onChange={setView} />
```

Vue uses `v-model`; Astro takes `value` and `name`. `hideLabel` hides the legend visually. [Anatomy](../../docs/ui-library/components/segmented-control.md).

## Knob

A number picked by turning, as on audio and control hardware: a native `<input type="range">` over a printed dial, the
first component of the Instrument level. Keys are native; a vertical drag (Shift for fine), a click on the printed
scale, a tap on the cap's upper or lower half, the wheel and a double-click reset come from `attachStrataKnobs` in
`@underglass/ui/dom`, which `attachStrata` and the components attach. `detents` makes it stepped; `unit` or `format`
gives `aria-valuetext`.

```tsx
<Knob label="Gain" min={-12} max={12} detents={5} value={gain} onValueChange={setGain} unit=" dB" />
```

Vue uses `v-model`; Astro takes `value` and `unit`. The ref is the `.ug-knob` root (`inputRef`, or Vue's exposed
`input`, is the input). On the GPU the skirt and the cap are raised faces at Relief and slabs at Objects, and the turning
pointer is captured content. At the Instrument level (`level: "instrument"`) the panel takes core's `instrument`
material: the knob is a skirt, a brushed cap, a polished chamfer and an engraved pointer that turns on a spring, and
buttons become keys with captured caps.
[Anatomy](../../docs/ui-library/components/knob.md).

## Fader

A number picked by sliding, as on a mixing desk: a native `<input type="range">`, vertical by default
(`writing-mode: vertical-lr`, `aria-orientation="vertical"`) or `orientation="horizontal"`, over a slot in the
faceplate with a printed scale beside it. The transparent native thumb is the drawn carriage, so dragging the carriage,
clicking the track or the scale, and the keys are the browser's own; the carriage following the value, a tap snapping to
a printed mark, the wheel and a double-click reset come from `attachStrataFaders` in `@underglass/ui/dom`, which
`attachStrata` and the components attach. `detents` makes it stepped; `unit` or `format` gives `aria-valuetext`;
`size` (or `travel`) sets the travel.

```tsx
<Fader label="Level" min={-60} max={6} value={level} onValueChange={setLevel} unit=" dB" marks={[6, 0, -20, -40, -60]} />
```

Vue uses `v-model`; Astro takes `value` and `unit`. The ref is the `.ug-fader` root (`inputRef`, or Vue's exposed
`input`, is the input). On the GPU the slot is a groove and the carriage a raised face at Relief and a slab at Objects.
At the Instrument level (`level: "instrument"`) the carriage is a chamfered brushed carriage with a grip, sliding on
`spring.fader` (`gpu/instrument-fader.ts`), its shadow kept inside the input's box at every depth. A detented fader
plays `tick` as it passes a detent when feedback is on (off by default). [Anatomy](../../docs/ui-library/components/fader.md).

## JogWheel

An endless encoder, the third wave of the Instrument level: a native `<input type="range">` over a large flat wheel with a finger
dimple, whose value steps by its `step` and, with `wrap` (the default), goes round from `max` to `min` and back. The dimple's position
is an **accumulated angle** (`--strata-jog-angle`, degrees, a step being `360 / turn`), not the value, so it never turns back when the
value wraps. Keys are native (at an end, the key that would pass it goes round); a circular drag (the pointer's angle about the centre;
`drag="vertical"` for the Knob's vertical drag), a tap on the upper or lower half of the wheel, the mouse wheel, a double-click reset and
**inertia** (a flick coasts on `spring.jog`, one native step per `input` event at no more than `jog.maxRate` a second, and stops under
reduced motion) come from `attachStrataJogWheels` in `@underglass/ui/dom`, which `attachStrata` and the components attach.
`detents` makes the dimple settle on each step and play `tick` where feedback is on.

```tsx
<JogWheel label="Shuttle" min={0} max={99} value={frame} onValueChange={setFrame} unit=" fr" />
<JogWheel label="Scrub" min={0} max={11} turn={12} detents defaultValue={3} />
```

Vue uses `v-model`; Astro takes `value` and `unit`. The ref is the `.ug-jog-wheel` root (`inputRef`, or Vue's exposed `input`, is the input);
`flingStrataJogWheel(input, velocity)` sets a wheel coasting from a script and `syncStrataJogWheel(input)` brings its angle up to date
after a script wrote its value. On the GPU the recess is a well and the wheel a raised disc (Relief) or a round slab (Objects), with the
dimple a well on it placed from the angle, so a turning frame recaptures nothing (core captures each native `input` event); at the Instrument level (`level: "instrument"`) it is a polished
collar, a brushed cap with a polished chamfer and a graphite dimple (`gpu/instrument-jog.ts`) that turns on the accumulated angle.
[Anatomy](../../docs/ui-library/components/jog-wheel.md).

## PatchPoint and PatchBay

A connection shown as a jack, the third wave of the Instrument level: a **PatchPoint** is a native `<input type="checkbox">` (connected
when checked) or, with `button`, a `<button aria-pressed>`, over a jack in a washer; connected, a plug stands out of the hole with a short
cable, and `led` adds a StatusLight lens that lights with it. A **PatchBay** is a `<fieldset>` of PatchPoints on one plinth, named by its
`legend`. Keyboard, labels and forms are native; a button's toggle and the opt-in feedback (`click` connecting, `thunk` disconnecting) come
from `attachStrataPatchPoints` in `@underglass/ui/dom`, which `attachStrata` and the components attach.

```tsx
<PatchBay legend="Outputs" columns={4}>
  <PatchPoint name="out1" led checked={out1} onChange={event => setOut1(event.target.checked)}>Out 1</PatchPoint>
  <PatchPoint name="out2" led>Out 2</PatchPoint>
</PatchBay>
<PatchPoint button connected={ret} onClick={() => setRet(!ret)}>Ret 1</PatchPoint>
```

Vue uses `v-model` on a checkbox jack; Astro takes `checked` and `connected`. At Relief the washer is a raised disc, the hole a well and the
plug a knob face; at Objects a round slab, a pit and a dome; at the Instrument level (`level: "instrument"`) a brushed washer, a polished
barrel, a dark floor, a polished plug and a rubber cable (`gpu/instrument-patch.ts`) whose plug rises out of the hole on `spring.patch`, sunk out of sight
while unplugged, so no state changes the parts. The cable is contained: the box (the washer + 20) does not grow when a jack is connected.
Anatomy: [PatchPoint and PatchBay](../../docs/ui-library/components/patch-point.md).
## RotarySelector and the push-button forms

The third part of the Instrument level's second wave. A **RotarySelector** is a native `<select>` over a printed dial: a knob with
one hard detent per option, the options' labels printed round it (a numbered legend when the dial is narrow or the text large). The
select takes every press and stays the control; `attachStrataRotarySelectors` in `@underglass/ui/dom` (which `attachStrata` and the
components attach) gives it the Knob's round behaviour: a vertical drag, a click on the ring or a printed label, a tap on the cap's
upper or lower half, and the wheel, snapping to the nearest enabled option, with the select's own keys, type-ahead and popup. The
**push-button forms** draw the existing Button and ToggleButton as machined caps on a bezel with a lit ring: `form="momentary"`
lights the ring and lowers the cap while the button is held (`data-strata-down`), `form="latching"` keeps the cap down at 0.45 of its
travel while `aria-pressed`, with an LED on the bezel; any other `form` is still the native form owner (`attachStrataPushButtons`).
`colour` is the ring's role, as the Lamp's.

```tsx
<RotarySelector label="Filter" options={[{ value: "lp", label: "LP" }, { value: "hp", label: "HP" }, { value: "bp", label: "BP" }]} value={filter} onValueChange={setFilter} />
<Button form="momentary" colour="danger" onClick={record}>Record</Button>
<ToggleButton form="latching" colour="warning" pressed={muted} onPressedChange={setMuted}>Mute</ToggleButton>
```

Vue uses `v-model` on the selector and `v-model:pressed` on the toggle; Astro takes `value` and `pressed`. On the GPU the selector is the
Knob's skirt and cap at Relief and Objects, and the Knob's parts at the Instrument level (`knobObject`), the pointer turned to the
chosen option on `spring.detent` with no capture and no hit-geometry update. A push button's ring is an emitter at every level (and a
latching button's LED another; `emitter.pushButton.*`, `emitter.led.*`): a panel with push buttons takes a version 4 scene with its
`emitters`, the `protected` rects of its text and a `feather`, so the face is lit within the contrast guard and a press is a uniform
write. Relief draws the bezel and the cap as raised faces, Objects as a slab and a key (`gpu/push-forms.ts`); at the Instrument level
each button is a polished bezel, a glass ring, and a body with a captured cap travelling 4 px on the CSS throw (`gpu/instrument-push.ts`).
Every part and shadow is inside the button's box. The selector plays the opt-in `tick` as its pointer moves to another option, a push
button the opt-in `click` as it goes down. Anatomy: [RotarySelector](../../docs/ui-library/components/rotary-selector.md),
[Button](../../docs/ui-library/components/button.md#11-push-button-form-momentary),
[ToggleButton](../../docs/ui-library/components/toggle-button.md#11-push-button-form-latching).

## Structural forms: Slider, Card, Panel, Dialog and Drawer

The third of the Instrument level's everyday forms. `form="knob"` or `form="fader"` on a **Slider** draws its own native `<input type="range">` as the Knob's or the
Fader's object (the same markup, behaviour and GPU parts, without their legend; the fader is horizontal); `form="plate"` or `form="tray"` on a **Card** or **Panel** makes
it a machined plate or a recessed tray (a Card's body, or a wrapper round a Panel's content, is the tray); `form="plate"` on a **Dialog** is a plate that rises out of the
chassis as it opens, and `form="tray"` on a **Drawer** a tray that slides out of its edge. `flush`, or no `form`, is the control of before, in markup, look and motion; on a
Slider any other `form` string is still the native form owner, and `wheel` is reserved for the thumbwheel (not built yet).

```tsx
<Field label="Drive"><Slider form="knob" min={0} max={100} value={drive} onChange={event => setDrive(Number(event.target.value))} unit="%" /></Field>
<Card form="plate" title="Output">…</Card>
<Card form="tray" title="Notes">…</Card>
<Dialog form="plate" open={open} onClose={close} title="Discard changes?">…</Dialog>
<Drawer form="tray" side="end" open={filters} onClose={closeFilters} title="Filters">…</Drawer>
```

Vue takes the same props; Astro takes `value` and `unit` on the Slider. The native controls stay the controls (the same accessibility snapshot, focus order and form data with and
without a form). On the GPU the plate and the tray take the `plate` material role and a well at Relief and Objects; at the Instrument level a plate is a rim and a tray a wall:
an inline mesh swept along the element's rounded outline, inside its box by the box rule's margin, over a face that stays captured, so text and hits are untouched (every
vertex is at least 0.5 px inside its box over the whole rise: the closest is 1.9 px for a plate and 1.6 for a tray, at DPR 1 and 2; against the same page without the form no pixel
outside the element's box changes). A Dialog's and a Drawer's motion drive the rise as one scene number (a uniform update), and the Drawer's layer slides through core's panel
transition (`x`, `y`). The first build of an Instrument layer shows its parts about 0.1 s after it is enrolled. A value change on a Slider form is the Knob's and Fader's: 4 captures
for 8 native changes, none in the frames the springs turn, 0 hit-geometry updates. A moving layer's boxes carry float noise, so the plate's mesh, the knob's diameters and the
keys' bodies are quantised (a quarter or half px) and the layer is not rebuilt as it moves. Anatomy: [Slider](../../docs/ui-library/components/slider.md#11-hardware-forms-knob-and-fader),
[Card](../../docs/ui-library/components/card.md#11-plate-and-tray-forms), [Panel](../../docs/ui-library/components/panel.md#11-plate-and-tray-forms),
[Dialog](../../docs/ui-library/components/dialog.md#11-plate-form), [Drawer](../../docs/ui-library/components/drawer.md#11-tray-form).

## Lamp and StatusLight

Hardware lights, the second wave of the Instrument level. A **Lamp** is a lens on a bezel over a native
`<input type="checkbox" role="switch">` in its label row, or, with `momentary`, a `<button aria-pressed>` with its lens and
label inside it that is lit while it is held (`attachStrataLamps` in `@underglass/ui/dom`, which `attachStrata` and the
components attach). A **StatusLight** is a small lens that shows a state and takes no input, named by its `label`: a
`<span role="img">` by default, a `<span>` with the label shown (`showLabel`), or a live `<output>` that names changes
(`live`). `colour` is a role (`glowOn` amber by default, or `accent`, `success`, `warning`, `danger`, `info`); `blink` is a
tempo token (`slow`, `normal`, `fast`: never over three flashes a second, off under reduced motion); a light's meaning is its
label, never its colour or its blink.

```tsx
<Lamp colour="success" checked={link} onChange={event => setLink(event.target.checked)}>Link</Lamp>
<Lamp momentary colour="danger" onClick={talk}>Talk</Lamp>
<StatusLight label="Recording" colour="danger" blink="normal" showLabel />
<StatusLight label={status} live />
```

Vue uses `v-model` on a toggle lamp; Astro takes `checked`. `setStrataStatusLight(element, { label, lit, colour, blink })`
changes a light in plain DOM and keeps it valid. A lens is lit by `--strata-lit`, a registered number: 1 for a lit lamp (0
when disabled) and a lit StatusLight, animated by a blink. Every visible lens is an **emitter** at every GPU level: a panel
with a lamp or an LED takes a version 4 scene with its `emitters`, the `protected` rects of its text and a `feather`, so
core's face pool lights the page around it within the contrast guard (`emitter.*` tokens), and a toggle, a press or a blink is a
uniform write with no capture. Relief draws the lens as a disc and Objects as a dome in its own colour; at the Instrument level
(`level: "instrument"`) it is a polished bezel and a glass lens (`gpu/instrument-lamp.ts`) over a socket printed on the
face, with bloom. Past 64 emitters in a layer core draws the 64 with the most reach and reports the rest. A lamp plays the
opt-in `click` feedback. Anatomy: [Lamp](../../docs/ui-library/components/lamp.md),
[StatusLight](../../docs/ui-library/components/status-light.md).

## Pad and Keypad

Buttons you play with a finger, the third wave of the Instrument level. A **Pad** is a native `<button>` drawn as a square soft cap
over a rim of light, in a **PadGrid** (a `<div role="group">`, `label` its name, `columns`): momentary (lit and down while it is
held), or with `latching` a toggle (`aria-pressed`, lit and resting at 0.45 of its travel while on; `pressed` / `onPressedChange`,
`defaultPressed`, or `v-model:pressed`). `colour` is the rim's role, as the Lamp's. A **Keypad** is a `<fieldset>` (`label` its
legend) of **KeypadKey** buttons: machined square caps with a printed legend, an optional smaller second one (`shift`; `shifted` prints
it large) and `columns`, on one polished plinth. The pads of a grid and the keys of a keypad are **one tab stop** (a roving tabindex)
and the arrow keys move in both axes by the laid-out columns, Home and End along the row, Control+Home and Control+End to the ends,
with no wrap and disabled controls skipped; they stay `button`s. `attachStrataPads`, `attachStrataKeypads` and
`attachStrataPadLatches` in `@underglass/ui/dom` (which `attachStrata` and the components attach; the bindings keep a pad's state
themselves) hold a control down (`data-strata-down`), play the opt-in `click` feedback and run the grid keys.

```tsx
<PadGrid label="Drums" columns={4}>
  <Pad colour="danger" onClick={() => play("kick")} onVelocity={velocity => setGain(velocity)}>Kick</Pad>
  <Pad latching colour="accent" pressed={loop} onPressedChange={setLoop}>Loop</Pad>
</PadGrid>
<Keypad label="Dial" columns={3}>
  <KeypadKey value="1">1</KeypadKey>
  <KeypadKey value="2" shift="ABC">2</KeypadKey>
</Keypad>
```

A pad's optional **velocity**, 0 to 1, is `data-strata-velocity` and a bubbling `strata-pad-velocity` event (`{ velocity, source }`) at each
press, before the click: the pointer's pressure where the hardware reports it, else where on the cap the press lands (the middle 1,
the edge 0.25), the keys 1; nothing depends on it. A pad is lit by `--strata-lit` and a cap moved by `--strata-push-t` (the PushButton's
registered numbers, on `spring.button`). A lit pad is an **emitter** at every GPU level (`emitter.pad.*`; a panel with pads takes a
version 4 scene with its `emitters`, the whole cap of each pad among the `protected` rects, and a `feather`), a keypad is not. Relief
draws the caps as raised faces and a keypad's plinth as one; Objects as keys and a slab; at the Instrument level (`level: "instrument"`)
a pad is a glass rim with its emitter, a lacquer body and a captured cap (`gpu/instrument-pad.ts`), a keypad a polished plinth object
and, per key, a body with a captured cap, each travelling on the CSS throw with no capture and no hit-geometry update. Every part and
shadow is inside its control's box. The soft cap is a satin lacquer: core's recipe has no subsurface layer yet. Anatomy:
[Pad](../../docs/ui-library/components/pad.md), [Keypad](../../docs/ui-library/components/keypad.md).

## Meter and Gauge

Read-only measurements, the second wave of the Instrument level: a **Meter** is a native `<meter>` (role `meter`, with `min`,
`max`, `low`, `high` and `optimum`) under a bar of LED segments lit from its value, or, with `form="needle"`, a needle on a
printed arc; a **Gauge** is the same native element under a round dial with a needle, a printed scale and a red zone from `high`
(a bounded measurement, so `<meter>` and not `<progress>`). `unit` or `format` gives `aria-valuetext`; `peak` makes a bar hold its
highest segment and let it fall (`meter.peakHold`, `meter.peakDecay`). A segment takes its zone's colour by the native rule (the
region of `optimum` is good, the next suboptimal, the far one worst), and a needle meter or gauge prints a band in `danger`
below `low` and above `high`.

```tsx
<Meter label="Level" value={level} low={70} high={90} optimum={0} unit=" %" peak />
<Meter label="VU" form="needle" value={vu} min={-20} max={3} high={0} unit=" dB" marks={[-20, -10, 0, 3]} />
<Gauge label="Temperature" value={celsius} max={120} low={20} high={100} unit=" °C" />
```

Vue and Astro take the same props (Astro takes `unit` alone); the ref is the `.ug-meter` root (`meterRef`, or Vue's exposed `meter`,
is the native meter). `attachStrataMeters` (`attachStrata` and the components attach it) keeps the drawing's `--strata-meter-value`,
the segments' zones, the unit's `aria-valuetext` and a held peak in step with the native meter, which is observed, not polled.
A **live value** (a level at frame rate) goes through `driveStrataMeter(meter, value)`: where the GPU draws the meter (a bar's
segments at every level, a needle at the Instrument level) it writes nothing to the DOM, so no capture, upload or hit-geometry
update follows (300 frames: 0 of each), and the native `value` follows at a low rate for assistive technology
(`interval`, 1,000 ms by default; `releaseStrataMeter` writes it now). On the GPU each lit segment is the Lamp's LED lens with an
emitter in its zone's colour (`emitter.segment.*`) at every level; a needle meter's bezel, window and hub are Relief and Objects
primitives with the needle as captured content on `spring.meter` (a gauge's on `spring.gauge`, `linear()` curves in the CSS); at the
Instrument level (`level: "instrument"`) the needle is a part on its spring, a gauge has a polished bezel, and a glass window keeps
the printed scale under it exact (`gpu/instrument-meter.ts`). Anatomy: [Meter](../../docs/ui-library/components/meter.md),
[Gauge](../../docs/ui-library/components/gauge.md).

## Display

The last part of the Instrument level's second wave: a **glass window in a bezel**, backlit, with the text printed under the glass. The
editable one is the TextField's `form="display"`, a native `<input>` that covers the whole display (typing, selection, the caret, IME and
autofill are the browser's); the read-only one is `Display`, a native `<output>` (a polite live region, `live="off"` for a fast value;
never submitted, so a value that must submit is a read-only TextField). `backlight` is a colour role (`glowOn` amber by default,
`accent`, `success`, `warning`, `danger`, `info` or `off`) and `lit={false}` switches the light off; it is off when the display is disabled
or under more contrast.

```tsx
<TextField form="display" label="Name" value={name} onChange={event => setName(event.target.value)} />
<TextField form="display" readOnly aria-label="Serial" defaultValue="UG-2026-0042" backlight="info" />
<Display label="Frame rate" backlight="success" live="off">{fps} fps</Display>
```

Vue uses `v-model` on the TextField and a slot for `Display`'s value; Astro takes `form`, `backlight` and `lit` on `TextField` and a slot on `Display`.
**The GPU never draws text:** the text under the glass is captured content, so a changed text is a capture (once per change; a script's
write, a keystroke), and the backlight is an emitter, so toggling it costs only its attribute's write. For a value that changes faster than it
can be read, `driveStrataDisplay(element, text, { interval })` from `@underglass/ui/dom` writes the latest text at most once an interval
(100 ms by default) and skips a text already shown (`releaseStrataDisplay` writes it now); a number that must move every frame is a
[Meter](../../docs/ui-library/components/meter.md) or a Gauge. On the GPU the bezel is a groove (Relief) or a slab (Objects) and the window a flat face;
at the Instrument level (`level: "instrument"`) the bezel is a polished part and the window a glass pane whose flat region is the capture itself, so the text under it
is the DOM's own pixels (`gpu/instrument-display.ts`), and the backlight is a few emitters along the window (`emitter.display.*`, `gpu/index.ts`), held within
the contrast guard over the text, which is a protected rect (the native element's content box, an output's text runs too). Anatomy:
[Display](../../docs/ui-library/components/display.md), [TextField, section 11](../../docs/ui-library/components/text-field.md#11-the-display-form).
