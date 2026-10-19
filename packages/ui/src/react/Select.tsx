/**
 * Select and Slider: native `<select>` and `<input type="range">` (anatomy pages `select.md`, `slider.md`), Field-aware.
 * The select's list is the browser's own; the slider's keys, pointer and touch input are native. A Slider can be drawn as a
 * knob or a fader (`form`), over the same native input; a Select as a rotary selector or as a display with step buttons, over the
 * same native select.
 */
import { Children, Fragment, forwardRef, isValidElement, useEffect, useId, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes } from "react";
import { attachStrataFaders } from "../dom/fader.ts";
import { attachStrataKnobs } from "../dom/knob.ts";
import { attachStrataRotarySelectors } from "../dom/rotary-selector.ts";
import { attachStrataSelectDisplays } from "../dom/select-display.ts";
import { displayAttributes, displayClasses } from "../shared/display.ts";
import { pushMarkup } from "../shared/push-button.ts";
import { optionLabel, selectDisplayClass, selectForm, selectFormFor, selectOwner, selectorModel, selectSteps, type SelectOption, type StrataSelectForm } from "../shared/select-forms.ts";
import { sliderForm, sliderFormModel, sliderNumber, sliderOwner, type SliderFormOptions, type StrataSliderForm } from "../shared/slider-forms.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";
import { DisplayObject } from "./TextField.tsx";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "form">, StrataProps {
  invalid?: boolean;
  /**
   * `selector` draws the same native select as a RotarySelector's dial (up to eight short options, no optgroup; otherwise it is drawn as
   * `display`); `display` as a Display window with two step buttons. `flush` and no form are the key with a chevron, and a list box
   * (`multiple`) is always that. Any other string is the native `form` attribute (the id of a form owner), as before. With a form,
   * `className` and `style` reach the drawn root and every other attribute the select.
   */
  form?: StrataSelectForm | "flush" | (string & {});
  /** A selector's turn from the first to the last option in degrees; the `knob.sweep` token (270) by default. */
  sweep?: number;
}

/** The text of an `<option>`'s children, or undefined where it is not plain text. */
function textOf(node: ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) { const parts = node.map(textOf); return parts.some(part => part === undefined) ? undefined : parts.join(""); }
  return undefined;
}

/** The `<option>`s a Select's children hold (through fragments and optgroups), and whether any sits in an optgroup; no options when one cannot be read. */
function readOptions(children: ReactNode): { options?: SelectOption[]; grouped: boolean } {
  const options: SelectOption[] = [];
  let grouped = false, readable = true;
  const walk = (nodes: ReactNode) => {
    for (const child of Children.toArray(nodes)) {
      if (typeof child === "string" || typeof child === "number") { if (String(child).trim()) readable = false; continue; }
      if (!isValidElement(child)) { readable = false; continue; }
      const props = child.props as { value?: unknown; disabled?: boolean; children?: ReactNode };
      if (child.type === Fragment) walk(props.children);
      else if (child.type === "optgroup") { grouped = true; walk(props.children); }
      else if (child.type === "option") {
        const text = textOf(props.children);
        if (text === undefined) { readable = false; continue; }
        const label = optionLabel(text);
        options.push({ value: props.value !== undefined && props.value !== null ? String(props.value) : label, label, ...(props.disabled ? { disabled: true } : {}) });
      } else readable = false;
    }
  };
  walk(children);
  return { ...(readable ? { options } : {}), grouped };
}

/** `--name: value;` declarations as a React style object. */
const styleOf = (declarations: string): CSSProperties =>
  Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(props, ref) {
  const { form, children, multiple } = props;
  const asked = selectForm(form);
  const shape = asked ? readOptions(children) : { grouped: false };
  const drawn = selectFormFor(asked, { ...shape, list: multiple });
  if (drawn === "selector") return <SelectorSelect ref={ref} options={shape.options!} {...props} />;
  if (drawn === "display") return <DisplaySelect ref={ref} {...props} />;
  return <FlushSelect ref={ref} {...props} />;
});

