/**
 * Entry for `ui-gpu.html`: a Strata panel of Tier A controls (plain contract markup and the Strata stylesheet) as a
 * direct child of an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataGpuProbe` is the hook
 * for `tests/browser/ui-gpu.test.mjs`; `?dom` starts in the CSS presentation, `?plain` leaves the panel to the page
 * (no `attachStrataGpu`), `?level=objects` presents the components as objects, and `?adjust=budget,down,up,window` turns
 * the adjust policy on (frame budget in ms, then frame counts); `strataGpuProbe.load(ms)` makes each frame that slow.
 * `?level=scene` adds the Scene level (`strataGpuProbe.burst()` bursts confetti from Save), and `?environment=url` lights
 * objects with an `.hdr` environment. `strataGpuProbe.openDrawer()` opens a Drawer on the end edge that closes on a click
 * outside it (`closeOnScrim`); the Dialog does not. `strataGpuProbe.addTabs()` adds plain-markup Tabs to the panel, wired by
 * `attachStrata`, `strataGpuProbe.addAccordion()` a native `<details>` Accordion, `strataGpuProbe.addList()` a List, and
 * `strataGpuProbe.addTable()` a Table whose Amount column the page sorts, `strataGpuProbe.addAvatar()` an Avatar, and
 * `strataGpuProbe.addChips()` a tag and a filter chip, `strataGpuProbe.addMessage()` a MessageBar with an action, and
 * `strataGpuProbe.addPagination()` three page keys, `strataGpuProbe.addToolbar()` a Toolbar of toggle buttons, 
 * `strataGpuProbe.addAppBar()` an AppBar, `strataGpuProbe.addTooltip()` a tooltip for Save, outside the root,
 * `strataGpuProbe.addSegmented()` a SegmentedControl of three keys,
 * `strataGpuProbe.addRating()` a Rating of five stars,
 * `strataGpuProbe.addStepper()` a Stepper of three steps, which `strataGpuProbe.stepTo(index)` moves as a binding would,
 * `strataGpuProbe.addRail()` a NavigationRail of two destinations,
 * `strataGpuProbe.addPopover()` a Filters button in the panel whose Popover is in `<body>`,
 * `strataGpuProbe.addTree()` a TreeView, run by `attachStrata`,
 * `strataGpuProbe.addCarousel()` a Carousel of two slides, run by `attachStrata`,
 * `strataGpuProbe.addMenu()` an Actions menu button in the panel whose Menu is in `<body>`,
 * `strataGpuProbe.addCombobox()` a Combobox with three suggestions, and
 * `strataGpuProbe.addDatePicker()` a DatePicker, empty.
 * `strataGpuProbe.addPanel()` adds a second Strata panel beside the first (`side()`, `sceneOf(panel)`, `presses()`), for what
 * happens to one panel and not to the other; `?poll=ms` sets how often the helper reads every panel whatever happened.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrataGpu, type BurstOptions, type StrataAdjustEvent, type StrataGpu } from "@underglass/ui/gpu";
import { attachStrata, showStrataDialog, showStrataToast, strataEnter, strataLeave, type DialogHandle, type PanelMotionOptions } from "@underglass/ui/dom";

const markup = `
  <h2 id="gpu-title" style="margin:0 0 12px;font-size:18px">Account</h2>
  <div class="ug-field" style="margin-bottom:12px">
    <label class="ug-field__label" for="gpu-name">Name</label>
    <input class="ug-text-field" data-strata-face="well" id="gpu-name" value="Ada Lovelace" />
  </div>
  <div style="display:flex;gap:24px;margin-bottom:12px">
    <label class="ug-checkbox"><input class="ug-checkbox__input" data-strata-face="well" type="checkbox" id="gpu-news" checked />
      <span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">Newsletter</span></label>
    <label class="ug-switch"><input class="ug-switch__input" data-strata-face="well" type="checkbox" role="switch" id="gpu-wifi" />
      <span class="ug-switch__knob" data-strata-face="knob" aria-hidden="true"></span><span class="ug-switch__label">Wi-Fi</span></label>
  </div>
  <input type="range" class="ug-slider" data-strata-face="groove" id="gpu-volume" min="0" max="100" value="40" aria-label="Volume" style="margin-bottom:12px" />
  <div style="display:flex;gap:12px;align-items:center">
    <button type="button" class="ug-button" data-strata-face="raised" id="gpu-cancel"><span class="ug-button__label">Cancel</span></button>
    <button type="button" class="ug-button ug-button--accent" data-strata-face="raised" id="gpu-save"><span class="ug-button__label">Save</span></button>
    <button type="button" class="ug-button" data-strata-face="raised" id="gpu-disabled" disabled><span class="ug-button__label">Disabled</span></button>
    <button type="button" class="ug-button" data-strata-face="raised" id="gpu-open"><span class="ug-button__label">Delete…</span></button>
    <span class="ug-spinner ug-spinner--md" role="status" data-strata-face="ring"><span class="ug-spinner__arc" aria-hidden="true"></span><span class="ug-spinner__label">Saving</span></span>
  </div>
  <p id="gpu-count" style="margin:12px 0 0">Saved 0 times</p>`;

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
let panel!: HTMLElement;
let root!: HTMLElement;
let dialog: { panel: HTMLElement; handle: DialogHandle } | undefined;
const closes: string[] = [];
/**
 * Opens a Strata Dialog (or a Drawer on the end edge) as a top-level panel of the Underglass root, as the React and Vue
 * bindings do with `container`: its scrim and panel are added as root children, so `attachStrataGpu` presents it as its
 * own GPU panel. The Drawer closes on a click outside it (`closeOnScrim`).
 */
