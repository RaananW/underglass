/**
 * TextField: a native `<input>` well (anatomy page `text-field.md`). Inside a Field it takes the Field's id,
 * description, invalid, required and disabled state; its own props win. With an `icon`, the input sits in a wrapper
 * that carries the well and the focus edge, and the ref still reaches the `<input>`. With `form="display"` it is a glass
 * window in a bezel (section 11; `backlight` names the light behind the glass, `lit={false}` switches it off): the ref
 * and the native attributes reach the `<input>`, which covers the whole display, and `className` and `style` go on the
 * display's root. Any other `form` string is the native `form` attribute (the id of the input's form owner), as before.
 */
import { forwardRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import { useFieldControl } from "./Field.tsx";
import { displayAttributes, displayClasses, displayMarkup, isTextForm, type StrataDisplayBacklight, type StrataTextForm } from "../shared/display.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "form">, StrataProps {
  /** Marks the value invalid (`aria-invalid`); a Field with an error sets it too. */
  invalid?: boolean;
  /** A decorative icon at the start of the field. */
  icon?: ReactNode;
  /** `display`: a glass window in a bezel, backlit (anatomy page `text-field.md`, section 11). Any other string is the native `form` attribute. */
  form?: StrataTextForm | (string & {});
  /** A display's backlight: a colour role (`glowOn` by default) or `off`. */
  backlight?: StrataDisplayBacklight;
  /** A display's backlight is lit by default; `false` switches it off. */
  lit?: boolean;
}

/** The decorative object of a display: a bezel with the window in it, under the native element. */
export function DisplayObject() {
  return (
    <span className="ug-display__object" aria-hidden="true">
      <span className={displayMarkup.bezel.className} data-strata-face={displayMarkup.bezel.face}>
        <span className={displayMarkup.window.className} data-strata-face={displayMarkup.window.face} />
      </span>
    </span>
  );
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { invalid, icon, form, backlight, lit, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const strata = strataAttributes({ size, material, level });
  const display = isTextForm(form);
  const native = { ...field, ...(invalid ? { "aria-invalid": true as const } : {}), ...(form !== undefined && !display ? { form } : {}), ...(display ? {} : { style }), ...rest };
  if (display) {
    return (
      <span className={classes(...displayClasses(false), className)} style={style as CSSProperties | undefined} {...strata} {...displayAttributes({ backlight, lit })}>
        <DisplayObject />
        <input ref={ref} className="ug-display__text" {...native} />
      </span>
    );
  }
  if (icon === undefined) {
    return <input ref={ref} className={classes("ug-text-field", className)} data-strata-face="well" {...strata} {...native} />;
  }
  return (
    <span className="ug-text-field__wrap" data-strata-face="well" {...strata}>
      <span className="ug-text-field__icon" aria-hidden="true">{icon}</span>
      <input ref={ref} className={classes("ug-text-field__input", className)} {...native} />
    </span>
  );
});
