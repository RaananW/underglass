/**
 * JogWheel (anatomy page `jog-wheel.md`): a native `<input type="range">` over a large flat wheel with a finger dimple, with its
 * legend printed under it. An endless encoder: the value steps and, with `wrap` (the default), goes round at the ends, while the
 * dimple turns on an accumulated angle that is not the value. The ref and `className`, `style` and other attributes reach the
 * `.ug-jog-wheel` root; `inputRef` reaches the input. The round behaviour (circular drag, the vertical drag, tap steps, the wheel,
 * inertia, the wrapping keys and the double-click reset) is `attachStrataJogWheels` from `@underglass/ui/dom`, attached once when
 * a wheel mounts; keys are native. Controlled with `value` and `onValueChange`, or uncontrolled with `defaultValue`. Field-aware:
 * inside a Field it takes the Field's id, description and disabled state.
 */
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataJogWheels, syncStrataJogWheel } from "../dom/jog-wheel.ts";
import { jogDefaults, jogInitialAngle, jogStyle, jogWheelModel } from "../shared/jog-wheel.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, mergeRefs, strataAttributes, type StrataProps } from "./shared.ts";

export interface JogWheelProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "children" | "id">, StrataProps {
  /** The legend printed under the wheel; it names the input. */
  label: ReactNode;
  /** Controlled value. */
  value?: number;
  /** Initial value when uncontrolled; `min` by default. */
  defaultValue?: number;
  /** Called with the new value on every change (drag, coasting, tap, wheel, key, reset): one native step at a time. */
  onValueChange?: (value: number) => void;
  /** 0 by default. */
  min?: number;
  /** 99 by default. */
  max?: number;
  /** 1 by default. */
  step?: number;
  /** Steps in one turn of the wheel; the `jog.turn` token (24) by default. */
  turn?: number;
  /** Soft detents: the dimple settles on each step, which ticks where feedback is on. */
  detents?: boolean;
  /** The value goes round at the ends (the default); `false` stops it at them. */
  wrap?: boolean;
  /** `circular` (the default: the pointer's angle about the wheel's centre) or `vertical` (a turn per `jog.dragPx`). */
  drag?: "circular" | "vertical";
  /** A unit for `aria-valuetext`, appended as written (" fr", "%"). */
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

export const JogWheel = forwardRef<HTMLDivElement, JogWheelProps>(function JogWheel(
  { label, value, defaultValue, onValueChange, min = 0, max = 99, step = 1, turn = jogDefaults.turn, detents = false, wrap = true, drag = "circular", unit, format, resetValue, id, name, form, disabled,
    inputRef, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = id ?? field?.id ?? `jog-${generated}`;
  const [own, setOwn] = useState(() => defaultValue ?? value ?? min);
  const [initial] = useState(() => value ?? defaultValue ?? min);
  const current = value ?? own;
  const model = jogWheelModel({ value: current, min, max, step, turn, detents, wrap, drag, unit, format });
  // The wheel's angle starts at the initial value's step and is kept from there by the behaviour: it is not a function of the value, so
  // the style does not follow it (React leaves a style it did not change alone).
  const start = jogStyle(jogInitialAngle(initial, { min, max, step }, turn), turn);
  const own_ = useRef<HTMLInputElement>(null);
  useEffect(() => attachStrataJogWheels(), []);
  // A value the parent sets (a controlled change, a reset) moves the wheel by the shorter way round.
  useLayoutEffect(() => { if (own_.current) syncStrataJogWheel(own_.current); }, [current]);
  return (
    <div ref={ref} className={classes("ug-jog-wheel", model.detented && "ug-jog-wheel--detented", className)} {...strataAttributes({ size, material, level })}
      {...(model.vertical ? { "data-strata-drag": "vertical" } : {})} style={{ ...styleOf(start), ...style }} {...rest}>
      <div className="ug-jog-wheel__dial">
        <span className="ug-jog-wheel__well" data-strata-face="well" aria-hidden="true" />
        <span className="ug-jog-wheel__wheel" data-strata-face="raised" aria-hidden="true">
          <span className="ug-jog-wheel__turn"><span className="ug-jog-wheel__dimple" data-strata-face="well" /></span>
        </span>
        <input
          ref={mergeRefs(own_, inputRef)}
          className="ug-jog-wheel__input"
          type="range"
          id={inputId}
          name={name}
          form={form}
          min={model.min}
          max={model.max}
          step={model.step}
          value={String(current)}
          data-strata-default={String(resetValue ?? initial)}
          {...(model.wrap ? { "data-strata-wrap": "true" } : {})}
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
      <label className="ug-jog-wheel__label" htmlFor={inputId}>{label}</label>
    </div>
  );
});