function openDialog(kind: "dialog" | "drawer" = "dialog") {
  const scrim = document.createElement("div");
  scrim.className = "ug-scrim";
  scrim.setAttribute("aria-hidden", "true");
  const section = document.createElement("section");
  section.className = kind === "dialog" ? "ug-panel ug-dialog" : "ug-panel ug-drawer ug-drawer--end";
  section.id = `gpu-${kind}`;
  Object.assign(section, { tabIndex: -1 });
  for (const [name, value] of [["role", "dialog"], ["aria-modal", "true"], ["aria-labelledby", `gpu-${kind}-title`], ["data-strata-face", "raised"], ["data-strata-elevation", "modal"]]) section.setAttribute(name, value);
  section.innerHTML = kind === "dialog" ? `<h2 class="ug-dialog__title" id="gpu-dialog-title">Delete the account?</h2>
    <div class="ug-dialog__body"><p style="margin:0">This cannot be undone.</p></div>
    <div class="ug-dialog__actions">
      <button type="button" class="ug-button" data-strata-face="raised" id="gpu-dialog-cancel"><span class="ug-button__label">Cancel</span></button>
      <button type="button" class="ug-button ug-button--accent" data-strata-face="raised" id="gpu-dialog-delete"><span class="ug-button__label">Delete</span></button>
    </div>` : `<h2 class="ug-drawer__title" id="gpu-drawer-title">Filters</h2>
    <div class="ug-drawer__body"><p style="margin:0">A click outside the drawer closes it.</p></div>
    <div class="ug-drawer__actions">
      <button type="button" class="ug-button" data-strata-face="raised" id="gpu-drawer-done"><span class="ug-button__label">Done</span></button>
    </div>`;
  root.append(scrim, section);
  const close = async (reason: string) => {
    closes.push(reason);
    await dialog?.handle.close();
    scrim.remove(); section.remove();
    dialog = undefined;
  };
  const handle = showStrataDialog(section, { onClose: reason => void close(reason), closeOnScrim: kind === "drawer" });
  for (const button of section.querySelectorAll("button")) button.addEventListener("click", () => void close(button.id.replace(`gpu-${kind}-`, "")));
  dialog = { panel: section, handle };
}
/** Tabs in plain markup (`tabs.md`), added to the panel by `strataGpuProbe.addTabs()`. */
const tabsMarkup = `<div class="ug-tabs" id="gpu-tabs" style="margin-top:12px">
  <div class="ug-tabs__list" role="tablist" aria-label="Views">
    <span class="ug-tabs__rail" data-strata-face="groove" aria-hidden="true"></span>
    ${["overview", "activity", "settings"].map((value, index) => `<button class="ug-tab" type="button" role="tab" id="gpu-tabs-tab-${value}" aria-selected="${index === 0}" aria-controls="gpu-tabs-panel-${value}"${index ? ' tabindex="-1"' : ""}><span class="ug-tab__label">${value[0]!.toUpperCase() + value.slice(1)}</span><span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span></button>`).join("")}
  </div>
  ${["overview", "activity", "settings"].map((value, index) => `<div class="ug-tabs__panel" role="tabpanel" id="gpu-tabs-panel-${value}" aria-labelledby="gpu-tabs-tab-${value}" tabindex="0"${index ? " hidden" : ""}>The ${value} view.</div>`).join("")}
</div>`;
/** An exclusive Accordion in plain markup (`accordion.md`), added to the panel by `strataGpuProbe.addAccordion()`. */
const accordionMarkup = `<div class="ug-accordion" id="gpu-accordion" style="margin-top:12px">
  <details class="ug-accordion__item" data-strata-face="raised" name="gpu-faq" id="gpu-shipping"><summary class="ug-accordion__header"><span class="ug-accordion__title">Shipping</span><span class="ug-accordion__chevron" aria-hidden="true"></span></summary><div class="ug-accordion__body"><p>Orders ship within two days.</p></div></details>
  <details class="ug-accordion__item" data-strata-face="raised" name="gpu-faq" id="gpu-returns"><summary class="ug-accordion__header"><span class="ug-accordion__title">Returns</span><span class="ug-accordion__chevron" aria-hidden="true"></span></summary><div class="ug-accordion__body"><p>Return any item within 30 days.</p></div></details>
</div>`;
/** A List in plain markup (`list.md`), added to the panel by `strataGpuProbe.addList()`; its button row counts presses. */
const listMarkup = `<ul class="ug-list" role="list" data-strata-face="raised" aria-label="Folders" id="gpu-list" style="margin-top:12px">
  <li class="ug-list__item"><button class="ug-list__action" type="button" id="gpu-list-archive"><span class="ug-list__text"><span class="ug-list__primary">Archive</span><span class="ug-list__secondary">Older than a year</span></span></button></li>
  <li class="ug-list__item"><span class="ug-list__text"><span class="ug-list__primary">Storage</span></span><span class="ug-list__end">4.2 GB</span></li>
</ul>`;
/** A Table in plain markup (`table.md`), added by `strataGpuProbe.addTable()`; its Amount button sorts the rows. */
const tableMarkup = `<div class="ug-table" data-strata-face="raised" id="gpu-table" style="margin-top:12px"><table class="ug-table__table"><caption class="ug-table__caption">Payments</caption>
  <thead><tr><th class="ug-table__header" scope="col">Customer</th><th class="ug-table__header ug-table__header--numeric" scope="col"><button class="ug-table__sort" type="button" id="gpu-table-amount">Amount</button></th></tr></thead>
  <tbody>${[["Ada", 120], ["Grace", 87.5], ["Alan", 42]].map(([name, amount]) => `<tr class="ug-table__row"><td class="ug-table__cell">${name}</td><td class="ug-table__cell ug-table__cell--numeric">${amount}</td></tr>`).join("")}</tbody></table></div>`;
