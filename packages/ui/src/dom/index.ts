/**
 * `@underglass/ui/dom`: framework-neutral runtime for the page: applying an application theme with runtime updates,
 * scope overrides for a subtree, panel motion through depth, modal Dialog and Drawer behaviour, Tabs keyboard and selection, the Knob's round behaviour, the Lamp's momentary press, and the behaviour native elements need in markup rendered
 * without a binding (`attachStrata`). React, Vue and Astro bindings build on it.
 */
export { applyStrataTheme, resolveStrataScope, strataScope } from "./theme.ts";
export type { AppliedTheme, ApplyThemeOptions, ReportMode, ScopeOptions, ScopeOverrides, StrataScope } from "./theme.ts";
export { strataEnter, strataLeave } from "./motion.ts";
export { stageOf, strataStage } from "./stage.ts";
export type { StagePresenter } from "./stage.ts";
export type { PanelMotionOptions } from "./motion.ts";
export { showStrataDialog } from "./dialog.ts";
export type { DialogCloseReason, DialogHandle, DialogOptions } from "./dialog.ts";
export { attachStrata } from "./behaviour.ts";
export { selectStrataTab, strataTabsActivation, strataTabTarget } from "./tabs.ts";
export { rovingStrataToolbar, strataToolbarTarget } from "./toolbar.ts";
export { attachStrataSwitches, pastCentre, switchTapSlop } from "./switch.ts";
export { attachStrataFeedback, listenForStrataFeedback, strataFeedback, strataPulses, strataSoundLength, strataSoundSet, synthesiseStrataSound } from "./feedback.ts";
export type { StrataFeedbackHandle, StrataFeedbackOptions, StrataSound, StrataSoundKind } from "./feedback.ts";
export { attachStrataTooltips, hideStrataTooltip, showStrataTooltip } from "./tooltip.ts";
export { attachStrataPopovers, placeStrataPopover } from "./popover.ts";
export { attachStrataTrees, rovingStrataTree, strataTreeAction, strataTreeTabStop, visibleStrataTreeItems } from "./tree.ts";
export type { StrataTreeAction } from "./tree.ts";
export { attachStrataFaders, syncStrataFader } from "./fader.ts";
export { attachStrataCarousels, showStrataSlide, strataSlideIndex, strataSlideTarget } from "./carousel.ts";
export { attachStrataMenus, strataMenuTarget } from "./menu.ts";
export { attachStrataKnobs, syncStrataKnob } from "./knob.ts";
export { attachStrataLamps } from "./lamp.ts";
export { setStrataStatusLight } from "./status-light.ts";
export type { StatusLightUpdate } from "./status-light.ts";
export { showStrataToast } from "./toast.ts";
export type { ToastHandle, ToastOptions } from "./toast.ts";
export type { TabChange, TabsActivation } from "./tabs.ts";
export type { PressedChange } from "./behaviour.ts";
