/**
 * The Slider's hardware forms (anatomy page `slider.md`, *Hardware forms*; design language sections 6 and 14): a Slider as a
 * knob (`form="knob"`), as a fader (`form="fader"`) or as a thumbwheel (`form="wheel"`). The names, the markup data every binding
 * renders for them and the reserved `flush`. Shared by the React, Vue and Astro bindings, so all of them agree.
 *
 * The Slider's own `<input type="range">` stays the control (its `name`, `form` owner, `min`, `max`, `step`, `value`, `id`, Field
 * wiring and every native key and event), drawn as the Knob's object or the Fader's carriage: the form renders the same
 * decorative markup as `Knob` and `Fader` (classes `ug-knob__*` and `ug-fader__*`, horizontal for the fader), without their
 * printed legend, since a Slider is named by its Field or its `aria-label`. So the behaviour (`attachStrataKnobs`,
 * `attachStrataFaders`), the CSS and the GPU helper at every level are the Knob's and the Fader's, unchanged. The wheel is the Fader's
 * track and behaviour (`ug-fader ug-fader--horizontal ug-fader--wheel`: the drag along the slot, click-to-set, the wheel, the keys) with a
 * ridged roller (`ug-fader__carriage ug-fader__wheel`) that rolls in place under the value instead of a carriage that slides.
 */
import { knobModel, type KnobMark, type KnobModel } from "./knob.ts";
import { faderModel, type FaderMark, type FaderModel } from "./fader.ts";

/** The name that keeps today's look: reserved, never the native `form` attribute. */
export const SLIDER_FLUSH = "flush";
/** The Slider's forms that are drawn: a knob, a fader (horizontal) and a thumbwheel (horizontal). */
export type StrataSliderForm = "knob" | "fader" | "wheel";
/** The names a Slider's `form` reserves. */
const reserved: readonly string[] = [SLIDER_FLUSH, "knob", "fader", "wheel"];

/** The form a Slider takes from its `form` prop: `knob`, `fader` or `wheel`, or none (`flush` and any other string are not drawn forms). */
export const sliderForm = (form: unknown): StrataSliderForm | undefined => (form === "knob" || form === "fader" || form === "wheel" ? form : undefined);
/**
 * The value to leave as the native `form` attribute (the id of a form owner) once the form names are taken out: the reserved names
 * are not form owners; any other string is, as before.
 */
export const sliderOwner = (form: unknown): string | undefined => (typeof form === "string" && !reserved.includes(form) ? form : undefined);

/** What a Slider's form takes besides the input's own attributes. */
export interface SliderFormOptions {
  /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). 5 by default, as the Knob's and the Fader's; 3 for a wheel (its slot is short). */
  marks?: number | readonly (number | KnobMark | FaderMark)[];
  /** Makes the control stepped: this many positions, each a detent. */
  detents?: number;
  /** A knob's turn from minimum to maximum in degrees (the `knob.sweep` token, 270); a wheel's roll over the range (`wheel.sweep`, 150, at most 180). */
  sweep?: number;
  /** A fader's carriage travel in CSS px (`size.fader` by default); a wheel's drag travel (0.4 of that by default). */
  travel?: number;
  /** A unit for `aria-valuetext`, appended as written (" dB", "%"). */
  unit?: string;
  /** `aria-valuetext` for a value, instead of the number and `unit`. */
  format?: (value: number) => string;
  /** The value a double-click returns to; the initial value by default. */
  resetValue?: number;
}

/** Everything a binding needs to render a Slider's form, from its props. */
export interface SliderFormModel {
  form: StrataSliderForm;
  min: number;
  max: number;
  step: number;
  detented: boolean;
  /** The root's classes (`ug-knob`, or `ug-fader ug-fader--horizontal` with `ug-fader--wheel` for a wheel, and the detented modifier). */
  rootClass: string[];
  /** The root's `style` attribute. */
  style: string;
  /** The printed marks, each with its `style` and the text it prints. */
  marks: { value: number; text: string; style: string }[];
  /** The input's `aria-valuetext`, when a unit or a format gives one. */
  valueText?: string;
}

/** The markup data for a Slider's form (a knob: `knobModel`; a fader or a wheel: `faderModel`, horizontal): 0–100 in steps of 1, unless given. */
export function sliderFormModel(form: StrataSliderForm, input: { value: number; min?: number; max?: number; step?: number } & SliderFormOptions): SliderFormModel {
  const { value, min, max, step, detents, sweep, travel, marks, unit, format } = input;
  if (form === "knob") {
    const model: KnobModel = knobModel({ value, min, max, step, detents, sweep, marks: marks as never, unit, format });
    return { form, min: model.min, max: model.max, step: model.step, detented: model.detented, rootClass: ["ug-knob", model.detented && "ug-knob--detented"].filter(Boolean) as string[], style: model.style, marks: model.marks, ...(model.valueText !== undefined ? { valueText: model.valueText } : {}) };
  }
  const wheel = form === "wheel";
  const model: FaderModel = faderModel({ value, min, max, step, detents, travel: wheel ? undefined : travel, orientation: "horizontal", marks: (wheel && marks === undefined ? 3 : marks) as never, unit, format });
  // A wheel's own sizes are its tokens' (`--strata-wheel-travel`, `--strata-wheel-sweep`): given, they are written on the root.
  const own = wheel ? `${travel !== undefined ? ` --strata-wheel-travel: ${travel}px;` : ""}${sweep !== undefined ? ` --strata-wheel-sweep: ${sweep};` : ""}` : "";
  return { form, min: model.min, max: model.max, step: model.step, detented: model.detented, rootClass: ["ug-fader", "ug-fader--horizontal", wheel && "ug-fader--wheel", model.detented && "ug-fader--detented"].filter(Boolean) as string[], style: `${model.style}${own}`, marks: model.marks, ...(model.valueText !== undefined ? { valueText: model.valueText } : {}) };
}

/** A number prop that may arrive as a string (the native `min`, `max`, `step` and `value` attributes): a finite number, or the fallback. */
export function sliderNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}
