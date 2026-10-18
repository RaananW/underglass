/**
 * Lamp (anatomy page `lamp.md`): a lens on a bezel over a native `<input type="checkbox" role="switch">` in its label
 * row, or, when `momentary`, a `<button aria-pressed>` with its lens and label inside it, lit while it is held. The ref
 * reaches the native control (the input, or the button); `className` and `style` go on the row (on the button itself for a
 * momentary lamp), which carries the Strata attributes. Inside a Field without a label, the control takes its description,
 * invalid, required and disabled state. A momentary lamp's press and the opt-in feedback are `attachStrataLamps` from
 * `@underglass/ui/dom`, attached once when a lamp mounts. The label must not contain "on" or "off": screen readers
 * announce the state.
 */
import { forwardRef, useEffect, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataLamps } from "../dom/lamp.ts";
import { lampMarkup, type StrataLampColour } from "../shared/lamp.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface LampProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "children" | "className" | "style" | "role">, StrataProps {
  /** The visible label, which names the lamp. */
  children: ReactNode;
  /** The lens colour: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
  /** A momentary lamp: a button that is lit while it is pressed (`aria-pressed`), not a switch. */
  momentary?: boolean;
  /** The label before the lamp; the DOM order stays, so focus and reading order do not change. */
  reverse?: boolean;
  invalid?: boolean;
  /** Class names for the label row (the button, for a momentary lamp). */
  className?: string;
  /** Styles for the label row (the button, for a momentary lamp). */
  style?: CSSProperties;
}

export const Lamp = forwardRef<HTMLInputElement | HTMLButtonElement, LampProps>(function Lamp(
  { colour, momentary, reverse, invalid, size, material, level, className, style, children, ...rest }, ref,
) {
  const field = useFieldControl();
  useEffect(() => attachStrataLamps(), []);
  const parts = (
    <>
      <span className="ug-lamp__object" aria-hidden="true">
        {lampMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
      </span>
      <span className="ug-lamp__label">{children}</span>
    </>
  );
  const attributes = { ...strataAttributes({ size, material, level }), ...(colour ? { "data-strata-colour": colour } : {}) };
  const rowClasses = classes("ug-lamp", momentary && "ug-lamp--momentary", reverse && "ug-lamp--reverse", className);
  if (momentary) {
    // A button has no checked state, change event or `required`: those are the toggle's.
    const { checked: _checked, defaultChecked: _defaultChecked, onChange: _onChange, required: _required, ...pressed } = rest;
    const { required: _fieldRequired, ...fieldButton } = field ?? {};
    return (
      <button ref={ref as Ref<HTMLButtonElement>} className={rowClasses} style={style} type="button" aria-pressed="false" {...attributes} {...fieldButton} {...(invalid ? { "aria-invalid": true as const } : {})} {...(pressed as object)}>
        {parts}
      </button>
    );
  }
  return (
    <label className={rowClasses} style={style} {...attributes}>
      <input ref={ref as Ref<HTMLInputElement>} className="ug-lamp__input" type="checkbox" role="switch" {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...rest} />
      {parts}
    </label>
  );
});
