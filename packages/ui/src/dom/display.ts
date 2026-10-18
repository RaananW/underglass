/**
 * Display (anatomy page `display.md`): the one thing the behaviour of a read-only Display does, `driveStrataDisplay`, for a value
 * that changes faster than it can be read (a frame rate, a clock, a level in numbers).
 *
 * The text under a display's glass is captured content, never drawn by the GPU, so a changed text is a DOM mutation and
 * a capture: that cannot be avoided, only bounded. `driveStrataDisplay` bounds it: it writes the latest text at most once an
 * `interval` (100 ms by default, so at most 10 captures a second), skips a text the display already shows, and writes the
 * first text at once. Nothing else is deferred or changed: the backlight, the bezel and the glass are uniforms and parts, so the
 * only captures a driven display costs are its own writes. A live region announcing each write is the display's own decision:
 * give a fast display `live="off"` and let a slower one announce, so a screen reader is not read the number every tenth of a second.
 */

/** A display being driven: the latest text, the time of the last write, and the pending write. */
interface Drive { text: string; last: number; timer: number; interval: number }
const drives = new WeakMap<HTMLElement, Drive>();

/** Whether `element` shows its text as a value (an input) or as its content (an output). */
const shownText = (element: HTMLElement) => (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : element.textContent ?? "");

/** Writes the driven text now, if it differs from what the display shows. */
function write(element: HTMLElement, drive: Drive): void {
  clearTimeout(drive.timer);
  drive.timer = 0;
  drive.last = performance.now();
  if (shownText(element) === drive.text) return;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.value = drive.text; else element.textContent = drive.text;
}

/**
 * Shows `text` in the display `element` (its native `<output>`, or a read-only `<input>`), at most once an `interval` ms
 * (100 by default; 0 writes every call). The latest text always wins: a burst of calls writes the first at once and the last when
 * the interval is up.
 */
export function driveStrataDisplay(element: HTMLElement, text: string, { interval = 100 }: { interval?: number } = {}): void {
  const drive = drives.get(element) ?? { text, last: Number.NEGATIVE_INFINITY, timer: 0, interval };
  drives.set(element, drive);
  drive.text = text; drive.interval = interval;
  const wait = drive.last + interval - performance.now();
  if (wait <= 0) { write(element, drive); return; }
  if (!drive.timer) drive.timer = window.setTimeout(() => write(element, drive), wait);
}

/** Ends a drive: the pending text is written now, and the display is as any other again. */
export function releaseStrataDisplay(element: HTMLElement): void {
  const drive = drives.get(element);
  if (!drive) return;
  write(element, drive);
  drives.delete(element);
}
