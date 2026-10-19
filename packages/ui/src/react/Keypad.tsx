/**
 * Keypad and KeypadKey (anatomy page `keypad.md`): a native `<fieldset>` of `<button>`s, machined square caps with a printed legend
 * on one polished plinth. `label` is the fieldset's `<legend>` (or give `aria-label`); `columns` (3 by default) lays the keys out;
 * `shifted` prints each key's `shift` legend large and its first legend small, below it (the application decides when the keypad is
 * shifted). A `KeypadKey`'s children are its printed legend, `shift` an optional second, smaller legend; a key's name is its printed
 * legends (give `aria-label` to say otherwise), and `value` and `name` are the native button's. A `disabled` keypad disables every key.
 * The ref of a `Keypad` is the fieldset, of a `KeypadKey` the button. The keys are one tab stop and the arrow keys move between them
 * (the grid pattern, `attachStrataKeypads`).
 */
import { forwardRef, useEffect, type ButtonHTMLAttributes, type CSSProperties, type FieldsetHTMLAttributes, type ReactNode } from "react";
import { attachStrataKeypads } from "../dom/keypad.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface KeypadProps extends FieldsetHTMLAttributes<HTMLFieldSetElement>, StrataProps {
  /** The group's name, printed above the keys as the fieldset's legend. */
  label?: string;
  /** The columns (3 by default). */
  columns?: number;
  /** Print each key's `shift` legend large. */
  shifted?: boolean;
  /** The keys. */
  children?: ReactNode;
}

export const Keypad = forwardRef<HTMLFieldSetElement, KeypadProps>(function Keypad(
  { label, columns, shifted, size, material, level, className, style, children, ...rest }, ref,
) {
  useEffect(() => attachStrataKeypads(), []);
  const own = columns !== undefined && Number.isFinite(columns) && columns >= 1 ? { "--strata-keypad-columns": Math.floor(columns) } as CSSProperties : undefined;
  return (
    <fieldset ref={ref} className={classes("ug-keypad", className)} {...(shifted ? { "data-strata-shifted": "true" } : {})} {...strataAttributes({ size, material, level })} style={own || style ? { ...own, ...style } : undefined} {...rest}>
      {label !== undefined && <legend className="ug-keypad__legend">{label}</legend>}
      <div className="ug-keypad__plinth" data-strata-face="raised">{children}</div>
    </fieldset>
  );
});

export interface KeypadKeyProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "form">, StrataProps {
  /** The printed legend. */
  children?: ReactNode;
  /** A second, smaller legend printed under the first (large, when the keypad is `shifted`). */
  shift?: ReactNode;
  /** The id of the key's form owner (the native `form` attribute). */
  form?: string;
}

export const KeypadKey = forwardRef<HTMLButtonElement, KeypadKeyProps>(function KeypadKey(
  { shift, size, material, level, className, type = "button", children, ...rest }, ref,
) {
  useEffect(() => attachStrataKeypads(), []);
  return (
    <button ref={ref} type={type} className={classes("ug-keypad__key", className)} {...strataAttributes({ size, material, level })} {...rest}>
      <span className="ug-keypad__cap" data-strata-face="raised">
        <span className="ug-keypad__print">{children}</span>
        {shift !== undefined && <span className="ug-keypad__shift">{shift}</span>}
      </span>
    </button>
  );
});