function sortTable() {
  const header = panel.querySelector<HTMLElement>("#gpu-table-amount")!.parentElement!, body = panel.querySelector("#gpu-table tbody")!;
  const direction = header.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
  header.setAttribute("aria-sort", direction);
  const rows = [...body.children].sort((a, b) => (Number(a.lastElementChild!.textContent) - Number(b.lastElementChild!.textContent)) * (direction === "ascending" ? 1 : -1));
  body.append(...rows);
}
let archived = 0;
/** A tooltip for Save (`tooltip.md`), added by `strataGpuProbe.addTooltip()`: the tooltip goes to the end of the body. */
function addTooltip() {
  panel.querySelector("#gpu-save")!.setAttribute("aria-describedby", "gpu-save-tip");
  document.body.insertAdjacentHTML("beforeend", '<div class="ug-tooltip" id="gpu-save-tip" role="tooltip" popover="manual">Saves your changes</div>');
  attachStrata(panel);
}
/** An AppBar in plain markup (`app-bar.md`), added by `strataGpuProbe.addAppBar()`; its button counts presses. */
const appBarMarkup = `<header class="ug-app-bar" data-strata-face="raised" id="gpu-app-bar" style="margin-top:12px"><span class="ug-app-bar__title">Underglass</span><div class="ug-app-bar__end"><button type="button" class="ug-button" data-strata-face="raised" id="gpu-sign-in"><span class="ug-button__label">Sign in</span></button></div></header>`;
let signIns = 0;
/** A Toolbar in plain markup (`toolbar.md`), added by `strataGpuProbe.addToolbar()` and wired by `attachStrata`. */
const toolbarMarkup = `<div class="ug-toolbar" role="toolbar" aria-label="Formatting" data-strata-face="raised" id="gpu-toolbar" style="margin-top:12px">${["Bold", "Italic", "Underline"].map(name => `<button type="button" class="ug-toggle-button" data-strata-face="raised" aria-pressed="false" id="gpu-tool-${name.toLowerCase()}"><span class="ug-toggle-button__label">${name}</span></button>`).join("")}</div>`;
/** Pagination in plain markup (`pagination.md`), page 2 of 3, added by `strataGpuProbe.addPagination()`; its buttons move the page. */
const paginationMarkup = `<nav class="ug-pagination" aria-label="Pagination" id="gpu-pagination" style="margin-top:12px"><ul class="ug-pagination__list">${[1, 2, 3].map(page => `<li class="ug-pagination__item"><button class="ug-pagination__link" data-strata-face="raised" type="button" aria-label="Page ${page}" id="gpu-page-${page}"${page === 2 ? ' aria-current="page"' : ""}>${page}</button></li>`).join("")}</ul></nav>`;
/** A MessageBar in plain markup (`message-bar.md`), added by `strataGpuProbe.addMessage()`; its action counts presses. */
const messageMarkup = `<div class="ug-message-bar ug-message-bar--warning" data-strata-face="raised" role="alert" id="gpu-message" style="margin-top:12px"><span class="ug-message-bar__icon" aria-hidden="true"></span><div class="ug-message-bar__content"><p class="ug-message-bar__body">Storage almost full.</p></div><div class="ug-message-bar__actions"><button class="ug-button" data-strata-face="raised" type="button" id="gpu-message-action"><span class="ug-button__label">Upgrade</span></button></div></div>`;
let upgrades = 0;
/** A SegmentedControl in plain markup (`segmented-control.md`), added by `strataGpuProbe.addSegmented()`, Week selected. */
const segmentedMarkup = `<fieldset class="ug-segmented" style="margin-top:12px"><legend class="ug-segmented__legend">View</legend><div class="ug-segmented__plinth">${
  ["Day", "Week", "Month"].map(label => `<label class="ug-segmented__item"><input class="ug-segmented__input" type="radio" name="gpu-view" value="${label.toLowerCase()}" ${label === "Week" ? "checked" : ""}><span class="ug-segmented__key" data-strata-face="raised" id="gpu-segment-${label.toLowerCase()}">${label}</span></label>`).join("")}</div></fieldset>`;
