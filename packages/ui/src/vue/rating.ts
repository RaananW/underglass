/**
 * Rating and RatingDisplay for Vue 3 (anatomy page `rating.md`). `Rating` is native radios in a `<fieldset>` named by
 * its `<legend>`, one per score, each visually hidden over its star; use `v-model` (or `defaultValue`). `RatingDisplay`
 * is a read-only score, possibly fractional, as one image named by it. `form="lamps"` draws each star's place as a lamp lens (anatomy
 * page `rating.md`, *Indicator form*); `flush`, or no `form`, is the look it had before.
 */
import { defineComponent, h, useId, type PropType } from "vue";
import { ratingForm, ratingLampMarkup, ratingOwner } from "../shared/indicator-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { ratingItemLabel, ratingName, ratingStyle } from "../shared/rating.ts";
import { strataAttributes, strataProps } from "./shared.ts";

export const Rating = defineComponent({
  name: "StrataRating",
  props: {
    /** Names the group, as the `<legend>`. */
    label: { type: String, required: true },
    /** The highest score; 5 by default. */
    max: { type: Number, default: 5 },
    /** The radios' shared `name`; generated when absent. */
    name: { type: String, default: undefined },
    /** The score; use `v-model`. */
    modelValue: { type: Number, default: undefined },
    /** Initial score when uncontrolled. */
    defaultValue: { type: Number, default: undefined },
    /** Each star's name; "1 star", "2 stars" by default. */
    itemLabel: { type: Function as PropType<(score: number, max: number) => string>, default: undefined },
    /**
     * The form (anatomy page `rating.md`, *Indicator form*): `lamps`, the same radios with a lamp lens in each star's place, lit up to
     * the score; `flush`, or absent, is today's look. Any other string is the native `form` attribute of the fieldset, as before.
     */
    form: { type: String as PropType<"lamps" | "flush" | (string & {})>, default: undefined },
    /** The lit lenses' colour: `glowOn` (amber) by default, or a status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    ...strataProps,
  },
  emits: { "update:modelValue": (value: number) => typeof value === "number" },
  setup(props, { emit }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    return () => {
      const name = props.name ?? `rating-${generated}`;
      const scores = Array.from({ length: props.max }, (_, index) => index + 1);
      const lamps = ratingForm(props.form), owner = ratingOwner(props.form);
      return h("fieldset", { class: "ug-rating", ...strataAttributes(props), ...(lamps ? { "data-strata-form": lamps } : {}), ...(lamps && props.colour ? { "data-strata-colour": props.colour } : {}), ...(owner !== undefined ? { form: owner } : {}) }, [
        h("legend", { class: "ug-rating__legend" }, props.label),
        h("div", { class: "ug-rating__stars" }, scores.map(score => h("label", { key: score, class: "ug-rating__item" }, [
          h("input", {
            class: "ug-rating__input", type: "radio", name, value: String(score),
            // Controlled: the checked property. Uncontrolled: the checked attribute (the default score), as in HTML.
            ...(props.modelValue !== undefined ? { checked: props.modelValue === score } : props.defaultValue === score ? { "^checked": "" } : {}),
            onChange: (event: Event) => { if ((event.target as HTMLInputElement).checked) emit("update:modelValue", score); },
          }),
          h("span", { class: "ug-rating__star", "aria-hidden": "true" }, lamps ? ratingLampMarkup.map(part => h("span", { class: part.className, "data-strata-face": part.face })) : undefined),
          h("span", { class: "ug-rating__label" }, (props.itemLabel ?? ratingItemLabel)(score, props.max)),
        ]))),
      ]);
    };
  },
});

export const RatingDisplay = defineComponent({
  name: "StrataRatingDisplay",
  props: {
    value: { type: Number, required: true },
    /** The highest score, and the number of stars; 5 by default. */
    max: { type: Number, default: 5 },
    /** The image's name; "{value} out of {max} stars" by default. */
    label: { type: String, default: undefined },
  },
  setup(props) {
    return () => h("span", { class: "ug-rating-display", role: "img", "aria-label": props.label ?? ratingName(props.value, props.max), style: ratingStyle(props.value, props.max) });
  },
});
