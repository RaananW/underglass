/**
 * The plain contract markup of a JogWheel (anatomy page `jog-wheel.md`), as an HTML author writes it by hand: the page of
 * `ui-jog-wheel.html` uses it, so the tests run on what a plain page contains. It restates the numbers of the markup (it imports
 * nothing from `@underglass/ui`): a step is `360 / turn` degrees, and the angle starts at the value's step.
 */
export interface JogSpec {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Steps in one turn (24 by default). */
  turn?: number;
  detents?: boolean;
  wrap?: boolean;
  vertical?: boolean;
  unit?: string;
  size?: "small" | "medium" | "large";
}

const minus = (value: number) => (value < 0 ? `−${-value}` : String(value));

export function jogMarkup(spec: JogSpec): string {
  const { id, label, value, min, max, unit, size, detents, vertical } = spec, step = spec.step ?? 1, turn = spec.turn ?? 24, wrap = spec.wrap ?? true;
  const angle = Math.round(((value - min) / step) * (360 / turn) * 100) / 100;
  const text = `${minus(value)}${unit ?? ""}`;
  return `<div class="ug-jog-wheel${detents ? " ug-jog-wheel--detented" : ""}" id="${id}-jog"${size ? ` data-strata-size="${size}"` : ""}${vertical ? ` data-strata-drag="vertical"` : ""} style="--strata-jog-angle: ${angle}; --strata-jog-turn: ${turn};">
    <div class="ug-jog-wheel__dial">
      <span class="ug-jog-wheel__well" data-strata-face="well" aria-hidden="true"></span>
      <span class="ug-jog-wheel__wheel" data-strata-face="raised" aria-hidden="true"><span class="ug-jog-wheel__turn"><span class="ug-jog-wheel__dimple" data-strata-face="well"></span></span></span>
      <input class="ug-jog-wheel__input" type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-strata-default="${value}"${wrap ? ` data-strata-wrap="true"` : ""}${unit !== undefined ? ` data-strata-unit="${unit}" aria-valuetext="${text}"` : ""}>
    </div>
    <label class="ug-jog-wheel__label" for="${id}">${label}</label>
  </div>`;
}
