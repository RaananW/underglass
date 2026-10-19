/**
 * PatchPoint (anatomy page `patch-point.md`): a jack in a washer over a native `<input type="checkbox">` (connected when checked)
 * in its label row, or, with `button`, a `<button aria-pressed>` with its jack and label inside it, connected while pressed. A
 * connected jack shows a plug standing out of its hole with a short cable. The ref reaches the native control (the input, or the
 * button); `className` and `style` go on the row (on the button itself for a button PatchPoint), which carries the Strata
 * attributes. `led` adds a StatusLight lens that lights while the jack is connected. Inside a Field without a label, the control takes
 * its description, invalid, required and disabled state. A button PatchPoint's toggle and the opt-in feedback are
 * `attachStrataPatchPoints` from `@underglass/ui/dom`, attached once when a jack mounts. The label must not contain "connected":
 * screen readers announce the state.
 *
 * PatchBay is a `<fieldset>` of PatchPoints on one plinth, named by its `legend`; `columns` fixes its columns (as many as fit, by
 * default). Its `disabled` disables every jack in it.
 */
import { forwardRef, useEffect, type CSSProperties, type FieldsetHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataPatchPoints } from "../dom/patch-point.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { patchBayModel, patchLedMarkup, patchPointMarkup } from "../shared/patch-point.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface PatchPointProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "children" | "className" | "style" | "role">, StrataProps {
  /** The printed label, which names the jack. */
  children: ReactNode;
  /** A `<button aria-pressed>` instead of a checkbox: connected while pressed. */
  button?: boolean;
  /** For a button PatchPoint, whether it is connected (`aria-pressed`); not pressed by default. */
  connected?: boolean;
  /** An LED under the jack, lit while it is connected: `true` for the `success` colour, or a colour role. */
  led?: boolean | StrataLampColour;
  invalid?: boolean;
  /** Class names for the label row (the button, for a button PatchPoint). */
  className?: string;
  /** Styles for the label row (the button, for a button PatchPoint). */
  style?: CSSProperties;
}

export const PatchPoint = forwardRef<HTMLInputElement | HTMLButtonElement, PatchPointProps>(function PatchPoint(
  { button, connected, led, invalid, size, material, level, className, style, children, ...rest }, ref,
) {
  const field = useFieldControl();
  useEffect(() => attachStrataPatchPoints(), []);
  const colour = led === true ? "success" : led || undefined;
  const parts = (
    <>
      <span className="ug-patch-point__object" aria-hidden="true">
        {patchPointMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
      </span>
      {led && (
        <span className="ug-status-light ug-patch-point__led" aria-hidden="true" {...(colour ? { "data-strata-colour": colour } : {})}>
          <span className="ug-status-light__object" aria-hidden="true">
            {patchLedMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
          </span>
        </span>
      )}
      <span className="ug-patch-point__label">{children}</span>
    </>
  );
  const attributes = strataAttributes({ size, material, level });
  const rowClasses = classes("ug-patch-point", button && "ug-patch-point--button", className);
  if (button) {
    // A button has no checked state, change event or `required`: those are the checkbox's.
    const { checked: _checked, defaultChecked: _defaultChecked, onChange: _onChange, required: _required, ...pressed } = rest;
    const { required: _fieldRequired, ...fieldButton } = field ?? {};
    return (
      <button ref={ref as Ref<HTMLButtonElement>} className={rowClasses} style={style} type="button" aria-pressed={connected ? "true" : "false"} {...attributes} {...fieldButton} {...(invalid ? { "aria-invalid": true as const } : {})} {...(pressed as object)}>
        {parts}
      </button>
    );
  }
  return (
    <label className={rowClasses} style={style} {...attributes}>
      <input ref={ref as Ref<HTMLInputElement>} className="ug-patch-point__input" type="checkbox" {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...rest} />
      {parts}
    </label>
  );
});

export interface PatchBayProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "children" | "className" | "style">, StrataProps {
  /** The legend, which names the group. */
  legend: ReactNode;
  /** Fixed columns; as many as fit by default. */
  columns?: number;
  className?: string;
  style?: CSSProperties;
  /** The PatchPoints. */
  children: ReactNode;
}

/** A `--name: value;` declaration as a React style object. */
const styleOf = (declarations?: string): CSSProperties =>
  declarations ? (Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties) : {};

export const PatchBay = forwardRef<HTMLFieldSetElement, PatchBayProps>(function PatchBay({ legend, columns, size, material, level, className, style, children, ...rest }, ref) {
  const model = patchBayModel({ columns });
  return (
    <fieldset ref={ref} className={classes("ug-patch-bay", className)} data-strata-face="raised" {...strataAttributes({ size, material, level })} style={{ ...styleOf(model.style), ...style }} {...rest}>
      <legend className="ug-patch-bay__legend">{legend}</legend>
      <div className="ug-patch-bay__jacks">{children}</div>
    </fieldset>
  );
});
