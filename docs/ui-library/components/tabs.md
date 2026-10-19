# Tabs

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows one of several panels of related content in the same place, chosen from a row of tabs. Renders a
`role="tablist"` of native `<button role="tab">` elements and one `role="tabpanel"` per tab, following the
WAI-ARIA [Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) with automatic activation: moving focus to
a tab selects it. HTML has no tabs element, so the roles are explicit, and the keyboard and selection come from
`@underglass/ui/dom` (plain HTML and Astro) or from the binding (React and Vue). Navigation between pages is a
set of [Links](link.md), not tabs.

## 2. Object

A **rail** (a groove) runs under the row of tabs. The selected tab's **indicator**, a short accent bar, stands
in the rail under that tab. The tabs themselves are flat: text on the panel, like a [Link](link.md).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Rail | A pill 4 px high along the tablist's bottom edge (its end edge when vertical), sunk by `elevation.well` | −`elevation.well` | No |
| Indicator | A pill 4 px high under the selected tab, inset by `space.2` at both ends | A `mark`: raised in the rail | Shows under the newly selected tab |
| Tab | The label on the panel, no face | 0 | No |

Each tab is at least `target.min` (24) high and the density's control height, so the whole tab is the target
(WCAG 2.5.8). The indicator lies inside its tab's box: a click on it reaches the tab.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Rail | `track` | — | `rail` (`metal`) |
| Indicator | `accent` | — | `indicator` (`emissive`) |
| Tab, selected | None (sits on the panel) | `text` | None |
| Tab, not selected | None | `muted`; `text` on hover | None |
| Panel | None (sits on the panel) | `text` | None |

The indicator meets 3:1 against the rail and the panel. Selection is shown by the indicator's shape and by the
label's colour, never by colour alone. `data-strata-material` on the tablist overrides the rail and indicator
materials.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Rail at `−elevation.well`; the indicator raised in it under the selected tab | The indicator is a mark standing on the panel | Inset rail, `accent` indicator |
| Hover | Label in `text` | Same | Label in `text` |
| Pressed (`:active`) | Label in `text` | Same | Same |
| Focus-visible | `outline: focus.width solid accent` around the tab | Same | Same |
| Selected (`aria-selected="true"`) | The indicator under this tab; the label in `text` | Same | Same |
| Disabled | Label at 38%; skipped by the arrow keys | Same | `opacity: 0.38` on the label |

Busy and invalid do not apply. Under `prefers-reduced-motion` nothing changes: the indicator has no transition.

## 5. Relief primitives

Two kinds: the rail is a `groove` (`<span class="ug-tabs__rail">`, the tablist's first child, so it is drawn
first and the indicator stands on it), and each tab's indicator is a `mark` (`<span class="ug-tab__indicator">`),
shown only while its tab is selected. The tabs and panels have no face.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.accent`, `colour.text`, `colour.muted`, `colour.edge` | — |
| `radius.pill`, `radius.small` | — (theme or scope) |
| `elevation.well`, `object.keyHeight`, `state.*` | — |
| `material.roles.rail`, `material.roles.indicator` | `material` |
| `target.min`, `control.height`, `control.font`, `space.*`, `density` | `size` |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<div class="ug-tabs">
  <div class="ug-tabs__list" role="tablist" aria-label="Account">
    <span class="ug-tabs__rail" data-strata-face="groove" aria-hidden="true"></span>
    <button class="ug-tab" type="button" role="tab" id="account-tab-profile" aria-selected="true" aria-controls="account-panel-profile">
      <span class="ug-tab__label">Profile</span>
      <span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>
    </button>
    <button class="ug-tab" type="button" role="tab" id="account-tab-security" aria-selected="false" aria-controls="account-panel-security" tabindex="-1">
      <span class="ug-tab__label">Security</span>
      <span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>
    </button>
    <button class="ug-tab" type="button" role="tab" id="account-tab-billing" aria-selected="false" aria-controls="account-panel-billing" tabindex="-1" disabled>
      <span class="ug-tab__label">Billing</span>
      <span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>
    </button>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-profile" aria-labelledby="account-tab-profile" tabindex="0">
    <p>Your name and photo.</p>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-security" aria-labelledby="account-tab-security" tabindex="0" hidden>
    <p>Your password and two-step sign-in.</p>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-billing" aria-labelledby="account-tab-billing" tabindex="0" hidden>
    <p>Your plan and invoices.</p>
  </div>
</div>
```

