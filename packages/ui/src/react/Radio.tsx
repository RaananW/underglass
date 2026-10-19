/**
 * RadioGroup and Radio (anatomy page `radio.md`): native radios in a `<fieldset>` named by its `<legend>`. The group
 * owns `name`, `value` and `onChange`; arrow keys, Tab and Space stay native. An error marks every radio invalid and
 * joins the help in the fieldset's description; `disabled` on the fieldset disables every radio natively. `form="bank"` draws the
 * group as a preset bank and `form="selector"` as a rotary selector over the same native radios (section 11).
 */
import { Children, Fragment, createContext, forwardRef, isValidElement, useContext, useEffect, useId, useState, type CSSProperties, type FieldsetHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { attachStrataRotarySelectors } from "../dom/rotary-selector.ts";
import { bankMarkup } from "../shared/latching-forms.ts";
import { radioAt, radioForm, radioFormFor, radioOwner, radioSelectorModel, type RadioOption, type StrataRadioForm } from "../shared/radio-forms.ts";
import { optionLabel } from "../shared/select-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

interface GroupContext {
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  invalid: boolean;
  required?: boolean;
  /** `bank`: the group is a preset bank, and its radios are its keys. */
  bank?: boolean;
  colour?: StrataLampColour;
  /** `selector`: the group is a rotary selector, and its radios are printed round the dial at their positions. */
  selector?: { positions: ReadonlyMap<string, number>; count: number; current: string | undefined };
}

const RadioGroupContext = createContext<GroupContext | undefined>(undefined);

export interface RadioGroupProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange" | "defaultValue">, StrataProps {
  /** The question, rendered as the `<legend>`. */
  legend: ReactNode;
  /** The radios' shared `name`; generated when absent. */
  name?: string;
  /** Controlled selection. */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  help?: ReactNode;
  /** An error message, prefixed with `errorPrefix`; marks every radio invalid. */
  error?: ReactNode;
  required?: boolean;
  errorPrefix?: string;
  /**
   * The form (anatomy page `radio.md`, section 11): `bank`, a preset bank: the same native radios drawn as interlocking latching
   * buttons on one plinth, one down at a time, each label printed on its cap; `selector`, the RotarySelector's dial over the same native
   * radios, one detent per radio and each label printed round it (2 to 8 radios of at most 12 characters, otherwise it is drawn as a
   * `bank`; the `Radio`s must be direct children with a plain-text label). `flush`, or absent, is today's look. Any other string is
   * the native `form` attribute of the fieldset, as before.
   */
  form?: StrataRadioForm | "flush" | (string & {});
  /** A selector's turn from the first to the last radio in degrees; the `knob.sweep` token (270) by default. */
  sweep?: number;
  /** The LEDs' colour of a bank: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
  children: ReactNode;
}

/** The text of a `Radio`'s children, or undefined where it is not plain text. */
function textOf(node: ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) { const parts = node.map(textOf); return parts.some(part => part === undefined) ? undefined : parts.join(""); }
  return undefined;
}

/** The radios a group's children hold (through fragments), or undefined when one cannot be read: a child that is not a `Radio`, or a label that is not plain text. */
function readRadios(children: ReactNode): RadioOption[] | undefined {
  const options: RadioOption[] = [];
  let readable = true;
  const walk = (nodes: ReactNode) => {
    for (const child of Children.toArray(nodes)) {
      if (!isValidElement(child)) { if (typeof child === "string" && !child.trim()) continue; readable = false; continue; }
      const props = child.props as { value?: unknown; disabled?: boolean; children?: ReactNode };
      if (child.type === Fragment) walk(props.children);
      else if (child.type === Radio && typeof props.value === "string") {
        const text = textOf(props.children);
        if (text === undefined) { readable = false; continue; }
        options.push({ value: props.value, label: optionLabel(text), ...(props.disabled ? { disabled: true } : {}) });
      } else readable = false;
    }
  };
  walk(children);
  return readable ? options : undefined;
}