/** Today's Select: the key with a chevron. */
const FlushSelect = forwardRef<HTMLSelectElement, SelectProps>(function FlushSelect(
  { invalid, form, sweep: _sweep, size, material, level, className, children, ...rest }, ref,
) {
  const field = useFieldControl();
  const owner = selectOwner(form);
  return (
    <select ref={ref} className={classes("ug-select", className)} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...(owner ? { form: owner } : {})} {...rest}>
      {children}
    </select>
  );
});

/** A Select drawn as a RotarySelector's dial over its own select: the same markup and behaviour, without the legend title (the Field's label names it). */
const SelectorSelect = forwardRef<HTMLSelectElement, SelectProps & { options: SelectOption[] }>(function SelectorSelect(
  { options, invalid, form: _form, sweep, size, material, level, className, style, children, value, defaultValue, onChange, id, disabled, required, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [own, setOwn] = useState(() => String(defaultValue ?? value ?? options.find(option => !option.disabled)?.value ?? ""));
  const current = value !== undefined ? String(value) : own;
  const model = selectorModel(options, current, sweep);
  useEffect(() => attachStrataRotarySelectors(), []);
  const selectId = id ?? field?.id ?? `select-${generated}`;
  return (
    <div className={classes("ug-rotary", className)} data-strata-form="selector" {...strataAttributes({ size, material, level })} style={{ ...styleOf(model.style), ...style }}>
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
          ref={ref}
          className="ug-rotary__select"
          id={selectId}
          value={model.marks[model.index]?.value ?? ""}
          required={required ?? field?.required}
          {...(invalid || field?.["aria-invalid"] ? { "aria-invalid": true as const } : {})}
          {...(field?.["aria-describedby"] ? { "aria-describedby": field["aria-describedby"] } : {})}
          disabled={disabled ?? field?.disabled}
          {...rest}
          onChange={event => {
            if (value === undefined) setOwn(event.target.value);
            onChange?.(event);
          }}
        >
          {children}
        </select>
      </div>
      <ol className="ug-rotary__legend" aria-hidden="true">
        {model.marks.map(mark => <li key={mark.value} data-strata-selected={String(mark.selected)}>{mark.text}</li>)}
      </ol>
    </div>
  );
});

/** A Select drawn as a Display over its own select, between two momentary push buttons that step it. */
const DisplaySelect = forwardRef<HTMLSelectElement, SelectProps>(function DisplaySelect(
  { invalid, form: _form, sweep: _sweep, size, material, level, className, style, children, disabled, ...rest }, ref,
) {
  const field = useFieldControl();
  useEffect(() => attachStrataSelectDisplays(), []);
  const off = disabled ?? field?.disabled;
  return (
    <span className={classes(selectDisplayClass, className)} data-strata-form="display" {...strataAttributes({ size, material, level })} style={style}>
      <StepButton step={-1} disabled={off} />
      <span className={classes(...displayClasses(false), "ug-select-display__window")} {...displayAttributes({})}>
        <DisplayObject />
        <select ref={ref} className="ug-display__text ug-select-display__select" {...field} {...(invalid ? { "aria-invalid": true as const } : {})} disabled={off} {...rest}>{children}</select>
      </span>
      <StepButton step={1} disabled={off} />
    </span>
  );
});

/** A step button of a Select's display: a momentary push button, out of the tab order and hidden from assistive technology (the select is the control). */
function StepButton({ step, disabled }: { step: -1 | 1; disabled?: boolean }) {
  const { className } = selectSteps[step < 0 ? 0 : 1];
  return (
    <button type="button" className={classes("ug-button", "ug-push", className)} tabIndex={-1} aria-hidden="true" data-strata-form="momentary" data-strata-step={String(step)} disabled={disabled}>
      <span className="ug-push__object" aria-hidden="true">
        {pushMarkup("momentary").map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
      </span>
      <span className="ug-push__cap" data-strata-face="raised"><span className="ug-select-display__glyph" /></span>
    </button>
  );
}

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "form">, StrataProps, SliderFormOptions {
  /**
   * `knob` or `fader` draws the same native input as the Knob's or the Fader's object (the Fader's horizontal); `flush` and no form
   * are the groove slider, and `wheel` is reserved. Any other string is the native `form` attribute (the id of a form owner), as before.
   * With a form, `className` and `style` reach the drawn root and every other attribute the input.
   */
  form?: StrataSliderForm | "flush" | "wheel" | (string & {});
}

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
