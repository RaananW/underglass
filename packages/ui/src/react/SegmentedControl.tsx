/**
 * SegmentedControl (anatomy page `segmented-control.md`): native radios in a `<fieldset>` named by its `<legend>`, each
 * visually hidden over its key on one plinth. Arrow keys, Tab and Space stay native; the selected key is held down.
 */
import { forwardRef, useEffect, useId, type FieldsetHTMLAttributes, type ReactNode } from "react";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { bankMarkup, latchForm, nativeForm } from "../shared/latching-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange" | "defaultValue">, StrataProps {
  /** Names the group, as the `<legend>`. */
  label: ReactNode;
  /** Hides the legend visually; it still names the group. */
  hideLabel?: boolean;
  /** Two to five short options. */
  options: readonly SegmentedOption[];
  /** The radios' shared `name`; generated when absent. */
  name?: string;
  /** Controlled selection. */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /**
   * The form (anatomy page `segmented-control.md`, *Latching forms*): `latching`, the same native radios drawn as interlocking latching
   * buttons on one plinth, the selected one down with its LED lit. `flush`, or absent, is today's look. Any other string is the
   * native `form` attribute of the fieldset, as before.
   */
  form?: "latching" | "flush" | (string & {});
  /** The LEDs' colour of a latching control: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
}

export const SegmentedControl = forwardRef<HTMLFieldSetElement, SegmentedControlProps>(function SegmentedControl(
  { label, hideLabel, options, name, value, defaultValue, onChange, form, colour, size, material, level, className, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupName = name ?? `segmented-${generated}`;
  const latching = latchForm(form), owner = nativeForm(form, "latching");
  // A latching key is held down while it is pressed and plays its feedback (`dom/push-button.ts`), once per document.
  useEffect(() => { if (latching) attachStrataPushButtons(); }, [latching]);
  return (
    <fieldset ref={ref} className={classes("ug-segmented", className)} {...strataAttributes({ size, material, level })} {...(latching ? { "data-strata-form": latching } : {})} {...(owner !== undefined ? { form: owner } : {})} {...rest}>
      <legend className={classes("ug-segmented__legend", hideLabel && "ug-segmented__legend--hidden")}>{label}</legend>
      <div className={classes("ug-segmented__plinth", latching && "ug-bank__plinth")} data-strata-face={latching ? "raised" : undefined}>
        {options.map(option => {
          const input = (
            <input
              className="ug-segmented__input"
              type="radio"
              name={groupName}
              value={option.value}
              disabled={option.disabled}
              {...(value !== undefined ? { checked: value === option.value } : defaultValue !== undefined ? { defaultChecked: defaultValue === option.value } : {})}
              onChange={event => { if (event.target.checked) onChange?.(option.value); }}
            />
          );
          return latching ? (
            <label key={option.value} className="ug-segmented__item">
              <span className="ug-push ug-latch ug-latch--bank" {...(colour ? { "data-strata-colour": colour } : {})}>
                {input}
                <span className="ug-push__object ug-latch__object" aria-hidden="true">
                  {bankMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
                </span>
                <span className="ug-push__cap ug-segmented__key" data-strata-face="raised">{option.label}</span>
              </span>
            </label>
          ) : (
            <label key={option.value} className="ug-segmented__item">
              {input}
              <span className="ug-segmented__key" data-strata-face="raised">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
});