/** A DatePicker in plain markup (`date-picker.md`), added by `strataGpuProbe.addDatePicker()`, empty. */
const datePickerMarkup = `<input class="ug-text-field ug-date-picker" data-strata-face="well" type="date" id="gpu-date-picker" aria-label="Due date" style="margin-top:12px">`;
/** A Rating in plain markup (`rating.md`), added by `strataGpuProbe.addRating()`, at 2. */
/** A Combobox in plain markup (`combobox.md`), added by `strataGpuProbe.addCombobox()`, empty. */
const comboboxMarkup = `<input class="ug-text-field ug-combobox" data-strata-face="well" type="text" autocomplete="off" id="gpu-combobox" list="gpu-combobox-options" aria-label="Fruit" style="margin-top:12px"><datalist id="gpu-combobox-options">${
  ["Apple", "Apricot", "Banana"].map(fruit => `<option value="${fruit}"></option>`).join("")}</datalist>`;
const ratingMarkup = `<fieldset class="ug-rating" style="margin-top:12px"><legend class="ug-rating__legend">Your rating</legend><div class="ug-rating__stars">${
  [1, 2, 3, 4, 5].map(score => `<label class="ug-rating__item" id="gpu-star-${score}"><input class="ug-rating__input" type="radio" name="gpu-score" value="${score}" ${score === 2 ? "checked" : ""}><span class="ug-rating__star" aria-hidden="true"></span><span class="ug-rating__label">${score} stars</span></label>`).join("")}</div></fieldset>`;