/** `--name: value;` declarations as a React style object. */
const styleOf = (declarations: string): CSSProperties =>
  Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(function RadioGroup(
  { legend, name, value, defaultValue, onChange, help, error, required, errorPrefix = "Error:", form, sweep, colour, size, material, level, className, children, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const asked = radioForm(form);
  const options = asked === "selector" ? readRadios(children) : undefined;
  const drawn = radioFormFor(asked, options);
  const [own, setOwn] = useState(defaultValue);
  const groupName = name ?? `radio-${generated}`;
  const helpId = `${groupName}-help`, errorId = `${groupName}-error`;
  const hasError = error !== undefined && error !== null && error !== false;
  const bank = drawn === "bank" ? "bank" : undefined, selector = drawn === "selector", owner = radioOwner(form);
  // A bank's keys are held down while they are pressed and play their feedback (`dom/push-button.ts`), once per document; a selector's dial has its own behaviour.
  useEffect(() => { if (bank) attachStrataPushButtons(); }, [bank]);
  useEffect(() => { if (selector) attachStrataRotarySelectors(); }, [selector]);
  const current = value ?? own;
  const model = selector ? radioSelectorModel(options!, current, sweep) : undefined;
  const describedBy = [help ? helpId : undefined, hasError ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset ref={ref} className={classes("ug-radio-group", className)} aria-describedby={describedBy} {...strataAttributes({ size, material, level })} {...(drawn ? { "data-strata-form": drawn } : {})} {...(owner !== undefined ? { form: owner } : {})} {...rest}>
      <legend className="ug-radio-group__legend">{legend}</legend>
      <RadioGroupContext.Provider value={{ name: groupName, value: selector ? current : value, defaultValue: selector ? undefined : defaultValue, invalid: hasError, required, bank: !!bank, colour,
        onChange: next => { if (selector && value === undefined) setOwn(next); onChange?.(next); },
        ...(model ? { selector: { positions: new Map(options!.map((option, index) => [option.value, index])), count: options!.length, current } } : {}) }}>
        {bank ? <div className="ug-bank__plinth" data-strata-face="raised">{children}</div> : model ? (
          <div className="ug-rotary ug-rotary--group" style={styleOf(model.style)}>
            <div className="ug-rotary__dial">
              <span className="ug-rotary__scale">{children}</span>
              <span className="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true">
                <span className="ug-rotary__cap" data-strata-face="raised"><span className="ug-rotary__pointer" /></span>
              </span>
            </div>
            <ol className="ug-rotary__legend" aria-hidden="true">
              {model.marks.map(mark => <li key={mark.value} data-strata-selected={String(current === mark.value)}>{mark.text}</li>)}
            </ol>
          </div>
        ) : children}
      </RadioGroupContext.Provider>
      {help && <p className="ug-field__help" id={helpId}>{help}</p>}
      {hasError && <p className="ug-field__error" id={errorId}>{errorPrefix} {error}</p>}
    </fieldset>
  );
});

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "children" | "className" | "style" | "value">, StrataProps {
  value: string;
  children: ReactNode;
  /** Class names for the label row. */
  className?: string;
  style?: CSSProperties;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { value, size, material, level, className, style, children, onChange, ...rest }, ref,
) {
  const group = useContext(RadioGroupContext);
  const selection = group?.value !== undefined ? { checked: group.value === value } : group?.defaultValue !== undefined ? { defaultChecked: group.defaultValue === value } : {};
  const input = (
    <input
      ref={ref}
      className={group?.selector ? "ug-rotary__radio" : "ug-radio__input"}
      data-strata-face={group?.bank || group?.selector ? undefined : "well"}
      type="radio"
      name={group?.name}
      value={value}
      required={group?.required}
      aria-invalid={group?.invalid || undefined}
      {...selection}
      {...rest}
      onChange={event => { onChange?.(event); if (event.target.checked) group?.onChange?.(value); }}
    />
  );
  // A radio of a selector: its label printed round the dial at its position, the input an invisible overlay on the print.
  if (group?.selector) {
    const at = group.selector.positions.get(value) ?? 0, checked = group.selector.current === value;
    return (
      <label className={classes("ug-rotary__mark", className)} style={{ ...styleOf(radioAt(at, group.selector.count)), ...style }} data-strata-value={value} data-strata-selected={String(checked)}
        {...(rest.disabled ? { "data-strata-disabled": "true" } : {})} {...strataAttributes({ size, material, level })}>
        <span className="ug-rotary__tick" aria-hidden="true" />
        <span className="ug-rotary__text">{input}{children}</span>
      </label>
    );
  }
  // A key of a preset bank: the input over the key, the LED on the plinth, the label printed on the cap.
  if (group?.bank) return (
    <label className={classes("ug-radio", className)} style={style} {...strataAttributes({ size, material, level })}>
      <span className="ug-push ug-latch ug-latch--bank" {...(group.colour ? { "data-strata-colour": group.colour } : {})}>
        {input}
        <span className="ug-push__object" aria-hidden="true">
          {bankMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
        </span>
        <span className="ug-push__cap" data-strata-face="raised"><span className="ug-radio__label">{children}</span></span>
      </span>
    </label>
  );
  return (
    <label className={classes("ug-radio", className)} style={style} {...strataAttributes({ size, material, level })}>
      {input}
      <span className="ug-radio__dot" data-strata-face="knob" aria-hidden="true" />
      <span className="ug-radio__label">{children}</span>
    </label>
  );
});
