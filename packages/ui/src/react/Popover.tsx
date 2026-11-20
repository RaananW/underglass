/**
 * Popover (anatomy page `popover.md`): interactive content one button opens beside itself, on the native Popover API.
 * The trigger, the `trigger` element, gets `popovertarget`; the popover (`popover`, `role="dialog"`) is portalled to
 * `container` (`document.body` by default), outside every Underglass layer. The browser toggles it, dismisses it on
 * Escape or a click outside, returns focus, and places it by CSS anchor positioning (`attachStrataPopovers` places one
 * opened from inside an Underglass layer).
 */
import { cloneElement, useEffect, useId, useRef, useState, version, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { attachStrataPopovers } from "../dom/popover.ts";
import { classes } from "./shared.ts";

export interface PopoverProps {
  /** The one button that opens it. */
  trigger: ReactElement;
  /** Names it, as its heading. */
  title?: ReactNode;
  /** Names it when there is no title. */
  label?: string;
  children?: ReactNode;
  /** The popover's id; generated when absent. */
  id?: string;
  /** Prefer above the button. */
  placement?: "top" | "bottom";
  /** Where the popover is portalled; `document.body` by default. Never inside an Underglass layer. */
  container?: Element | null;
  /** Called when it opens or closes, however that happened. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

// React 19 knows the Popover API's props; React 18 passes unknown lowercase attributes through.
const targetProp = Number(version.split(".")[0]) >= 19 ? "popoverTarget" : "popovertarget";

export function Popover({ trigger, title, label, children, id, placement = "bottom", container, onOpenChange, className }: PopoverProps) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const popoverId = id ?? `popover-${generated}`, titleId = `${popoverId}-title`;
  const element = useRef<HTMLDivElement>(null);
  // The portal target exists only in the browser, after the first render.
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(container ?? document.body); return attachStrataPopovers(); }, [container]);
  const report = useRef(onOpenChange);
  report.current = onOpenChange;
  useEffect(() => {
    const popover = element.current;
    if (!popover) return;
    const toggle = (event: Event) => report.current?.((event as ToggleEvent).newState === "open");
    popover.addEventListener("toggle", toggle);
    return () => popover.removeEventListener("toggle", toggle);
  }, [host]);
  const attributes = { className: classes("ug-popover", className), "data-strata-face": "raised", id: popoverId, popover: "", role: "dialog",
    "aria-labelledby": title ? titleId : undefined, "aria-label": title ? undefined : label, "data-strata-placement": placement === "top" ? "top" : undefined };
  return (
    <>
      {cloneElement(trigger, { [targetProp]: popoverId } as Record<string, unknown>)}
      {host && createPortal(
        <div ref={element} {...(attributes as Record<string, unknown>)}>
          {title && <h2 className="ug-popover__title" id={titleId}>{title}</h2>}
          <div className="ug-popover__body">{children}</div>
        </div>,
        host,
      )}
    </>
  );
}
