/**
 * Button, IconButton and ToggleButton: native `<button>` keys (anatomy pages `button.md`, `icon-button.md`,
 * `toggle-button.md`). `type` defaults to `button`. `aria-disabled` keeps a control focusable while blocking
 * activation; `disabled` uses the native attribute.
 */
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { buttonPushForm, pushMarkup, togglePushForm, type PushPart, type StrataPushForm } from "../shared/push-button.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "form">;

/** A push button's decorative object (`pushMarkup`): inside `<span class="ug-push__object" aria-hidden="true">`. */
const PushObject = ({ form }: { form: StrataPushForm }) => (
  <span className="ug-push__object" aria-hidden="true">
    {pushMarkup(form).map((part: PushPart) => <span key={part.className} className={part.className} data-strata-face={part.face} />)}
  </span>
);

export interface ButtonProps extends NativeButton, StrataProps {
  /** `secondary` (default), `accent` for the primary action, or `danger` for a destructive one. */
  variant?: "secondary" | "accent" | "danger";
  /** An icon before the label; decorative, so it is hidden from assistive technology. */
  icon?: ReactNode;
  /** Work in progress: sets `aria-busy`, and the label stays. */
  busy?: boolean;
  /**
   * The push-button form (anatomy page `button.md`, *Push-button forms*): `momentary`, the same native button drawn as a
   * machined cap with a lit ring that lights while it is held. Absent, it is the Strata button. Any other string is the
   * native `form` attribute (the id of the button's form owner), as before.
   */
  form?: "momentary" | (string & {});
  /** The lit ring's colour of a push button: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
}

/** Blocks activation of an `aria-disabled` control, which stays focusable. */
const guard = (onClick: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined, blocked: boolean) => (event: MouseEvent<HTMLButtonElement>) => {
  if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
  onClick?.(event);
};
const isBlocked = (value: ButtonHTMLAttributes<HTMLButtonElement>["aria-disabled"]) => value === true || value === "true";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", icon, busy, form, colour, size, material, level, className, type = "button", onClick, children, ...rest }, ref,
) {
  const push = buttonPushForm(form);
  // A push button is held down while it is pressed and plays its feedback (`dom/push-button.ts`), once per document.
  useEffect(() => { if (push) attachStrataPushButtons(); }, [push]);
  const content = (
    <>
      {icon !== undefined && <span className="ug-button__icon" aria-hidden="true">{icon}</span>}
      <span className="ug-button__label">{children}</span>
    </>
  );
  return (
    <button
      ref={ref}
      type={type}
      className={classes("ug-button", push && "ug-push", variant !== "secondary" && `ug-button--${variant}`, className)}
      {...(push ? { "data-strata-form": push, ...(colour ? { "data-strata-colour": colour } : {}) } : { "data-strata-face": "raised" })}
      aria-busy={busy || undefined}
      {...strataAttributes({ size, material, level })}
      {...(form !== undefined && !push ? { form } : {})}
      {...rest}
      onClick={guard(onClick, isBlocked(rest["aria-disabled"]))}
    >
      {push ? <><PushObject form={push} /><span className="ug-push__cap" data-strata-face="raised">{content}</span></> : content}
    </button>
  );
});

export interface IconButtonProps extends Omit<NativeButton, "children">, StrataProps {
  /** The accessible name; an icon-only button has no visible text. */
  label: string;
  /** The id of the button's form owner. */
  form?: string;
  /** The icon (SVG or an icon component). */
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size, material, level, className, type = "button", onClick, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes("ug-icon-button", className)}
      data-strata-face="raised"
      aria-label={label}
      {...strataAttributes({ size, material, level })}
      {...rest}
      onClick={guard(onClick, isBlocked(rest["aria-disabled"]))}
    >
      <span className="ug-icon-button__icon" aria-hidden="true">{icon}</span>
    </button>
  );
});

export interface ToggleButtonProps extends NativeButton, StrataProps {
  /** Controlled state. */
  pressed?: boolean;
  /** Initial state when uncontrolled. */
  defaultPressed?: boolean;
  /** Called with the new state when the user toggles it. */
  onPressedChange?: (pressed: boolean) => void;
  /**
   * The push-button form (anatomy page `toggle-button.md`, *Push-button forms*): `latching`, the same native toggle drawn as
   * a machined cap that stays down while pressed in, with a lit ring and an LED. Absent, it is the Strata toggle button. Any
   * other string is the native `form` attribute (the id of the button's form owner), as before.
   */
  form?: "latching" | (string & {});
  /** The lit ring's and LED's colour of a push button: `glowOn` (amber) by default, or a status role. */
  colour?: StrataLampColour;
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { pressed, defaultPressed = false, onPressedChange, form, colour, size, material, level, className, type = "button", onClick, children, ...rest }, ref,
) {
  const [own, setOwn] = useState(defaultPressed);
  const current = pressed ?? own;
  const push = togglePushForm(form);
  useEffect(() => { if (push) attachStrataPushButtons(); }, [push]);
  const label = <span className="ug-toggle-button__label">{children}</span>;
  return (
    <button
      ref={ref}
      type={type}
      className={classes("ug-toggle-button", push && "ug-push", className)}
      {...(push ? { "data-strata-form": push, ...(colour ? { "data-strata-colour": colour } : {}) } : { "data-strata-face": "raised" })}
      aria-pressed={current}
      {...strataAttributes({ size, material, level })}
      {...(form !== undefined && !push ? { form } : {})}
      {...rest}
      onClick={guard(event => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (pressed === undefined) setOwn(!current);
        onPressedChange?.(!current);
      }, isBlocked(rest["aria-disabled"]))}
    >
      {push ? <><PushObject form={push} /><span className="ug-push__cap" data-strata-face="raised">{label}</span></> : label}
    </button>
  );
});
