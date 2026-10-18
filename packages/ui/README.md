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
