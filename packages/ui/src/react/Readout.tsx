/**
 * Display (anatomy page `display.md`): a read-only glass window in a bezel over a native `<output>`, backlit. The
 * text is the `<output>`'s own, printed under the glass; `<output>` is a polite live region natively, so a changed value
 * is announced once (`live="off"` for a value that changes faster than it can be read, `"assertive"` for an urgent one).
 * It is never submitted with a form: a value that must submit is a TextField with `form="display"` and `readOnly`. The ref and
 * the native attributes (`id`, `name`, `htmlFor`, `aria-*`) reach the `<output>`; `className` and `style` go on the display's
 * root. A value that changes at frame rate goes through `driveStrataDisplay` from `@underglass/ui/dom`.
 */
import { forwardRef, type CSSProperties, type OutputHTMLAttributes, type ReactNode } from "react";
import { displayAttributes, displayClasses, type StrataDisplayBacklight, type StrataDisplayLive, type StrataDisplaySegments } from "../shared/display.ts";
import { useFieldControl } from "./Field.tsx";
import { DisplayObject } from "./TextField.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface DisplayProps extends Omit<OutputHTMLAttributes<HTMLOutputElement>, "children" | "className" | "style">, StrataProps {
  /** The value, as text. */
  children?: ReactNode;
  /** The accessible name (`aria-label`); leave it out when `aria-labelledby` or a `<label for>` names the display. */
  label?: string;
  /** How a changed value is announced: `off`, `polite` (the native default, no attribute) or `assertive`. */
  live?: StrataDisplayLive;
  /** The backlight: a colour role (`glowOn` by default) or `off`. */
  backlight?: StrataDisplayBacklight;
  /** The backlight is lit by default; `false` switches it off. */
  lit?: boolean;
  /** The segments look (anatomy page `display.md`, section 11): the text in a seven-segment face with the unlit segments faintly printed behind it. */
  segments?: StrataDisplaySegments;
  /** Class names for the display's root. */
  className?: string;
  /** Styles for the display's root. */
  style?: CSSProperties;
}

export const Display = forwardRef<HTMLOutputElement, DisplayProps>(function Display(
  { children, label, live, backlight, lit, segments, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  return (
    <span className={classes(...displayClasses(true), className)} style={style} {...strataAttributes({ size, material, level })} {...displayAttributes({ backlight, lit, segments })}>
      <DisplayObject />
      <output ref={ref} className="ug-display__text" {...(field?.id ? { id: field.id } : {})} {...(field?.["aria-describedby"] ? { "aria-describedby": field["aria-describedby"] } : {})}
        {...(label !== undefined ? { "aria-label": label } : {})} {...(live === "off" || live === "assertive" ? { "aria-live": live } : {})} {...rest}>{children}</output>
    </span>
  );
});
