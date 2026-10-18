/**
 * Knob (anatomy page `knob.md`): a native `<input type="range">` over a printed dial, with its legend printed under it.
 * The ref and `className`, `style` and other attributes reach the `.ug-knob` root; `inputRef` reaches the input. The
 * round pointer behaviour (drag, ring click-to-set, cap taps, the wheel and the double-click reset) is
 * `attachStrataKnobs` from `@underglass/ui/dom`, attached once when a knob mounts; keys are native. Controlled with
 * `value` and `onValueChange`, or uncontrolled with `defaultValue`. Field-aware: inside a Field it takes the Field's id,
 * description and disabled state.
 */
import { forwardRef, useEffect, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataKnobs } from "../dom/knob.ts";
import { knobModel, type KnobMark } from "../shared/knob.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface KnobProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "children" | "id">, StrataProps {
  /** The legend printed under the dial; it names the input. */
  label: ReactNode;
  /** Controlled value. */
  value?: number;
  /** Initial value when uncontrolled; `min` by default. */
  defaultValue?: number;
  /** Called with the new value on every change (drag, click, tap, wheel, key, reset). */
  onValueChange?: (value: number) => void;
  /** 0 by default. */
  min?: number;
  /** 100 by default. */
  max?: number;
  /** 1 by default; a detented knob's step is its range over `detents − 1`. */
  step?: number;
  /** Makes the knob stepped: this many positions, each a detent the cap settles on. */
  detents?: number;
  /** The cap's turn from minimum to maximum in degrees; the `knob.sweep` token (270) by default. */
  sweep?: number;
  /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
  marks?: number | readonly (number | KnobMark)[];
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

export const Knob = forwardRef<HTMLDivElement, KnobProps>(function Knob(
  { label, value, defaultValue, onValueChange, min = 0, max = 100, step, detents, sweep, marks, unit, format, resetValue, id, name, form, disabled,
    inputRef, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = id ?? field?.id ?? `knob-${generated}`;
  const [own, setOwn] = useState(() => defaultValue ?? value ?? min);
  const [initial] = useState(() => value ?? defaultValue ?? min);
  const current = value ?? own;
  const model = knobModel({ value: current, min, max, step, detents, sweep, marks, unit, format });
  useEffect(() => attachStrataKnobs(), []);
  return (
    <div ref={ref} className={classes("ug-knob", model.detented && "ug-knob--detented", className)} {...strataAttributes({ size, material, level })}
      style={{ ...styleOf(model.style), ...style }} {...rest}>
      <div className="ug-knob__dial">
        <span className="ug-knob__scale" aria-hidden="true">
          {model.marks.map(mark => <span key={mark.value} className="ug-knob__mark" data-strata-value={String(mark.value)} style={styleOf(mark.style)}>{mark.text}</span>)}
        </span>
        <span className="ug-knob__skirt" data-strata-face="raised" aria-hidden="true">
          <span className="ug-knob__cap" data-strata-face="raised"><span className="ug-knob__pointer" /></span>
        </span>
        <input
          ref={inputRef}
          className="ug-knob__input"
          type="range"
          id={inputId}
          name={name}
          form={form}
          min={model.min}
          max={model.max}
          step={model.step}
          value={String(current)}
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
      <label className="ug-knob__label" htmlFor={inputId}>{label}</label>
    </div>
  );
});
