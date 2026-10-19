/**
 * Panel and Card (anatomy pages `panel.md`, `card.md`): raised slabs. A Panel is the GPU layer unit, a `<section>` at
 * the floating level, named by its title; a Card is a slab inside a Panel. Both forward their ref to the root, which is
 * the element an Underglass app enrolls.
 */
import { forwardRef, useId, type HTMLAttributes, type ReactNode } from "react";
import { PANEL_TRAY_CLASS, surfaceForm, type StrataSurfaceForm } from "../shared/structure-forms.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

type HeadingLevel = 2 | 3 | 4 | 5 | 6;
type Elevation = "ground" | "raised" | "floating" | "overlay" | "modal";

/** A heading id: the given one, or one generated from React's id. */
function useHeadingId(given: string | undefined, prefix: string): string {
  const generated = useId();
  return given ?? `${prefix}-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title">, StrataProps {
  /** A visible title: rendered as a heading that names the panel, which makes it a `region` landmark. */
  title?: ReactNode;
  /** The title's heading level; 2 by default. */
  titleLevel?: HeadingLevel;
  /** The title's id; generated when absent. */
  titleId?: string;
  /** `floating` by default. */
  elevation?: Elevation;
  /** `plate`: a machined plate. `tray`: the content sits in a recessed tray. `flush` or none: the panel of before. */
  form?: StrataSurfaceForm | "flush";
}

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { title, titleLevel = 2, titleId, elevation = "floating", form, size, material, level, className, children, ...rest }, ref,
) {
  const id = useHeadingId(titleId, "panel-title");
  const Heading = `h${titleLevel}` as const;
  const formed = surfaceForm(form);
  return (
    <section
      ref={ref}
      className={classes("ug-panel", className)}
      data-strata-face="raised"
      data-strata-elevation={elevation}
      aria-labelledby={title !== undefined ? id : undefined}
      {...(formed ? { "data-strata-form": formed } : {})}
      {...strataAttributes({ size, material, level })}
      {...rest}
    >
      {title !== undefined && <Heading id={id}>{title}</Heading>}
      {formed === "tray" ? <div className={PANEL_TRAY_CLASS} data-strata-face="well">{children}</div> : children}
    </section>
  );
});

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title">, StrataProps {
  /** A visible title, which names the card. Without one the article is announced as "article" only. */
  title?: ReactNode;
  /** 3 by default. */
  titleLevel?: HeadingLevel;
  titleId?: string;
  /** Actions below the body. */
  footer?: ReactNode;
  /** `article` by default; `section` or `div` for cards that are not self-contained content. */
  as?: "article" | "section" | "div";
  /** `plate`: a machined plate. `tray`: the body sits in a recessed tray. `flush` or none: the card of before. */
  form?: StrataSurfaceForm | "flush";
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { title, titleLevel = 3, titleId, footer, as: Element = "article", form, size, material, level, className, children, ...rest }, ref,
) {
  const id = useHeadingId(titleId, "card-title");
  const Heading = `h${titleLevel}` as const;
  const formed = surfaceForm(form);
  return (
    <Element
      ref={ref as never}
      className={classes("ug-card", className)}
      data-strata-face="raised"
      aria-labelledby={title !== undefined ? id : undefined}
      {...(formed ? { "data-strata-form": formed } : {})}
      {...strataAttributes({ size, material, level })}
      {...rest}
    >
      {title !== undefined && <Heading id={id} className="ug-card__title">{title}</Heading>}
      <div className="ug-card__body" {...(formed === "tray" ? { "data-strata-face": "well" } : {})}>{children}</div>
      {footer !== undefined && <div className="ug-card__footer">{footer}</div>}
    </Element>
  );
});