- The outer `<div>` is the boundary element: refs, `class` and `style` reach it. A vertical tablist is the class
  `ug-tabs--vertical` on it and `aria-orientation="vertical"` on the tablist; the rail and indicators move to the
  end edge.
- **Ids:** each tab is `{id}-tab-{value}` and each panel `{id}-panel-{value}`, from the component's `id` (generated
  when absent) and each tab's `value`. Values must be valid in an id.
- **Roving focus:** only the selected tab is in the tab order; the others have `tabindex="-1"`. Each panel has
  `tabindex="0"`, so Tab moves from the tablist into the panel even when it holds nothing focusable.
- Unselected panels have `hidden`. A disabled tab is a native `disabled` button.
- **Manual activation:** `data-strata-activation="manual"` on the tablist (the `activation="manual"` prop in
  React, Vue and Astro): the arrow keys only move focus, and Enter or Space selects.
- **Plain HTML:** `attachStrata` selects a tab on click and handles the keys below. It updates `aria-selected`,
  `tabindex` and `hidden`, and dispatches a bubbling `strata-tab-change` event from the tab with
  `{ tab, panel }`. **React and Vue:** `<Tabs>` holds the selection (`value`, `defaultValue`, `onChange`; `v-model`
  in Vue) around `<TabList>`, `<Tab>` and `<TabPanel>`. **Astro:** `<Tabs>` renders its tabs from `tabs` and each
  panel from the slot named by its value.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Into the tablist, onto the selected tab; from there into its panel |
| Right Arrow, Left Arrow | The next or previous enabled tab, wrapping; reversed in right-to-left text. Up and Down when vertical |
| Home, End | The first or last enabled tab |
| Enter, Space | Selects the focused tab (it is a button), for manual activation |

- Roles `tablist`, `tab` and `tabpanel`. Each tab names its panel through `aria-controls`, and each panel is
  named by its tab through `aria-labelledby`. Screen readers say "tab, 1 of 3, selected".
- The tablist is named by `aria-label` (the `label` prop) or by `aria-labelledby`.
- Moving to a tab selects it at once (automatic activation), which suits panels that are already rendered.

## 9. CSS presentation

The tablist is a flex row over its rail: the rail is the progress bar's groove (a `track` pill with an inner
shadow), 4 px high, along the bottom. Tabs are transparent buttons with the control font, at least the density's
control height, with `space.4` inline padding. The selected tab's indicator is an `accent` pill on the rail with a
small cast shadow from the light. Under `forced-colors` the rail is a `CanvasText` line and the indicator is
`Highlight`; the selected label stays `ButtonText`, so the indicator carries selection.

## 10. Tests

- **Plain DOM:** a click selects a tab and shows its panel; the arrow keys, Home and End move and select,
  wrapping and skipping a disabled tab; up and down when vertical; right to left reverses the arrows; manual
  activation moves focus only until Enter or Space; Tab goes from the selected tab into its panel;
  `strata-tab-change` reports the tab and the panel.
- **Bindings:** React, Vue and Astro render exactly the markup above; React and Vue follow `value` and report
  `onChange` (`v-model`), with real arrow keys.
- **GPU:** at Relief and Objects, the rail is a groove and the selected tab's indicator a mark; a real click on
  another tab moves the indicator there with GPU on, the pixels under the new tab show it, and the arrow keys
  select through the GPU.
- **Accessibility:** axe with the tabs in light and dark; the tab and panel roles, names and selection.

## 11. Rail form: `rail`

