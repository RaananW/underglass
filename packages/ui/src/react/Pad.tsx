/**
 * Pad and PadGrid (anatomy page `pad.md`): a native `<button>` drawn as a square soft cap lit from below, in a grid. A `Pad` is
 * momentary (lit and down while it is held) or, with `latching`, a toggle (`aria-pressed`, lit and resting at 0.45 of its travel
 * while on); the state is controlled with `pressed` and `onPressedChange`, or uncontrolled with `defaultPressed`, as the ToggleButton's.
 * `colour` is the glow's role (`glowOn`, amber, by default). The optional press velocity (0–1: the pointer's pressure where the
 * hardware reports it, else where on the cap the press lands, the keys 1) comes to `onVelocity`; nothing depends on it. The ref is
 * the button. A `PadGrid` is the `<div role="group">` the pads stand in: `columns` (4 by default) and `label` (its accessible name);
 * inside it the pads are one tab stop and the arrow keys move between them (the grid pattern, `attachStrataPads`).
 */
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { attachStrataPads, type PadVelocity } from "../dom/pad.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { padMarkup } from "../shared/pad.ts";
import { classes, mergeRefs, strataAttributes, type StrataProps } from "./shared.ts";

export interface PadProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "form"> , StrataProps {
  /** The pad's label, printed on its cap; it names the button. */
  children?: ReactNode;
  /** An icon before the label; decorative, so it is hidden from assistive technology. */
  icon?: ReactNode;
  /** The glow's colour: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
  /** A latching pad: a toggle (`aria-pressed`) that stays down and lit while on. */
  latching?: boolean;
  /** Controlled state of a latching pad. */
  pressed?: boolean;
  /** Initial state of an uncontrolled latching pad. */
  defaultPressed?: boolean;
  /** Called with the new state when the user toggles a latching pad. */
  onPressedChange?: (pressed: boolean) => void;
  /** Called at each press with its velocity, 0–1, and where it came from. Optional: nothing depends on it. */
  onVelocity?: (velocity: number, source: PadVelocity["source"]) => void;
  /** The id of the pad's form owner (the native `form` attribute). */
  form?: string;
}

/** Blocks activation of an `aria-disabled` control, which stays focusable. */
const guard = (onClick: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined, blocked: boolean) => (event: MouseEvent<HTMLButtonElement>) => {
  if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
  onClick?.(event);
};

export const Pad = forwardRef<HTMLButtonElement, PadProps>(function Pad(
  { icon, colour, latching, pressed, defaultPressed = false, onPressedChange, onVelocity, size, material, level, className, type = "button", onClick, children, ...rest }, ref,
) {
  const [own, setOwn] = useState(defaultPressed);
  const current = pressed ?? own, inner = useRef<HTMLButtonElement | null>(null), report = useRef(onVelocity);
  report.current = onVelocity;
  // A pad is held down while it is pressed, reports its velocity, plays its feedback and runs the grid keys (`dom/pad.ts`), once per document.
  useEffect(() => attachStrataPads(), []);
  useEffect(() => {
    const button = inner.current;
    if (!button) return undefined;
    const listen = (event: Event) => { const { velocity, source } = (event as CustomEvent<PadVelocity>).detail; report.current?.(velocity, source); };
    button.addEventListener("strata-pad-velocity", listen);
    return () => button.removeEventListener("strata-pad-velocity", listen);
  }, []);
  const blocked = rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      ref={mergeRefs(inner, ref)}
      type={type}
      className={classes("ug-pad", className)}
      {...(colour ? { "data-strata-colour": colour } : {})}
      {...(latching ? { "aria-pressed": current } : {})}
      {...strataAttributes({ size, material, level })}
      {...rest}
      onClick={guard(event => {
        onClick?.(event);
        if (!latching || event.defaultPrevented) return;
        if (pressed === undefined) setOwn(!current);
        onPressedChange?.(!current);
      }, blocked)}
    >
      <span className="ug-pad__object" aria-hidden="true">
        {padMarkup.map(part => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
      </span>
      <span className="ug-pad__cap" data-strata-face="raised">
        {icon !== undefined && <span className="ug-pad__icon" aria-hidden="true">{icon}</span>}
        <span className="ug-pad__label">{children}</span>
      </span>
    </button>
  );
});

export interface PadGridProps extends Omit<HTMLAttributes<HTMLDivElement>, "role">, StrataProps {
  /** The grid's accessible name. */
  label: string;
  /** The columns (4 by default). */
  columns?: number;
  children?: ReactNode;
}

export const PadGrid = forwardRef<HTMLDivElement, PadGridProps>(function PadGrid(
  { label, columns, size, material, level, className, style, children, ...rest }, ref,
) {
  useEffect(() => attachStrataPads(), []);
  const own = columns !== undefined && Number.isFinite(columns) && columns >= 1 ? { "--strata-pad-columns": Math.floor(columns) } as CSSProperties : undefined;
  return (
    <div ref={ref} className={classes("ug-pad-grid", className)} role="group" aria-label={label} {...strataAttributes({ size, material, level })} style={own || style ? { ...own, ...style } : undefined} {...rest}>
      {children}
    </div>
  );
});