/** A Stepper in plain markup (`stepper.md`), added by `strataGpuProbe.addStepper()`, at its second step. */
const stepperMarkup = `<ol class="ug-stepper" aria-label="Checkout progress" style="margin-top:12px">${["Cart", "Shipping", "Payment"].map((label, index) =>
  `<li class="ug-stepper__step"${index === 1 ? ' aria-current="step"' : ""}>${index ? `<span class="ug-stepper__line" data-strata-face="groove" aria-hidden="true" id="gpu-line-${index}"></span>` : ""}<span class="ug-stepper__marker" data-strata-face="${index <= 1 ? "raised" : "flat"}" aria-hidden="true" id="gpu-marker-${index}">${index + 1}</span><span class="ug-stepper__label">${label}</span></li>`).join("")}</ol>`;
/** Moves the Stepper's current step and its markers' faces, as a binding re-renders them. */
function stepTo(current: number) {
  panel.querySelectorAll(".ug-stepper__step").forEach((step, index) => {
    step.toggleAttribute("aria-current", index === current);
    if (index === current) step.setAttribute("aria-current", "step");
    step.querySelector(".ug-stepper__marker")!.setAttribute("data-strata-face", index <= current ? "raised" : "flat");
  });
}
/** A NavigationRail in plain markup (`navigation-rail.md`), added by `strataGpuProbe.addRail()`; Inbox is current. */
const railMarkup = `<nav class="ug-nav-rail" data-strata-face="raised" aria-label="Main" id="gpu-rail" style="margin-top:12px"><ul class="ug-nav-rail__list" role="list">${
  ["Inbox", "Drafts"].map(label => `<li class="ug-nav-rail__entry"><a class="ug-nav-rail__item" data-strata-face="raised" id="gpu-rail-${label.toLowerCase()}" href="#rail-${label.toLowerCase()}"${label === "Inbox" ? ' aria-current="page"' : ""}><span class="ug-nav-rail__icon" aria-hidden="true"></span><span class="ug-nav-rail__label">${label}</span></a></li>`).join("")}</ul></nav>`;
let applied = 0;
/** A Popover (`popover.md`): its button in the panel, the popover itself at the end of `<body>`, outside the root. */
function addPopover() {
  panel.insertAdjacentHTML("beforeend", `<p style="margin:12px 0 0"><button class="ug-button" data-strata-face="raised" type="button" id="gpu-popover-open" popovertarget="gpu-popover"><span class="ug-button__label">Filters</span></button></p>`);
  document.body.insertAdjacentHTML("beforeend", `<div class="ug-popover" data-strata-face="raised" id="gpu-popover" popover role="dialog" aria-label="Filters"><div class="ug-popover__body"><button class="ug-button" data-strata-face="raised" type="button" id="gpu-popover-apply"><span class="ug-button__label">Apply</span></button></div></div>`);
  document.getElementById("gpu-popover-apply")!.addEventListener("click", () => { applied++; });
  attachStrata(panel);
  strata?.refresh();
}
/** A TreeView in plain markup (`tree-view.md`), added by `strataGpuProbe.addTree()`: src (closed, with one file) and a README. */
const treeMarkup = `<ul class="ug-tree" data-strata-face="raised" role="tree" aria-label="Files" id="gpu-tree" style="margin-top:12px">
  <li class="ug-tree__item" role="treeitem" data-strata-value="src" aria-expanded="false" aria-selected="false" tabindex="0"><span class="ug-tree__row"><span class="ug-tree__toggle" aria-hidden="true"></span><span class="ug-tree__label">src</span></span>
    <ul class="ug-tree__group" role="group"><li class="ug-tree__item" role="treeitem" data-strata-value="src/index.ts" aria-selected="false" tabindex="-1"><span class="ug-tree__row"><span class="ug-tree__label">index.ts</span></span></li></ul></li>
  <li class="ug-tree__item" role="treeitem" data-strata-value="readme" aria-selected="false" tabindex="-1"><span class="ug-tree__row" id="gpu-tree-readme"><span class="ug-tree__label">README.md</span></span></li></ul>`;
