/**
 * StrataProvider and StrataScope (design language section 15, layers 2 and 4). Both render their configuration as
 * markup (a theme `<style>` in the `strata.theme` layer, scope attributes and custom properties), so they work with
 * server rendering and need no effect to style the first paint.
 */
import { forwardRef, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { resolveStrataScope, type ReportMode, type ScopeOverrides } from "../dom/theme.ts";
import { createStrataTheme, StrataThemeError, type StrataTheme, type StrataThemeInput } from "../tokens/theme.ts";
import type { Issue } from "../tokens/validate.ts";

const report = (issues: readonly Issue[], mode: ReportMode, what: string) => {
  if (!issues.length || mode === "silent") return;
  if (mode === "throw") throw new StrataThemeError(issues);
  console[mode](`Strata ${what}: ${issues.map(({ path, message }) => `${path}: ${message}`).join("; ")}`);
};

export interface StrataProviderProps {
  /** A theme built with `createStrataTheme`, or its input. Absent: the defaults. */
  theme?: StrataTheme | StrataThemeInput;
  /** How to report broken invariants; `throw` is strict mode. `error` by default. */
  report?: ReportMode;
  children?: ReactNode;
}

const isTheme = (value: StrataTheme | StrataThemeInput): value is StrataTheme => "issues" in value && "source" in value;

/**
 * Applies an application theme to the page: its token stylesheet, in the `strata.theme` cascade layer. Rendered as
 * a `<style>` element, so a new theme restyles on the next render. Use one per application.
 */
export function StrataProvider({ theme, report: mode = "error", children }: StrataProviderProps) {
  const built = useMemo(() => (theme === undefined ? undefined : isTheme(theme) ? theme : createStrataTheme(theme)), [theme]);
  if (built) report(built.issues, mode, "theme");
  return (
    <>
      {built && <style data-strata-theme-sheet="">{built.css()}</style>}
      {children}
    </>
  );
}

export interface StrataScopeProps extends ScopeOverrides, Omit<HTMLAttributes<HTMLDivElement>, "color"> {
  /** The theme in effect, for ranges and contrast checks of the overrides. */
  base?: StrataTheme;
  report?: ReportMode;
  children?: ReactNode;
}

/**
 * A subtree with its own depth, theme, density, size, level, material, tokens or colours. Light tokens are
 * application-only and are refused. Renders a `<div>` carrying the scope.
 */
export const StrataScope = forwardRef<HTMLDivElement, StrataScopeProps>(function StrataScope(
  { depth, theme, density, size, level, material, colour, tokens, feedback, base, report: mode = "error", style, children, ...rest }, ref,
) {
  const resolved = resolveStrataScope({ depth, theme, density, size, level, material, colour, tokens, feedback }, base);
  report(resolved.issues, mode, "scope");
  const properties = Object.fromEntries(resolved.properties) as CSSProperties;
  return <div ref={ref} {...Object.fromEntries(resolved.attributes)} {...rest} style={{ ...properties, ...style }}>{children}</div>;
});
