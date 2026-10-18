/**
 * StatusLight (anatomy page `status-light.md`): a small lens that shows a state, named by its `label`. By default a
 * `<span role="img" aria-label>`; `showLabel` shows the label as text beside the lens; `live` makes it an `<output>`
 * (a polite live region, `"assertive"` for an assertive one), so a change of label names the change to a screen reader.
 * `colour` is a role, `lit` turns it off, and `blink` is a tempo token, off under reduced motion: a light's meaning is
 * its label, never its colour or its blink. The ref and `className`, `style` and other attributes reach the root.
 */
import { forwardRef, type HTMLAttributes, type Ref } from "react";
import type { StrataLampColour } from "../shared/lamp.ts";
import { statusLightMarkup, statusLightModel, type StatusLive, type StrataBlink } from "../shared/status-light.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface StatusLightProps extends Omit<HTMLAttributes<HTMLElement>, "children">, StrataProps {
  /** What the light says: its accessible name (or, shown or announced, its text). Required. */
  label: string;
  /** The lens colour: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
  /** Lit by default; `false` is an unlit lens. */
  lit?: boolean;
  /** A tempo token (`slow`, `normal` or `fast`); a lit light only, and not under reduced motion. */
  blink?: StrataBlink;
  /** Show the label as text beside the lens. */
  showLabel?: boolean;
  /** An `<output>` live region that names changes of the label. */
  live?: StatusLive;
}

export const StatusLight = forwardRef<HTMLElement, StatusLightProps>(function StatusLight(
  { label, colour, lit, blink, showLabel, live, size, material, level, className, ...rest }, ref,
) {
  const model = statusLightModel({ label, colour, lit, blink, showLabel, live });
  const Tag = model.tag as "span";
  return (
    <Tag ref={ref as Ref<HTMLSpanElement>} className={classes(...model.classes, className)} {...strataAttributes({ size, material, level })} {...model.attrs} {...rest}>
      <span className="ug-status-light__object" aria-hidden="true">
        {statusLightMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
      </span>
      {model.text && <span className="ug-status-light__text">{label}</span>}
    </Tag>
  );
});
