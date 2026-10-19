/**
 * ButtonGroup, Divider, Badge, Spinner and ProgressBar (anatomy pages `button-group.md`, `divider.md`, `badge.md`,
 * `spinner.md`, `progress-bar.md`). Badge, Spinner and ProgressBar take an indicator form through `form` (`led`, `ring`, `meter`; anatomy
 * pages, *Indicator form*): the same native element with LED lenses drawn over it; `flush`, or no `form`, is the look they had before.
 */
import { forwardRef, useEffect, type CSSProperties, type HTMLAttributes, type ProgressHTMLAttributes, type ReactNode } from "react";
import { attachStrataProgress } from "../dom/progress.ts";
import { badgeForm, badgeLensMarkup, lensStyle, progressForm, progressFraction, progressSegmentCount, progressSegments, progressStyle, spinnerForm, spinnerLensIndices } from "../shared/indicator-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement>, StrataProps {
  /** The group's accessible name. */
  label: string;
  /** `horizontal` by default; changes the flow, not the markup. */
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { label, orientation = "horizontal", size, material, level, className, children, ...rest }, ref,
) {
  return (
    <div ref={ref} className={classes("ug-button-group", orientation === "vertical" && "ug-button-group--vertical", className)} role="group" aria-label={label} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...rest}>
      {children}
    </div>
  );
});

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export const Divider = forwardRef<HTMLHRElement, DividerProps>(function Divider({ orientation = "horizontal", className, ...rest }, ref) {
  const vertical = orientation === "vertical";
  return <hr ref={ref} className={classes("ug-divider", vertical && "ug-divider--vertical", className)} data-strata-face="groove" aria-orientation={vertical ? "vertical" : undefined} {...rest} />;
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** `neutral` by default. */
  variant?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  /** A number to show instead of children; above `max` it reads "99+", with the full number visually hidden. */
  count?: number;
  /** 99 by default. */
  max?: number;
  /** `led`: an LED pill, the StatusLight's lens before the text, in the variant's colour; `flush`, or absent, is today's pill. */
  form?: "led" | "flush";
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "neutral", count, max = 99, form, className, children, ...rest }, ref,
) {
  const led = badgeForm(form);
  const content = count === undefined ? children : count > max
    ? <>{max}+<span className="ug-badge__full"> ({count})</span></>
    : count;
  return <span ref={ref} className={classes("ug-badge", variant !== "neutral" && `ug-badge--${variant}`, className)} data-strata-face="flat" {...(led ? { "data-strata-form": led } : {})} {...rest}>{led && <span className={badgeLensMarkup.className} data-strata-face={badgeLensMarkup.face} aria-hidden="true" />}{content}</span>;
});

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** The accessible name and the announcement; required. */
  label: string;
  /** `medium` by default: 16, 24 or 40 px. */
  size?: "small" | "medium" | "large";
  /** Show the label next to the ring (it is always shown under reduced motion). */
  showLabel?: boolean;
  /**
   * Inside a Button with `busy`: no `role` and hidden from assistive technology, so the Button announces the busy
   * state once.
   */
  decorative?: boolean;
  /** `ring`: a ring of eight LEDs chasing at `chase.spinner` (steady under reduced motion); `flush`, or absent, is today's turning arc. */
  form?: "ring" | "flush";
  /** The ring's colour: `accent` by default, or another status role. */
  colour?: StrataLampColour;
}

const spinnerSizes = { small: "sm", medium: "md", large: "lg" } as const;

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { label, size = "medium", showLabel, decorative, form, colour, className, ...rest }, ref,
) {
  const ring = spinnerForm(form);
  return (
    <span
      ref={ref}
      className={classes("ug-spinner", `ug-spinner--${spinnerSizes[size]}`, showLabel && "ug-spinner--labelled", className)}
      role={decorative ? undefined : "status"}
      aria-hidden={decorative || undefined}
      {...(ring ? { "data-strata-form": ring, ...(colour ? { "data-strata-colour": colour } : {}) } : { "data-strata-face": "ring" })}
      {...rest}
    >
      {ring
        ? <span className="ug-spinner__ring" aria-hidden="true">{spinnerLensIndices.map(index => <span key={index} className="ug-spinner__lens" data-strata-face="knob" style={styleOf(lensStyle(index))} />)}</span>
        : <span className="ug-spinner__arc" aria-hidden="true" />}
      <span className="ug-spinner__label">{label}</span>
    </span>
  );
});

export interface ProgressBarProps extends ProgressHTMLAttributes<HTMLProgressElement> {
  /** Absent for an indeterminate bar. */
  value?: number;
  /** 100 by default. */
  max?: number;
  /**
   * `meter`: a groove with a row of LED segments lit from the value, a lit head running along it while indeterminate; the native
   * `<progress>` stays the control. `flush`, or absent, is today's bar. With `meter`, `className` and `style` reach the wrapper.
   */
  form?: "meter" | "flush";
  /** The number of segments of a `meter` bar; 20 by default (4 to 32). */
  segments?: number;
  /** The segments' colour: `accent` by default, or another status role. */
  colour?: StrataLampColour;
}

export const ProgressBar = forwardRef<HTMLProgressElement, ProgressBarProps>(function ProgressBar(
  { value, max = 100, form, segments, colour, className, style, ...rest }, ref,
) {
  const field = useFieldControl();
  const { id, "aria-describedby": describedBy } = field ?? {};
  const meter = progressForm(form);
  // A segment meter's value reaches the drawing through `attachStrataProgress`, attached once; a changed `value` is all it takes.
  useEffect(() => { if (meter) attachStrataProgress(); }, [meter]);
  if (!meter) return <progress ref={ref} className={classes("ug-progress", className)} style={style} data-strata-face="groove" {...(field ? { id, "aria-describedby": describedBy } : {})} value={value} max={max} {...rest} />;
  const count = progressSegmentCount(segments);
  return (
    <span className={classes("ug-progress-bar", className)} data-strata-form={meter} {...(colour ? { "data-strata-colour": colour } : {})} style={{ ...styleOf(progressStyle(progressFraction(value, max), count)), ...style }}>
      <progress ref={ref} className="ug-progress" {...(field ? { id, "aria-describedby": describedBy } : {})} value={value} max={max} {...rest} />
      <span className="ug-progress__object" aria-hidden="true">
        <span className="ug-progress__window" data-strata-face="groove" />
        <span className="ug-progress__segments">{progressSegments(count).map(index => <span key={index} className="ug-progress__segment" data-strata-face="knob" style={styleOf(lensStyle(index))} />)}</span>
      </span>
    </span>
  );
});

/** `--name: value;` declarations as a React style object. */
function styleOf(declarations: string): CSSProperties {
  return Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;
}
