/**
 * Rating and RatingDisplay (anatomy page `rating.md`). `Rating` is native radios in a `<fieldset>` named by its
 * `<legend>`, one per score, each visually hidden over its star; arrow keys, Tab and Space stay native. `RatingDisplay`
 * is a read-only score, possibly fractional, as one image named by it. `form="lamps"` draws each star's place as a lamp lens (anatomy
 * page `rating.md`, *Indicator form*); `flush`, or no `form`, is the look it had before.
 */
import { forwardRef, useId, type FieldsetHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { ratingLampMarkup, ratingForm, ratingOwner } from "../shared/indicator-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { ratingItemLabel, ratingName, ratingStyle } from "../shared/rating.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface RatingProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange" | "defaultValue" | "form">, StrataProps {
  /** Names the group, as the `<legend>`. */
  label: ReactNode;
  /** The highest score; 5 by default. */
  max?: number;
  /** The radios' shared `name`; generated when absent. */
  name?: string;
  /** Controlled score. */
  value?: number;
  /** Initial score when uncontrolled. */
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Each star's name; "1 star", "2 stars" by default. */
  itemLabel?: (score: number, max: number) => string;
  /**
   * The form (anatomy page `rating.md`, *Indicator form*): `lamps`, the same radios with a lamp lens in each star's place, lit up to
   * the score; `flush`, or absent, is today's look. Any other string is the native `form` attribute (the id of the fieldset's form
   * owner), as before.
   */
  form?: "lamps" | "flush" | (string & {});
  /** The lit lenses' colour: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
}

export const Rating = forwardRef<HTMLFieldSetElement, RatingProps>(function Rating(
  { label, max = 5, name, value, defaultValue, onChange, itemLabel = ratingItemLabel, form, colour, size, material, level, className, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupName = name ?? `rating-${generated}`;
  const lamps = ratingForm(form), owner = ratingOwner(form);
  return (
    <fieldset ref={ref} className={classes("ug-rating", className)} {...strataAttributes({ size, material, level })} {...(lamps ? { "data-strata-form": lamps } : {})} {...(lamps && colour ? { "data-strata-colour": colour } : {})} {...(owner !== undefined ? { form: owner } : {})} {...rest}>
      <legend className="ug-rating__legend">{label}</legend>
      <div className="ug-rating__stars">
        {Array.from({ length: max }, (_, index) => index + 1).map(score => (
          <label key={score} className="ug-rating__item">
            <input
              className="ug-rating__input"
              type="radio"
              name={groupName}
              value={String(score)}
              {...(value !== undefined ? { checked: value === score } : defaultValue !== undefined ? { defaultChecked: defaultValue === score } : {})}
              onChange={event => { if (event.target.checked) onChange?.(score); }}
            />
            <span className="ug-rating__star" aria-hidden="true">{lamps && ratingLampMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}</span>
            <span className="ug-rating__label">{itemLabel(score, max)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
});

export interface RatingDisplayProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  value: number;
  /** The highest score, and the number of stars; 5 by default. */
  max?: number;
  /** The image's name; "{value} out of {max} stars" by default. */
  label?: string;
}

export const RatingDisplay = forwardRef<HTMLSpanElement, RatingDisplayProps>(function RatingDisplay({ value, max = 5, label, className, style, ...rest }, ref) {
  const properties = Object.fromEntries(ratingStyle(value, max).split(";").filter(Boolean).map(rule => rule.split(":").map(part => part.trim())));
  return <span ref={ref} className={classes("ug-rating-display", className)} role="img" aria-label={label ?? ratingName(value, max)} style={{ ...properties, ...style }} {...rest} />;
});
