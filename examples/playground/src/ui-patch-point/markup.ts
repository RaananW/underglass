/**
 * The plain contract markup of a PatchPoint and a PatchBay (anatomy page `patch-point.md`), as an HTML author writes it by hand: the
 * page of `ui-patch-point.html` uses it, so the tests run on what a plain page contains. It imports nothing from `@underglass/ui`.
 */
export interface PatchSpec {
  id: string;
  label: string;
  /** Connected (a checkbox's `checked`, a button's `aria-pressed`). */
  connected?: boolean;
  /** A `<button aria-pressed>` instead of a checkbox. */
  button?: boolean;
  /** An LED under the jack: its colour role (`success` by default). */
  led?: boolean | string;
  disabled?: boolean;
  size?: "small" | "medium" | "large";
}

const parts = `<span class="ug-patch-point__object" aria-hidden="true"><span class="ug-patch-point__washer" data-strata-face="raised"></span><span class="ug-patch-point__jack" data-strata-face="well"></span><span class="ug-patch-point__stub"></span><span class="ug-patch-point__plug" data-strata-face="knob"></span></span>`;

export function patchMarkup(spec: PatchSpec): string {
  const { id, label, connected, button, led, disabled, size } = spec;
  const colour = led === true ? "success" : led || undefined;
  const lamp = led ? `<span class="ug-status-light ug-patch-point__led" aria-hidden="true"${colour ? ` data-strata-colour="${colour}"` : ""}><span class="ug-status-light__object" aria-hidden="true"><span class="ug-status-light__socket"></span><span class="ug-status-light__lens" data-strata-face="knob"></span></span></span>` : "";
  const sizing = size ? ` data-strata-size="${size}"` : "";
  if (button) {
    return `<button class="ug-patch-point ug-patch-point--button" type="button" id="${id}" name="${id}" aria-pressed="${connected ? "true" : "false"}"${sizing}${disabled ? " disabled" : ""}>${parts}${lamp}<span class="ug-patch-point__label">${label}</span></button>`;
  }
  return `<label class="ug-patch-point"${sizing}><input class="ug-patch-point__input" type="checkbox" id="${id}" name="${id}"${connected ? " checked" : ""}${disabled ? " disabled" : ""}>${parts}${lamp}<span class="ug-patch-point__label">${label}</span></label>`;
}

export function bayMarkup(id: string, legend: string, jacks: PatchSpec[], options: { columns?: number; disabled?: boolean } = {}): string {
  const style = options.columns ? ` style="--strata-patch-columns: ${options.columns};"` : "";
  return `<fieldset class="ug-patch-bay" id="${id}" data-strata-face="raised"${style}${options.disabled ? " disabled" : ""}><legend class="ug-patch-bay__legend">${legend}</legend><div class="ug-patch-bay__jacks">${jacks.map(patchMarkup).join("")}</div></fieldset>`;
}
