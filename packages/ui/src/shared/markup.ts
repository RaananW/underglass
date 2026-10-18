/**
 * Shared by every binding: the Strata props every component accepts, and how they become the markup contract's
 * attributes (`docs/ui-library/components/README.md`).
 */

/** Component size (design language section 13). */
export type StrataSize = "small" | "medium" | "large";
/** Presentation level (section 16). */
export type StrataLevel = "relief" | "objects" | "instrument" | "scene";

/** Props every Strata component accepts. */
export interface StrataProps {
  /** `data-strata-size`: small, medium (the scope's, by default) or large. */
  size?: StrataSize;
  /** `data-strata-material`: a material preset for this component, overriding its role's. */
  material?: string;
  /** `data-strata-level`: the presentation level for this component. */
  level?: StrataLevel;
}

/** The data attributes for Strata props; absent props add nothing, so the scope's values apply. */
export function strataAttributes({ size, material, level }: StrataProps): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (size) attributes["data-strata-size"] = size;
  if (material) attributes["data-strata-material"] = material;
  if (level) attributes["data-strata-level"] = level;
  return attributes;
}

/** Joins class names, skipping empty ones. */
export function classes(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