/** A Carousel in plain markup (`carousel.md`), added by `strataGpuProbe.addCarousel()`: two slides of different text. */
const carouselMarkup = `<section class="ug-carousel" aria-roledescription="carousel" aria-label="Stories" id="gpu-carousel" style="margin-top:12px">
  <div class="ug-carousel__slides" aria-live="polite"><div class="ug-carousel__slide" role="group" aria-roledescription="slide" aria-label="1 of 2"><p style="margin:0">WWWWWWWWWWWW</p></div><div class="ug-carousel__slide" role="group" aria-roledescription="slide" aria-label="2 of 2" hidden><p style="margin:0">iiiiiiiiiiii</p></div></div>
  <div class="ug-carousel__controls"><button type="button" class="ug-icon-button ug-carousel__previous" data-strata-face="raised" aria-label="Previous slide" id="gpu-carousel-previous"><span class="ug-icon-button__icon" aria-hidden="true"></span></button>
  <div class="ug-carousel__picker" role="group" aria-label="Slides"><button type="button" class="ug-carousel__key" data-strata-face="raised" aria-label="Slide 1" aria-current="true" id="gpu-carousel-key-1"></button><button type="button" class="ug-carousel__key" data-strata-face="raised" aria-label="Slide 2" id="gpu-carousel-key-2"></button></div>
  <button type="button" class="ug-icon-button ug-carousel__next" data-strata-face="raised" aria-label="Next slide" id="gpu-carousel-next"><span class="ug-icon-button__icon" aria-hidden="true"></span></button></div></section>`;
const menuChoices: string[] = [];
/** A Menu (`menu.md`): its button in the panel, the menu itself at the end of `<body>`, outside the root. */
function addMenu() {
  panel.insertAdjacentHTML("beforeend", `<p style="margin:12px 0 0"><button class="ug-button" data-strata-face="raised" type="button" id="gpu-menu-open" popovertarget="gpu-menu" aria-haspopup="menu"><span class="ug-button__label">Actions</span></button></p>`);
  document.body.insertAdjacentHTML("beforeend", `<div class="ug-menu" data-strata-face="raised" id="gpu-menu" popover role="menu" aria-label="Actions">${["Rename", "Duplicate"].map(label => `<button class="ug-menu__item" type="button" role="menuitem" tabindex="-1">${label}</button>`).join("")}</div>`);
  document.getElementById("gpu-menu")!.addEventListener("click", event => { const entry = (event.target as Element).closest("[role='menuitem']"); if (entry) menuChoices.push(entry.textContent!); });
  attachStrata(panel);
  strata?.refresh();
}
/** Chips in plain markup (`chip.md`), added by `strataGpuProbe.addChips()`: a tag and a filter chip. */
const chipsMarkup = `<p style="margin:12px 0 0;display:flex;gap:8px"><span class="ug-chip" data-strata-face="raised" id="gpu-tag"><span class="ug-chip__label">Design</span></span><button class="ug-chip" data-strata-face="raised" type="button" aria-pressed="false" id="gpu-filter"><span class="ug-chip__label">Remote</span></button></p>`;
/** An Avatar in plain markup (`avatar.md`), added to the panel by `strataGpuProbe.addAvatar()`. */
const avatarMarkup = `<p style="margin:12px 0 0"><span class="ug-avatar" data-strata-face="raised" role="img" aria-label="Ada Lovelace" id="gpu-avatar"><span class="ug-avatar__initials" aria-hidden="true">AL</span></span></p>`;
/** The second panel (`strataGpuProbe.addPanel()`): a checkbox and a button that counts its presses. */
const sideMarkup = `<label class="ug-checkbox"><input class="ug-checkbox__input" data-strata-face="well" type="checkbox" id="gpu-side-check" />
    <span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">On</span></label>
  <p style="margin:12px 0 0"><button type="button" class="ug-button" data-strata-face="raised" id="gpu-side-press"><span class="ug-button__label">Press</span></button></p>`;
