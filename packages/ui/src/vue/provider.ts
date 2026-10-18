/**
 * StrataProvider and StrataScope for Vue 3 (design language section 15, layers 2 and 4). Both render their
 * configuration as markup, so they work with server rendering and style the first paint.
 */
import { computed, defineComponent, Fragment, h, type PropType } from "vue";
import { resolveStrataScope, type ReportMode, type ScopeOverrides } from "../dom/theme.ts";
import { createStrataTheme, StrataThemeError, type StrataTheme, type StrataThemeInput } from "../tokens/theme.ts";
import type { Issue } from "../tokens/validate.ts";

const report = (issues: readonly Issue[], mode: ReportMode, what: string) => {
  if (!issues.length || mode === "silent") return;
  if (mode === "throw") throw new StrataThemeError(issues);
  console[mode](`Strata ${what}: ${issues.map(({ path, message }) => `${path}: ${message}`).join("; ")}`);
};

const isTheme = (value: StrataTheme | StrataThemeInput): value is StrataTheme => "issues" in value && "source" in value;

/** Applies an application theme: its token stylesheet, in the `strata.theme` cascade layer. */
export const StrataProvider = defineComponent({
  name: "StrataProvider",
  props: {
    theme: { type: Object as PropType<StrataTheme | StrataThemeInput>, default: undefined },
    report: { type: String as PropType<ReportMode>, default: "error" },
  },
  setup(props, { slots }) {
    const built = computed(() => (props.theme === undefined ? undefined : isTheme(props.theme) ? props.theme : createStrataTheme(props.theme)));
    return () => {
      if (built.value) report(built.value.issues, props.report, "theme");
      return h(Fragment, [built.value && h("style", { "data-strata-theme-sheet": "" }, built.value.css()), slots.default?.()]);
    };
  },
});

/** A subtree with its own depth, theme, density, size, level, material, tokens or colours; renders a `<div>`. */
export const StrataScope = defineComponent({
  name: "StrataScope",
  props: {
    depth: { type: Number, default: undefined },
    theme: { type: String, default: undefined },
    density: { type: String as PropType<ScopeOverrides["density"]>, default: undefined },
    size: { type: String as PropType<ScopeOverrides["size"]>, default: undefined },
    level: { type: String as PropType<ScopeOverrides["level"]>, default: undefined },
    material: { type: String, default: undefined },
    colour: { type: Object as PropType<ScopeOverrides["colour"]>, default: undefined },
    tokens: { type: Object as PropType<ScopeOverrides["tokens"]>, default: undefined },
    /** Opt-in sound and haptics for the subtree's Instrument controls. */
    feedback: { type: Object as PropType<ScopeOverrides["feedback"]>, default: undefined },
    /** The theme in effect, for ranges and contrast checks. */
    base: { type: Object as PropType<StrataTheme>, default: undefined },
    report: { type: String as PropType<ReportMode>, default: "error" },
  },
  setup(props, { slots }) {
    return () => {
      const { depth, theme, density, size, level, material, colour, tokens, feedback } = props;
      const resolved = resolveStrataScope({ depth, theme, density, size, level, material, colour, tokens, feedback }, props.base);
      report(resolved.issues, props.report, "scope");
      return h("div", { ...Object.fromEntries(resolved.attributes), style: Object.fromEntries(resolved.properties) }, slots.default?.());
    };
  },
});
