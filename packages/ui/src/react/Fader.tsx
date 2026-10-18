/**
 * Fader (anatomy page `fader.md`): a native `<input type="range">` over a slot in the faceplate, its thumb the drawn
 * carriage, with a printed scale beside the slot and its legend printed under it. The ref and `className`, `style` and
 * other attributes reach the `.ug-fader` root; `inputRef` reaches the input. Drag, track clicks and keys are native;
 * the carriage following the value, a tap snapping to a printed mark, the wheel and the double-click reset are
 * `attachStrataFaders` from `@underglass/ui/dom`, attached once when a fader mounts. Controlled with `value` and
 * `onValueChange`, or uncontrolled with `defaultValue`. Field-aware: inside a Field it takes the Field's id,
 * description and disabled state.
 */
import { forwardRef, useEffect, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataFaders } from "../dom/fader.ts";
import { faderModel, type FaderMark, type FaderOrientation } from "../shared/fader.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface FaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "children" | "id">, StrataProps {
  /** The legend printed under the track; it names the input. */
  label: ReactNode;
  /** Controlled value. */
  value?: number;
  /** Initial value when uncontrolled; `min` by default. */
  defaultValue?: number;
  /** Called with the new value on every change (drag, click, wheel, key, reset). */
  onValueChange?: (value: number) => void;
  /** 0 by default. */
  min?: number;
  /** 100 by default. */
  max?: number;
  /** 1 by default; a detented fader's step is its range over `detents − 1`. */
  step?: number;
  /** Makes the fader stepped: this many positions, each a detent the carriage settles on. */
  detents?: number;
  /** `vertical` (the default: the minimum at the bottom) or `horizontal` (the minimum at the left). */
  orientation?: FaderOrientation;
  /** The carriage centre's travel in CSS px; the size's `size.fader` (180 at medium) by default. */
  travel?: number;
  /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
  marks?: number | readonly (number | FaderMark)[];
  /** A unit for `aria-valuetext`, appended as written (" dB", "%"). */
  unit?: string;
  /** `aria-valuetext` for a value, instead of the number and `unit`. */
  format?: (value: number) => string;
  /** The value a double-click returns to; the initial value by default. */
  resetValue?: number;
  /** The input's id; generated when absent. */
  id?: string;
  name?: string;
  form?: string;
  disabled?: boolean;
  /** A ref to the native input. */
  inputRef?: Ref<HTMLInputElement>;
}

/** `--name: value;` declarations as a React style object. */
const styleOf = (declarations: string): CSSProperties =>
  Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;

export const Fader = forwardRef<HTMLDivElement, FaderProps>(function Fader(
  { label, value, defaultValue, onValueChange, min = 0, max = 100, step, detents, orientation, travel, marks, unit, format, resetValue, id, name, form, disabled,
    inputRef, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = id ?? field?.id ?? `fader-${generated}`;
  const [own, setOwn] = useState(() => defaultValue ?? value ?? min);
  const [initial] = useState(() => value ?? defaultValue ?? min);
  const current = value ?? own;
  const model = faderModel({ value: current, min, max, step, detents, travel, orientation, marks, unit, format });
  useEffect(() => attachStrataFaders(), []);
  return (
    <div ref={ref} className={classes("ug-fader", !model.vertical && "ug-fader--horizontal", model.detented && "ug-fader--detented", className)}
      {...strataAttributes({ size, material, level })} style={{ ...styleOf(model.style), ...style }} {...rest}>
      <div className="ug-fader__track">
        <span className="ug-fader__scale" aria-hidden="true">
          {model.marks.map(mark => <span key={mark.value} className="ug-fader__mark" data-strata-value={String(mark.value)} style={styleOf(mark.style)}>{mark.text}</span>)}
        </span>
        <span className="ug-fader__slot" data-strata-face="groove" aria-hidden="true" />
        <span className="ug-fader__carriage" data-strata-face="raised" aria-hidden="true"><span className="ug-fader__grip" /></span>
        <input
          ref={inputRef}
          className="ug-fader__input"
          type="range"
          id={inputId}
          name={name}
          form={form}
          min={model.min}
          max={model.max}
          step={model.step}
          value={String(current)}
          {...(model.vertical ? { "aria-orientation": "vertical" as const } : {})}
          data-strata-default={String(resetValue ?? initial)}
          {...(unit !== undefined && !format ? { "data-strata-unit": unit } : {})}
          {...(model.valueText !== undefined ? { "aria-valuetext": model.valueText } : {})}
          {...(field?.["aria-describedby"] ? { "aria-describedby": field["aria-describedby"] } : {})}
          disabled={disabled ?? field?.disabled}
          onChange={event => {
            const next = Number(event.target.value);
            if (value === undefined) setOwn(next);
            onValueChange?.(next);
          }}
        />
      </div>
      <label className="ug-fader__label" htmlFor={inputId}>{label}</label>
    </div>
  );
});