let side: HTMLElement | undefined, presses = 0;
function addPanel() {
  side = document.createElement("section");
  side.className = "ug-panel";
  side.id = "gpu-side";
  side.setAttribute("data-strata-face", "raised");
  side.setAttribute("data-strata-elevation", "floating");
  side.setAttribute("aria-label", "Side");
  Object.assign(side.style, compileStyle({ x: 600, y: 50, width: 130 }, {}, true));
  side.innerHTML = sideMarkup;
  root.append(side);
  side.querySelector("#gpu-side-press")!.addEventListener("click", () => { presses++; });
  strata?.refresh();
}
let saves = 0;
// Declared before mounting: the runtime may report status while it mounts.
let strata: StrataGpu | undefined;
const controller: CanvasController = mountApplicationModule({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
  onStatusChange: () => strata?.refresh(),
}, { mount({ container }) {
  panel = document.createElement("section");
  panel.className = "ug-panel";
  panel.id = "gpu-panel";
  panel.setAttribute("data-strata-face", "raised");
  panel.setAttribute("data-strata-elevation", "floating");
  panel.setAttribute("aria-labelledby", "gpu-title");
  Object.assign(panel.style, compileStyle({ x: 60, y: 50, width: 520 }, {}, true));
  panel.innerHTML = markup;
  container.append(panel);
  root = container;
  panel.querySelector("#gpu-open")!.addEventListener("click", () => openDialog());
  panel.querySelector("#gpu-save")!.addEventListener("click", () => { saves++; panel.querySelector("#gpu-count")!.textContent = `Saved ${saves} times`; });
  return () => container.replaceChildren();
} });
const level = params.get("level") === "objects" || params.get("level") === "scene" ? params.get("level") as "objects" | "scene" : undefined;
const adjusting = params.get("adjust")?.split(",").map(Number);
const adjustments: StrataAdjustEvent[] = [];
const adjust = adjusting ? { enabled: true, frameBudgetMs: adjusting[0], stepDownAfterFrames: adjusting[1], stepUpAfterFrames: adjusting[2], window: adjusting[3] } : undefined;
strata = params.has("plain") ? undefined : attachStrataGpu(controller, { level, adjust, onAdjust: event => adjustments.push(event), environment: params.get("environment") ?? undefined,
  ...(params.has("poll") ? { poll: Number(params.get("poll")) } : {}) });
// An artificial cost per frame, so tests can drive the adjust policy.
let load = 0;
const busy = () => { const until = performance.now() + load; while (performance.now() < until) { /* spin */ } if (load) requestAnimationFrame(busy); };
host("enable").addEventListener("click", () => void controller.enable());
host("disable").addEventListener("click", () => void controller.disable());
host("theme").addEventListener("change", event => {
  document.documentElement.setAttribute("data-strata-theme", (event.target as HTMLInputElement).checked ? "dark" : "light");
});
if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());

