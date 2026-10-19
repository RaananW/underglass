/**
 * RadioGroup and Radio (anatomy page `radio.md`): native radios in a `<fieldset>` named by its `<legend>`. The group
 * owns `name`, `value` and `onChange`; arrow keys, Tab and Space stay native. An error marks every radio invalid and
 * joins the help in the fieldset's description; `disabled` on the fieldset disables every radio natively.
 */
import { createContext, forwardRef, useContext, useEffect, useId, type CSSProperties, type FieldsetHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { bankForm, bankMarkup, nativeForm } from "../shared/latching-forms.ts";
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
   * The form (anatomy page `radio.md`, *Latching forms*): `bank`, a preset bank: the same native radios drawn as interlocking latching
   * buttons on one plinth, one down at a time, each label printed on its cap. `flush`, or absent, is today's look. Any other string is
   * the native `form` attribute of the fieldset, as before.
   */
  form?: "bank" | "flush" | (string & {});
  /** The LEDs' colour of a bank: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
  children: ReactNode;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(function RadioGroup(
  { legend, name, value, defaultValue, onChange, help, error, required, errorPrefix = "Error:", form, colour, size, material, level, className, children, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupName = name ?? `radio-${generated}`;
  const helpId = `${groupName}-help`, errorId = `${groupName}-error`;
  const hasError = error !== undefined && error !== null && error !== false;
  const bank = bankForm(form), owner = nativeForm(form, "bank");
  // A bank's keys are held down while they are pressed and play their feedback (`dom/push-button.ts`), once per document.
  useEffect(() => { if (bank) attachStrataPushButtons(); }, [bank]);
  const describedBy = [help ? helpId : undefined, hasError ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset ref={ref} className={classes("ug-radio-group", className)} aria-describedby={describedBy} {...strataAttributes({ size, material, level })} {...(bank ? { "data-strata-form": bank } : {})} {...(owner !== undefined ? { form: owner } : {})} {...rest}>
      <legend className="ug-radio-group__legend">{legend}</legend>
      <RadioGroupContext.Provider value={{ name: groupName, value, defaultValue, onChange, invalid: hasError, required, bank: !!bank, colour }}>
        {bank ? <div className="ug-bank__plinth" data-strata-face="raised">{children}</div> : children}
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
      className="ug-radio__input"
      data-strata-face={group?.bank ? undefined : "well"}
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
