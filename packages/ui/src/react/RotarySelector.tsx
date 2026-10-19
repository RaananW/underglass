/**
 * RotarySelector (anatomy page `rotary-selector.md`): a native `<select>` over a printed dial, one hard detent per option, the
 * options' labels printed round the knob, and the selector's legend printed under it. The ref and `className`, `style` and
 * other attributes reach the `.ug-rotary` root; `selectRef` reaches the select. The round pointer behaviour (drag, ring
 * click-to-set, cap taps and the wheel) is `attachStrataRotarySelectors` from `@underglass/ui/dom`, attached once when a
 * selector mounts; keys, type-ahead and the native popup are the select's own. Controlled with `value` and `onValueChange`, or
 * uncontrolled with `defaultValue`. Field-aware: inside a Field it takes the Field's id, description, invalid and disabled
 * state.
 */
import { forwardRef, useEffect, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataRotarySelectors } from "../dom/rotary-selector.ts";
import { rotaryModel, type RotaryOption } from "../shared/rotary-selector.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface RotarySelectorProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "children" | "id">, StrataProps {
  /** The legend printed under the dial; it names the select. */
  label: ReactNode;
  /** The positions: one detent and one printed label each, in order round the dial. */
  options: readonly RotaryOption[];
  /** Controlled value (an option's `value`). */
  value?: string;
  /** Initial value when uncontrolled; the first enabled option by default. */
  defaultValue?: string;
  /** Called with the new value on every change (drag, click, tap, wheel, key, the native popup). */
  onValueChange?: (value: string) => void;
  /** The cap's turn from the first to the last position in degrees; the `knob.sweep` token (270) by default. */
  sweep?: number;
  /** The select's id; generated when absent. */
  id?: string;
  name?: string;
  form?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  /** A ref to the native select. */
  selectRef?: Ref<HTMLSelectElement>;
}

/** `--name: value;` declarations as a React style object. */
const styleOf = (declarations: string): CSSProperties =>
  Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;

export const RotarySelector = forwardRef<HTMLDivElement, RotarySelectorProps>(function RotarySelector(
  { label, options, value, defaultValue, onValueChange, sweep, id, name, form, required, invalid, disabled, selectRef, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const selectId = id ?? field?.id ?? `rotary-${generated}`;
  const [own, setOwn] = useState(() => defaultValue ?? value ?? options.find(option => !option.disabled)?.value);
  const current = value ?? own;
  const model = rotaryModel({ options, value: current, sweep });
  useEffect(() => attachStrataRotarySelectors(), []);
  return (
    <div ref={ref} className={classes("ug-rotary", className)} {...strataAttributes({ size, material, level })} style={{ ...styleOf(model.style), ...style }} {...rest}>
      <div className="ug-rotary__dial">
        <span className="ug-rotary__scale" aria-hidden="true">
          {model.marks.map(mark => (
            <span key={mark.value} className="ug-rotary__mark" data-strata-value={mark.value} data-strata-selected={String(mark.selected)} {...(mark.disabled ? { "data-strata-disabled": "true" } : {})} style={styleOf(mark.style)}>
              <span className="ug-rotary__tick" /><span className="ug-rotary__text">{mark.text}</span>
            </span>
          ))}
        </span>
        <span className="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true">
          <span className="ug-rotary__cap" data-strata-face="raised"><span className="ug-rotary__pointer" /></span>
        </span>
        <select
          ref={selectRef}
          className="ug-rotary__select"
          id={selectId}
          name={name}
          form={form}
          value={model.marks[model.index]?.value ?? ""}
          required={required ?? field?.required}
          {...(invalid || field?.["aria-invalid"] ? { "aria-invalid": true as const } : {})}
          {...(field?.["aria-describedby"] ? { "aria-describedby": field["aria-describedby"] } : {})}
          disabled={disabled ?? field?.disabled}
          onChange={event => {
            const next = event.target.value;
            if (value === undefined) setOwn(next);
            onValueChange?.(next);
          }}
        >
          {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
        </select>
      </div>
      <ol className="ug-rotary__legend" aria-hidden="true">
        {model.marks.map(mark => <li key={mark.value} data-strata-selected={String(mark.selected)}>{mark.text}</li>)}
      </ol>
      <label className="ug-rotary__label" htmlFor={selectId}>{label}</label>
    </div>
  );
});
