/**
 * ProgressBar, segment meter (anatomy page `progress-bar.md`, *Indicator form*): the behaviour that keeps the drawn bar in step
 * with the native `<progress>` it lies over, for plain HTML, Astro and the React and Vue bindings alike. A progress bar is
 * read-only: it takes no pointer and no keys, so this is all there is.
 * - The value reaches the drawing as one number, `--strata-progress-value` on the `.ug-progress-bar` root (0 to 1, the value over
 *   `max`), kept in step with the progress's `value` and `max`. A change of the attribute or the property (a script, a framework) is
 *   all it takes; it is observed, not polled. With no `value` the bar is indeterminate: the variable is removed and the bar chases.
 * Under the GPU the lenses are read frame by frame from the same variable, drawn as lenses with emitters, so a value change moves
 * only their lights. One observer and no listener on the native event path: nothing is blocked or changed.
 */
import { progressFraction } from "../shared/indicator-forms.ts";

const roots = ".ug-progress-bar";
const watched = ["value", "max"];

/** Brings one bar's drawn value up to date with its native `<progress>`; it does nothing for a progress with no segment meter round it. */
export function syncStrataProgress(native: HTMLProgressElement): void {
  const root = native.closest<HTMLElement>(roots);
  if (!root) return;
  const read = (name: string) => (native.hasAttribute(name) ? Number.parseFloat(native.getAttribute(name)!) : undefined);
  const fraction = progressFraction(read("value"), read("max"));
  if (fraction === undefined) { if (root.style.getPropertyValue("--strata-progress-value")) root.style.removeProperty("--strata-progress-value"); }
  else if (root.style.getPropertyValue("--strata-progress-value") !== String(fraction)) root.style.setProperty("--strata-progress-value", String(fraction));
}

const attached = new WeakSet<Document>();

/** Runs every segment-meter `.ug-progress-bar` in `doc`, present and future, through one observer, once per document. `attachStrata` calls it. */
export function attachStrataProgress(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  const all = (root: ParentNode) => root.querySelectorAll<HTMLProgressElement>(`${roots} > progress`);
  const syncAll = (root: ParentNode) => { for (const native of all(root)) syncStrataProgress(native); };
  syncAll(doc);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") {
        const target = record.target as Element;
        if (target instanceof HTMLProgressElement) syncStrataProgress(target);
      } else for (const node of record.addedNodes) if (node instanceof Element) { if (node instanceof HTMLProgressElement) syncStrataProgress(node); syncAll(node); }
    }
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: watched });
}
