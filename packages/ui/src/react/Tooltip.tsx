/**
 * Tooltip (anatomy page `tooltip.md`): a description shown while one trigger is hovered or focused. The trigger, the
 * one child, gets `aria-describedby`; the tooltip (`role="tooltip"`, `popover="manual"`) is portalled to `container`
 * (`<body>` by default), outside every Underglass layer, and `attachStrataTooltips` runs it.
 */
import { cloneElement, useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { attachStrataTooltips } from "../dom/tooltip.ts";
import { classes } from "./shared.ts";

export interface TooltipProps {
  /** The description. Text only: anything interactive belongs in a Popover. */
  content: ReactNode;
  /** The one trigger: a focusable element that accepts `aria-describedby`. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  /** The tooltip's id; generated when absent. */
  id?: string;
  /** Prefer below the trigger. */
  placement?: "top" | "bottom";
  /** Where the tooltip is portalled; `document.body` by default. Never inside an Underglass layer. */
  container?: Element | null;
  className?: string;
}

export function Tooltip({ content, children, id, placement = "top", container, className }: TooltipProps) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tipId = id ?? `tooltip-${generated}`;
  // The portal target exists only in the browser, after the first render.
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { attachStrataTooltips(); setHost(container ?? document.body); }, [container]);
  const describedBy = [children.props["aria-describedby"], tipId].filter(Boolean).join(" ");
  return (
    <>
      {cloneElement(children, { "aria-describedby": describedBy })}
      {host && createPortal(
        <div className={classes("ug-tooltip", className)} id={tipId} role="tooltip" popover="manual" data-strata-placement={placement === "bottom" ? "bottom" : undefined}>{content}</div>,
        host,
      )}
    </>
  );
}
