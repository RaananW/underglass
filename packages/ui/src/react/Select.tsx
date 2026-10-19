/**
 * Select and Slider: native `<select>` and `<input type="range">` (anatomy pages `select.md`, `slider.md`), Field-aware.
 * The select's list is the browser's own; the slider's keys, pointer and touch input are native. A Slider can be drawn as a
 * knob or a fader (`form`), over the same native input.
 */
import { forwardRef, useEffect, useId, useState, type CSSProperties, type InputHTMLAttributes, type Ref, type SelectHTMLAttributes } from "react";
import { attachStrataFaders } from "../dom/fader.ts";
import { attachStrataKnobs } from "../dom/knob.ts";
import { sliderForm, sliderFormModel, sliderNumber, sliderOwner, type SliderFormOptions, type StrataSliderForm } from "../shared/slider-forms.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">, StrataProps {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, size, material, level, className, children, ...rest }, ref,
) {
  const field = useFieldControl();
  return (
    <select ref={ref} className={classes("ug-select", className)} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...rest}>
      {children}
    </select>
  );
});

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "form">, StrataProps, SliderFormOptions {
  /**
   * `knob` or `fader` draws the same native input as the Knob's or the Fader's object (the Fader's horizontal); `flush` and no form
   * are the groove slider, and `wheel` is reserved. Any other string is the native `form` attribute (the id of a form owner), as before.
   * With a form, `className` and `style` reach the drawn root and every other attribute the input.
   */
  form?: StrataSliderForm | "flush" | "wheel" | (string & {});
}

/** `--name: value;` declarations as a React style object. */
const styleOf = (declarations: string): CSSProperties =>
  Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { form, marks, detents, sweep, travel, unit, format, resetValue, size, material, level, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const formed = sliderForm(form);
  if (formed) return <SliderObject ref={ref} form={formed} {...{ marks, detents, sweep, travel, unit, format, resetValue, size, material, level, className, style }} {...rest} />;
  // A slider has no invalid or required state of its own; it takes the Field's id, description and disabled.
  const { id, "aria-describedby": describedBy, disabled } = field ?? {};
  const owner = sliderOwner(form);
  return (
    <input
      ref={ref}
      type="range"
      className={classes("ug-slider", className)}
      style={style}
      data-strata-face="groove"
      {...strataAttributes({ size, material, level })}
      {...(field ? { id, "aria-describedby": describedBy, disabled } : {})}
      {...(owner ? { form: owner } : {})}
      {...rest}
    />
  );
});

/** A Slider's native input drawn as the Knob's or the Fader's object: the same decorative markup and behaviour, without their printed legend. */
const SliderObject = forwardRef<HTMLInputElement, Omit<SliderProps, "form"> & { form: StrataSliderForm }>(function SliderObject(
  { form, marks, detents, sweep, travel, unit, format, resetValue, size, material, level, className, style, value, defaultValue, onChange, min, max, step, id, disabled, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const low = sliderNumber(min, 0);
  const [initial] = useState(() => sliderNumber(value ?? defaultValue, low));
  const [own, setOwn] = useState(initial);
  const current = value !== undefined ? sliderNumber(value, low) : own;
  const model = sliderFormModel(form, { value: current, min: low, max: sliderNumber(max, 100), step: step !== undefined ? sliderNumber(step, 1) : undefined, marks, detents, sweep, travel, unit, format });
  useEffect(() => { if (form === "knob") attachStrataKnobs(); else attachStrataFaders(); }, [form]);
  const knob = form === "knob", part = knob ? "knob" : "fader";
  const control = (
    <input
      ref={ref as Ref<HTMLInputElement>}
      className={`ug-${part}__input`}
      type="range"
      id={id ?? field?.id ?? `slider-${generated}`}
      min={model.min}
      max={model.max}
      step={model.step}
      value={String(current)}
      data-strata-default={String(resetValue ?? initial)}
      {...(unit !== undefined && !format ? { "data-strata-unit": unit } : {})}
      {...(model.valueText !== undefined ? { "aria-valuetext": model.valueText } : {})}
      {...(field?.["aria-describedby"] ? { "aria-describedby": field["aria-describedby"] } : {})}
      disabled={disabled ?? field?.disabled}
      {...rest}
      onChange={event => {
        if (value === undefined) setOwn(Number(event.target.value));
        onChange?.(event);
      }}
    />
  );
  const scale = model.marks.map(mark => <span key={mark.value} className={`ug-${part}__mark`} data-strata-value={String(mark.value)} style={styleOf(mark.style)}>{mark.text}</span>);
  return (
    <div className={classes(...model.rootClass, className)} data-strata-form={form} {...strataAttributes({ size, material, level })} style={{ ...styleOf(model.style), ...style }}>
      {knob ? (
        <div className="ug-knob__dial">
          <span className="ug-knob__scale" aria-hidden="true">{scale}</span>
          <span className="ug-knob__skirt" data-strata-face="raised" aria-hidden="true">
            <span className="ug-knob__cap" data-strata-face="raised"><span className="ug-knob__pointer" /></span>
          </span>
          {control}
        </div>
      ) : (
        <div className="ug-fader__track">
          <span className="ug-fader__scale" aria-hidden="true">{scale}</span>
          <span className="ug-fader__slot" data-strata-face="groove" aria-hidden="true" />
          <span className="ug-fader__carriage" data-strata-face="raised" aria-hidden="true"><span className="ug-fader__grip" /></span>
          {control}
        </div>
      )}
    </div>
  );
});