The tabs as **latching keys on one rail** ([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level), [design language section 6](../design-language.md#instrument-object-table)):
`form` (prop) or `data-strata-form` (on the root) chooses `rail`. Without it, or with `flush`, the Tabs are the flat tabs over a groove above, in the markup and the look
they had before, at every level; the premium character's default form, `rail`, is reached by naming it, so a page that does not opt in is unchanged. Sections 1, 6 and 8
hold: the tablist, the native `<button role="tab">`s, the panels, `aria-selected`, `aria-controls`, the roving tabindex, the arrow keys, Home and End, automatic and manual
activation, `strata-tab-change` and the reflow are exactly the Tabs'; the accessibility snapshot is the same with and without the form (the form's parts are `aria-hidden`).

```html
<div class="ug-tabs" data-strata-form="rail">
  <div class="ug-tabs__list" role="tablist" aria-label="Account" data-strata-face="raised">
    <button class="ug-tab" type="button" role="tab" id="account-tab-profile" aria-selected="true" aria-controls="account-panel-profile">
      <span class="ug-tab__led" data-strata-face="knob" aria-hidden="true"></span>
      <span class="ug-tab__cap" data-strata-face="raised"><span class="ug-tab__label">Profile</span></span>
    </button>
    <button class="ug-tab" type="button" role="tab" id="account-tab-security" aria-selected="false" aria-controls="account-panel-security" tabindex="-1">
      <span class="ug-tab__led" data-strata-face="knob" aria-hidden="true"></span>
      <span class="ug-tab__cap" data-strata-face="raised"><span class="ug-tab__label">Security</span></span>
    </button>
    <button class="ug-tab" type="button" role="tab" id="account-tab-billing" aria-selected="false" aria-controls="account-panel-billing" tabindex="-1" disabled>
      <span class="ug-tab__led" data-strata-face="knob" aria-hidden="true"></span>
      <span class="ug-tab__cap" data-strata-face="raised"><span class="ug-tab__label">Billing</span></span>
    </button>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-profile" aria-labelledby="account-tab-profile" tabindex="0">
    <p>Your name and photo.</p>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-security" aria-labelledby="account-tab-security" tabindex="0" hidden>
    <p>Your password and two-step sign-in.</p>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-billing" aria-labelledby="account-tab-billing" tabindex="0" hidden>
    <p>Your plan and invoices.</p>
  </div>
</div>
```

- **The construction is the bank's** (one polished plinth, each key its own object). The **tablist is the plinth** (`data-strata-face="raised"`, polished metal in the `knob`
  material; there is no `.ug-tabs__rail` groove and no `.ug-tab__indicator`). Each tab's native button holds its **cap** (`.ug-tab__cap`, a raised face: a key, the label on it) and
  its **LED** (`.ug-tab__led`, a lens on the plinth above the cap). The button covers both and the room round them, so every press lands on it.
- **Latching.** The selected tab is the key that is down (`--strata-push-t` 0.45, the push button's latched place, `spring.button`; 1 while it is held) and its LED lit
  (`--strata-lit` 1, an emitter at every GPU level: the `emitter.led.*` tokens). Selection is never the light alone: the key is down, `aria-selected` says so, and under
  more contrast, the contrast themes and forced colours the selected key also takes a bar under its label or the `Highlight` colours.
- **The panel is the faceplate under the rail**: a printed plate edge (a 1 px `edge` border, the control radius, a faint tint) the rail sits over. Its semantics, `tabindex="0"`,
  `hidden` and place in the focus order are unchanged; it is captured content, never a GPU face, so its text is never shaded.
- **Keyboard.** Unchanged: Tab onto the selected key, Left and Right (Up and Down when vertical) move and select (or only move, with manual activation), Home and End, Enter
  and Space; the focus ring is the CSS outline round the cap.
- **Reflow.** The plinth wraps its keys at a narrow width as the flat tabs do (`flex-wrap`), and a vertical rail is a column plinth; text at 200% grows the caps, not the page.
- **Presentations.** Relief: the plinth and each cap are raised faces and each LED a ring; the selected cap is pressed. Objects: the plinth a slab, each cap a key standing on it
  (travelling when pressed, fitted so its shadow stays in its tab's box), each LED a dome. Instrument: **one polished plinth part** (the box rule's margin inside the tablist's
  box, no shadow of its own) and, per tab, an object of a body with the captured cap travelling on the CSS throw and a glass LED lens with its emitter, both standing on the
  plinth; selecting a tab changes the pose and the emitters, and the capture core makes of the changed `aria-selected`.
- **Props.** `form` on `Tabs` (React, Vue and Astro): `rail`; `flush` or none for the flat tabs; any other string is not used (a `<div>` has no native `form`). Everything else is the
  Tabs'.

**Tests.** `ui-tabs-forms.test.mjs` (plain DOM, touch at 390 and 320 px, preferences, GPU at Relief, Objects and Instrument at DPR 1 and 2), `ui-tabs-forms-bindings.test.mjs`
(React and Vue), `ui-tabs-forms-astro.test.mjs`.
