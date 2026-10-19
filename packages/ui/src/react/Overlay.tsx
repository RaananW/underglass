/**
 * Dialog and Drawer (anatomy pages `dialog.md`, `drawer.md`): modal top-level panels at the modal level, rendered into
 * a container (the page body by default) with a scrim before them, never inside a layer. The modal behaviour (inert
 * background, focus, Escape, motion) is `showStrataDialog` from `@underglass/ui/dom`, shared with the other bindings.
 * Closed, they render nothing; closing keeps the panel mounted until its leave motion has finished.
 */
import { forwardRef, useLayoutEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { showStrataDialog, type DialogCloseReason } from "../dom/dialog.ts";
import { dialogForm, drawerForm, type StrataDialogForm, type StrataDrawerForm } from "../shared/structure-forms.ts";
import { classes, mergeRefs, strataAttributes, type StrataProps } from "./shared.ts";

export type { DialogCloseReason };

interface OverlayProps extends Omit<HTMLAttributes<HTMLElement>, "title" | "onClose">, StrataProps {
  /** Whether the panel is shown. */
  open: boolean;
  /** Called when the user asks to close (Escape, or the scrim with `closeOnScrim`); set `open` to false to close. */
  onClose?(reason: DialogCloseReason): void;
  /** The visible title, which names the panel. */
  title: ReactNode;
  /** The title's id; generated when absent. */
  titleId?: string;
  /** The description's id; generated when absent. */
  descriptionId?: string;
  /** A paragraph at the start of the body that describes the panel (`aria-describedby`). */
  description?: ReactNode;
  /** The action buttons below the body. */
  actions?: ReactNode;
  /** Where the panel and its scrim are rendered; `document.body` by default. */
  container?: Element | DocumentFragment | null;
  /** The element that takes focus on open; the first `[autofocus]` or tabbable element by default. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** The element that takes focus on close; the element that had focus before opening by default. */
  returnFocus?: RefObject<HTMLElement | null>;
  /** Whether a click on the scrim asks to close; false by default, as for a native `<dialog>`. */
  closeOnScrim?: boolean;
}

export interface DialogProps extends OverlayProps {
  /** `plate`: a machined plate that rises out of the chassis when it opens. `flush` or none: the dialog of before. */
  form?: StrataDialogForm | "flush";
}
export interface DrawerProps extends OverlayProps {
  /** `tray`: a recessed tray that slides out of the chassis edge when it opens. `flush` or none: the drawer of before. */
  form?: StrataDrawerForm | "flush";
  /** The edge it sits on: `end` (the default), `start`, `top` or `bottom`. */
  side?: "start" | "end" | "top" | "bottom";
}

/** The shared implementation: `part` is the BEM block, `modifier` the drawer's side class. */
function Modal(
  { part, modifier, forwardedRef, form, open, onClose, title, titleId, description, descriptionId: givenDescriptionId, actions, container, initialFocus, returnFocus, closeOnScrim, size, material, level, className, children, ...rest }:
  OverlayProps & { part: "dialog" | "drawer"; modifier?: string; forwardedRef: Ref<HTMLElement>; form?: string },
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = titleId ?? `${part}-title-${generated}`;
  const descriptionId = givenDescriptionId ?? `${part}-description-${generated}`;
  // Mounted while open and while leaving.
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const panel = useRef<HTMLElement | null>(null);
  const latest = useRef({ onClose, initialFocus, returnFocus, closeOnScrim, open });
  latest.current = { onClose, initialFocus, returnFocus, closeOnScrim, open };

  // Before paint, so the panel never shows for a frame without its enter motion.
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const handle = showStrataDialog(panel.current, {
      onClose: reason => latest.current.onClose?.(reason),
      get initialFocus() { return latest.current.initialFocus?.current ?? undefined; },
      get returnFocus() { return latest.current.returnFocus?.current ?? undefined; },
      get closeOnScrim() { return latest.current.closeOnScrim; },
    });
    return () => { void handle.close().then(() => { if (!latest.current.open) setPresent(false); }); };
  }, [open, present]);

  if (!present || typeof document === "undefined") return null;
  const formed = part === "dialog" ? dialogForm(form) : drawerForm(form);
  return createPortal(
    <>
      <div className="ug-scrim" aria-hidden="true" />
      <section
        ref={mergeRefs(panel, forwardedRef)}
        className={classes("ug-panel", `ug-${part}`, modifier, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        data-strata-face="raised"
        data-strata-elevation="modal"
        tabIndex={-1}
        {...(formed ? { "data-strata-form": formed } : {})}
        {...strataAttributes({ size, material, level })}
        {...rest}
      >
        <h2 className={`ug-${part}__title`} id={id}>{title}</h2>
        <div className={`ug-${part}__body`}>
          {description !== undefined && <p className={`ug-${part}__description`} id={descriptionId}>{description}</p>}
          {children}
        </div>
        {actions !== undefined && <div className={`ug-${part}__actions`}>{actions}</div>}
      </section>
    </>,
    container ?? document.body,
  );
}

export const Dialog = forwardRef<HTMLElement, DialogProps>(function Dialog(props, ref) {
  return <Modal {...props} part="dialog" forwardedRef={ref} />;
});

export const Drawer = forwardRef<HTMLElement, DrawerProps>(function Drawer({ side = "end", ...props }, ref) {
  return <Modal {...props} part="drawer" modifier={`ug-drawer--${side}`} forwardedRef={ref} />;
});