window.strataGpuProbe = {
  controller, panel: () => panel, saves: () => saves,
  scene: () => strata?.scene(panel),
  addPanel, side: () => side, sceneOf: element => strata?.scene(element), presses: () => presses,
  refresh: () => strata?.refresh(),
  detach: () => { strata?.detach(); strata = undefined; },
  cap: () => strata?.cap(), adjustments: () => [...adjustments],
  burst: options => strata?.burst(panel.querySelector("#gpu-save")!, options) ?? Promise.resolve(),
  root: () => root,
  load: ms => { const start = !load && ms > 0; load = ms; if (start) requestAnimationFrame(busy); },
  enter: options => strataEnter(panel, options),
  dialog: () => dialog?.panel, closes: () => [...closes], openDrawer: () => openDialog("drawer"),
  addTooltip,
  addSegmented: () => { panel.insertAdjacentHTML("beforeend", segmentedMarkup); strata?.refresh(); },
  addRating: () => { panel.insertAdjacentHTML("beforeend", ratingMarkup); strata?.refresh(); },
  addStepper: () => { panel.insertAdjacentHTML("beforeend", stepperMarkup); strata?.refresh(); },
  stepTo,
  addRail: () => { panel.insertAdjacentHTML("beforeend", railMarkup); strata?.refresh(); },
  addPopover,
  addMenu,
  addCombobox: () => { panel.insertAdjacentHTML("beforeend", comboboxMarkup); strata?.refresh(); },
  addDatePicker: () => { panel.insertAdjacentHTML("beforeend", datePickerMarkup); strata?.refresh(); },
  menuChoices: () => [...menuChoices],
  applied: () => applied,
  addTree: () => { panel.insertAdjacentHTML("beforeend", treeMarkup); attachStrata(panel); strata?.refresh(); },
  addCarousel: () => { panel.insertAdjacentHTML("beforeend", carouselMarkup); attachStrata(panel); strata?.refresh(); },
  toast: () => { showStrataToast({ message: "Saved.", intent: "success", duration: Infinity }); },
  addAppBar: () => { panel.insertAdjacentHTML("beforeend", appBarMarkup); panel.querySelector("#gpu-sign-in")!.addEventListener("click", () => { signIns++; }); strata?.refresh(); },
  signIns: () => signIns,
  addToolbar: () => { panel.insertAdjacentHTML("beforeend", toolbarMarkup); attachStrata(panel); strata?.refresh(); },
  addPagination: () => {
    panel.insertAdjacentHTML("beforeend", paginationMarkup);
    for (const key of panel.querySelectorAll<HTMLElement>("#gpu-pagination button")) key.addEventListener("click", () => {
      for (const other of panel.querySelectorAll("#gpu-pagination button")) other.removeAttribute("aria-current");
      key.setAttribute("aria-current", "page");
    });
    strata?.refresh();
  },
  addMessage: () => { panel.insertAdjacentHTML("beforeend", messageMarkup); panel.querySelector("#gpu-message-action")!.addEventListener("click", () => { upgrades++; }); strata?.refresh(); },
  upgrades: () => upgrades,
  addChips: () => { panel.insertAdjacentHTML("beforeend", chipsMarkup); attachStrata(panel); strata?.refresh(); },
  addAvatar: () => { panel.insertAdjacentHTML("beforeend", avatarMarkup); strata?.refresh(); },
  addTable: () => { panel.insertAdjacentHTML("beforeend", tableMarkup); panel.querySelector("#gpu-table-amount")!.addEventListener("click", sortTable); strata?.refresh(); },
  addList: () => { panel.insertAdjacentHTML("beforeend", listMarkup); panel.querySelector("#gpu-list-archive")!.addEventListener("click", () => { archived++; }); strata?.refresh(); },
  archived: () => archived,
  addAccordion: () => { panel.insertAdjacentHTML("beforeend", accordionMarkup); strata?.refresh(); },
  addTabs: () => { panel.insertAdjacentHTML("beforeend", tabsMarkup); attachStrata(panel); strata?.refresh(); },
  leave: options => strataLeave(panel, options),
};
declare global {
  interface Window { strataGpuProbe: {
    controller: CanvasController; panel(): HTMLElement; saves(): number;
    scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; detach(): void;
    addPanel(): void; side(): HTMLElement | undefined; sceneOf(element: HTMLElement): ReturnType<StrataGpu["scene"]>; presses(): number;
    cap(): string | undefined; adjustments(): StrataAdjustEvent[]; load(ms: number): void;
    burst(options?: BurstOptions): Promise<void>; root(): HTMLElement;
    enter(options?: PanelMotionOptions): Promise<void>; leave(options?: PanelMotionOptions): Promise<void>;
    dialog(): HTMLElement | undefined; closes(): string[]; openDrawer(): void; addTabs(): void; addAccordion(): void; addList(): void; archived(): number; addTable(): void; addAvatar(): void; addChips(): void; addMessage(): void; upgrades(): number; addPagination(): void; addToolbar(): void; addAppBar(): void; signIns(): number; addTooltip(): void; addSegmented(): void; addRating(): void; addCombobox(): void; addStepper(): void; stepTo(index: number): void; addRail(): void; addPopover(): void; applied(): number; addTree(): void; addCarousel(): void; addMenu(): void; addDatePicker(): void; menuChoices(): string[]; toast(): void;
  } }
}
