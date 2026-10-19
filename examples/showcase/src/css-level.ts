/**
 * The CSS level of the Instrument gallery's level switch: the panels are presented on the GPU as plain layers (captured as the browser
 * paints them, with Strata's CSS presentation and no material), so the switch can compare CSS, Relief, Objects and Instrument on one
 * running compositor with GPU on throughout. `attachStrataGpu` is left out at this level, and this takes its place for enrollment only:
 * every shown direct child of the root that is a panel, a dialog, a drawer or a scrim is enrolled, and released before it is hidden or
 * removed. It also carries the stage hook (`strataStage`), so a Dialog or Drawer opened at this level is presented as at the others.
 */
import type { StrataGpuController } from "@underglass/ui/gpu";
import { strataStage, type StagePresenter } from "@underglass/ui/dom";

const selector = ".ug-panel, .ug-dialog, .ug-drawer, .ug-scrim";

/** Starts presenting `root`'s panels as plain layers; the returned function lets them all go. */
export function attachCssLevel(controller: StrataGpuController): () => void {
  const root = controller.container;
  const enrolled = new Map<HTMLElement, () => void>();
  let serial = 0, detached = false;
  const shown = (element: Element): element is HTMLElement => element instanceof HTMLElement && element.matches(selector) && !element.hidden && element.checkVisibility();
  const enroll = (element: HTMLElement) => {
    if (detached || enrolled.has(element) || !shown(element)) return;
    try { enrolled.set(element, controller.enroll(element, { id: element.id || `ig-css-${++serial}`, origin: "center" })); }
    catch (error) { console.warn(`CSS level: ${element.id} was not enrolled: ${String(error)}`); }
  };
  const release = (element: HTMLElement) => { enrolled.get(element)?.(); enrolled.delete(element); };
  const sync = () => {
    for (const element of root.children) enroll(element as HTMLElement);
    for (const element of [...enrolled.keys()]) if (element.parentElement !== root || !shown(element)) release(element);
  };
  const presenter: StagePresenter = { present: element => { if (element.parentElement === root) enroll(element); }, withdraw: release };
  (root as HTMLElement & { [strataStage]?: StagePresenter })[strataStage] = presenter;
  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(root, { childList: true });
  sync();
  return () => {
    detached = true;
    observer.disconnect();
    delete (root as HTMLElement & { [strataStage]?: StagePresenter })[strataStage];
    for (const element of [...enrolled.keys()]) release(element);
  };
}
