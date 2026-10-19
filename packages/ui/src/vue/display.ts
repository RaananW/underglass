/**
 * Panel, Card, Divider, Badge, Spinner and ProgressBar for Vue 3 (anatomy pages `panel.md`, `card.md`, `divider.md`,
 * `badge.md`, `spinner.md`, `progress-bar.md`). Attributes fall through to the root element. Badge, Spinner and ProgressBar take an
 * indicator form through `form` (`led`, `ring`, `meter`; anatomy pages, *Indicator form*): the same native element with LED lenses drawn over it;
 * `flush`, or no `form`, is the look they had before.
 */
import { computed, defineComponent, h, onMounted, onUpdated, useId, type PropType } from "vue";
import { attachStrataProgress } from "../dom/progress.ts";
import { badgeForm, badgeLensMarkup, lensStyle, progressForm, progressFraction, progressSegmentCount, progressSegments, progressStyle, spinnerForm, spinnerLensIndices } from "../shared/indicator-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { PANEL_TRAY_CLASS, surfaceForm, type StrataSurfaceForm } from "../shared/structure-forms.ts";
import { classes, splitAttrs, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

type Elevation = "ground" | "raised" | "floating" | "overlay" | "modal";

const headingId = (given: string | undefined, generated: string, prefix: string) => given ?? `${prefix}-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`;

export const Panel = defineComponent({
  name: "StrataPanel",
  props: {
    /** A visible title: a heading that names the panel, which makes it a `region` landmark. */
    title: { type: String, default: undefined },
    titleLevel: { type: Number as PropType<2 | 3 | 4 | 5 | 6>, default: 2 },
    titleId: { type: String, default: undefined },
    elevation: { type: String as PropType<Elevation>, default: "floating" },
    /** `plate`: a machined plate. `tray`: the content sits in a recessed tray. `flush` or none: the panel of before. */
    form: { type: String as PropType<StrataSurfaceForm | "flush">, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    const generated = useId();
    const id = computed(() => headingId(props.titleId, generated, "panel-title"));
    return () => {
      const formed = surfaceForm(props.form);
      return h("section", {
        class: "ug-panel", "data-strata-face": "raised", "data-strata-elevation": props.elevation,
        "aria-labelledby": props.title !== undefined ? id.value : undefined, ...(formed ? { "data-strata-form": formed } : {}), ...strataAttributes(props),
      }, [props.title !== undefined && h(`h${props.titleLevel}`, { id: id.value }, props.title),
        formed === "tray" ? h("div", { class: PANEL_TRAY_CLASS, "data-strata-face": "well" }, slots.default?.()) : slots.default?.()]);
    };
  },
});

export const Card = defineComponent({
  name: "StrataCard",
  props: {
    title: { type: String, default: undefined },
    titleLevel: { type: Number as PropType<2 | 3 | 4 | 5 | 6>, default: 3 },
    titleId: { type: String, default: undefined },
    as: { type: String as PropType<"article" | "section" | "div">, default: "article" },
    /** `plate`: a machined plate. `tray`: the body sits in a recessed tray. `flush` or none: the card of before. */
    form: { type: String as PropType<StrataSurfaceForm | "flush">, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    const generated = useId();
    const id = computed(() => headingId(props.titleId, generated, "card-title"));
    return () => {
      const formed = surfaceForm(props.form);
      return h(props.as, {
        class: "ug-card", "data-strata-face": "raised", "aria-labelledby": props.title !== undefined ? id.value : undefined, ...(formed ? { "data-strata-form": formed } : {}), ...strataAttributes(props),
      }, [
        props.title !== undefined && h(`h${props.titleLevel}`, { id: id.value, class: "ug-card__title" }, props.title),
        h("div", { class: "ug-card__body", ...(formed === "tray" ? { "data-strata-face": "well" } : {}) }, slots.default?.()),
        slots.footer && h("div", { class: "ug-card__footer" }, slots.footer()),
      ]);
    };
  },
});

export const Divider = defineComponent({
  name: "StrataDivider",
  props: { orientation: { type: String as PropType<"horizontal" | "vertical">, default: "horizontal" } },
  setup(props) {
    return () => {
      const vertical = props.orientation === "vertical";
      return h("hr", { class: classes("ug-divider", vertical && "ug-divider--vertical"), "data-strata-face": "groove", "aria-orientation": vertical ? "vertical" : undefined });
    };
  },
});

export const Badge = defineComponent({
  name: "StrataBadge",
  props: {
    variant: { type: String as PropType<"neutral" | "accent" | "success" | "warning" | "danger" | "info">, default: "neutral" },
    /** A number shown instead of the slot; above `max` it reads "99+", with the full number visually hidden. */
    count: { type: Number, default: undefined },
    max: { type: Number, default: 99 },
    /** `led`: an LED pill, the StatusLight's lens before the text, in the variant's colour; `flush`, or absent, is today's pill. */
    form: { type: String as PropType<"led" | "flush">, default: undefined },
  },
  setup(props, { slots }) {
    return () => {
      const led = badgeForm(props.form);
      const content = props.count === undefined ? slots.default?.()
        : props.count > props.max ? [`${props.max}+`, h("span", { class: "ug-badge__full" }, ` (${props.count})`)]
          : String(props.count);
      return h("span", { class: classes("ug-badge", props.variant !== "neutral" && `ug-badge--${props.variant}`), "data-strata-face": "flat", ...(led ? { "data-strata-form": led } : {}) },
        led ? [h("span", { class: badgeLensMarkup.className, "data-strata-face": badgeLensMarkup.face, "aria-hidden": "true" }), content] : content);
    };
  },
});

const spinnerSizes = { small: "sm", medium: "md", large: "lg" } as const;

export const Spinner = defineComponent({
  name: "StrataSpinner",
  props: {
    /** Required: the live region's content, which screen readers announce. */
    label: { type: String, required: true },
    size: { type: String as PropType<"small" | "medium" | "large">, default: "medium" },
    showLabel: { type: Boolean, default: false },
    /** Inside a busy Button: no role, hidden from assistive technology. */
    decorative: { type: Boolean, default: false },
    /** `ring`: a ring of eight LEDs chasing at `chase.spinner` (steady under reduced motion); `flush`, or absent, is today's turning arc. */
    form: { type: String as PropType<"ring" | "flush">, default: undefined },
    /** The ring's colour: `accent` by default, or another status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
  },
  setup(props) {
    return () => {
      const ring = spinnerForm(props.form);
      return h("span", {
        class: classes("ug-spinner", `ug-spinner--${spinnerSizes[props.size]}`, props.showLabel && "ug-spinner--labelled"),
        role: props.decorative ? undefined : "status", "aria-hidden": props.decorative ? "true" : undefined,
        ...(ring ? { "data-strata-form": ring, ...(props.colour ? { "data-strata-colour": props.colour } : {}) } : { "data-strata-face": "ring" }),
      }, [
        ring ? h("span", { class: "ug-spinner__ring", "aria-hidden": "true" }, spinnerLensIndices.map(index => h("span", { key: index, class: "ug-spinner__lens", "data-strata-face": "knob", style: lensStyle(index) })))
          : h("span", { class: "ug-spinner__arc", "aria-hidden": "true" }),
        h("span", { class: "ug-spinner__label" }, props.label),
      ]);
    };
  },
});

export const ProgressBar = defineComponent({
  name: "StrataProgressBar",
  props: {
    /** Absent for an indeterminate bar. */
    value: { type: Number, default: undefined },
    max: { type: Number, default: 100 },
    /**
     * `meter`: a groove with a row of LED segments lit from the value, a lit head running along it while indeterminate; the native
     * `<progress>` stays the control. `flush`, or absent, is today's bar. With `meter`, `class` and `style` reach the wrapper.
     */
    form: { type: String as PropType<"meter" | "flush">, default: undefined },
    /** The number of segments of a `meter` bar; 20 by default (4 to 32). */
    segments: { type: Number, default: undefined },
    /** The segments' colour: `accent` by default, or another status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
  },
  inheritAttrs: false,
  setup(props, { attrs }) {
    const field = useFieldControl();
    // A segment meter's value reaches the drawing through `attachStrataProgress`, attached once; a changed `value` is all it takes.
    const attach = () => { if (progressForm(props.form)) attachStrataProgress(); };
    onMounted(attach);
    onUpdated(attach);
    return () => {
      const { id, "aria-describedby": describedBy } = field?.value ?? {};
      const meter = progressForm(props.form), { row, control } = splitAttrs(attrs);
      const native = (extra: Record<string, unknown>) => h("progress", {
        ...extra, ...(field ? { id, "aria-describedby": describedBy } : {}),
        ...(props.value !== undefined ? { "^value": String(props.value) } : {}), "^max": String(props.max), ...control,
      });
      if (!meter) return native({ class: classes("ug-progress", row.class as string), style: row.style, "data-strata-face": "groove" });
      const count = progressSegmentCount(props.segments);
      return h("span", { class: classes("ug-progress-bar", row.class as string), "data-strata-form": meter, ...(props.colour ? { "data-strata-colour": props.colour } : {}),
        style: [progressStyle(progressFraction(props.value, props.max), count), row.style as string] }, [
        native({ class: "ug-progress" }),
        h("span", { class: "ug-progress__object", "aria-hidden": "true" }, [
          h("span", { class: "ug-progress__window", "data-strata-face": "groove" }),
          h("span", { class: "ug-progress__segments" }, progressSegments(count).map(index => h("span", { key: index, class: "ug-progress__segment", "data-strata-face": "knob", style: lensStyle(index) }))),
        ]),
      ]);
    };
  },
});
