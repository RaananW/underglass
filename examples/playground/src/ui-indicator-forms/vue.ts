/**
 * Strata indicator forms Vue check page (`ui-indicator-forms-vue.html`): `Rating`, `Badge`, `ProgressBar` and `Spinner` with their indicator
 * forms from `@underglass/ui/vue` in plain Vue, with no Underglass. It mirrors `ui-indicator-forms-react.html` element for element: the anatomy
 * pages' indicator examples, a `v-model` Rating with lamps, an uncontrolled one with a colour, a disabled one, a Rating whose `form` names a form
 * owner, Badges, a bar with a live value and an indeterminate one, Spinners, and the `?mode=` probes of the flush checks, exposed through
 * `window.strataIndicatorBinding` for `tests/browser/ui-indicator-forms-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, ref } from "vue";
import { Badge, ProgressBar, Rating, Spinner } from "@underglass/ui/vue";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");

const star = (score: number, checked = false) => `<label class="ug-rating__item"><input class="ug-rating__input" type="radio" name="score" value="${score}"${checked ? " checked" : ""}><span class="ug-rating__star" aria-hidden="true"></span><span class="ug-rating__label">${score} ${score === 1 ? "star" : "stars"}</span></label>`;
/** What the four controls were before the indicator forms: the contract markup of `rating.md`, `badge.md`, `progress-bar.md` and `spinner.md`. */
const legacy = `
  <fieldset class="ug-rating"><legend class="ug-rating__legend">Your rating</legend><div class="ug-rating__stars">${[1, 2, 3, 4, 5].map(score => star(score, score === 3)).join("")}</div></fieldset>
  <span class="ug-badge" data-strata-face="flat">3</span>
  <span class="ug-badge ug-badge--success" data-strata-face="flat">Active</span>
  <span class="ug-badge ug-badge--danger" data-strata-face="flat">99+<span class="ug-badge__full"> (120)</span></span>
  <progress class="ug-progress" data-strata-face="groove" aria-label="Upload" value="40" max="100"></progress>
  <progress class="ug-progress" data-strata-face="groove" aria-label="Waiting" max="100"></progress>
  <span class="ug-spinner ug-spinner--md ug-spinner--labelled" role="status" data-strata-face="ring"><span class="ug-spinner__arc" aria-hidden="true"></span><span class="ug-spinner__label">Loading</span></span>
  <span class="ug-spinner ug-spinner--sm" role="status" data-strata-face="ring"><span class="ug-spinner__arc" aria-hidden="true"></span><span class="ug-spinner__label">Saving</span></span>`.replace(/>\s+</g, "><");

const text = (value: string) => ({ default: () => value });

/** The same controls as `legacy`, through the bindings, with `form` as given (none, or `flush`). */
const flush = (form?: "flush") => [
  h(Rating, { form, label: "Your rating", name: "score", defaultValue: 3 }),
  h(Badge, { form }, text("3")),
  h(Badge, { form, variant: "success" }, text("Active")),
  h(Badge, { form, variant: "danger", count: 120 }),
  h(ProgressBar, { form, "aria-label": "Upload", value: 40 }),
  h(ProgressBar, { form, "aria-label": "Waiting" }),
  h(Spinner, { form, label: "Loading", showLabel: true }),
  h(Spinner, { form, label: "Saving", size: "small" }),
];

const App = defineComponent({
  setup() {
    const score = ref(3), value = ref<number | undefined>(40);
    window.strataIndicatorBinding = {
      score: () => score.value, setScore: next => { score.value = next; }, setValue: next => { value.value = next; }, changes: () => [...changes],
      refs: { get rating() { return document.getElementById("rate") as HTMLFieldSetElement; }, get bar() { return document.getElementById("p-live") as HTMLProgressElement; } },
    };
    return () => {
      if (mode === "legacy") return h("main", [h("div", { id: "probe", innerHTML: legacy })]);
      if (mode === "plain" || mode === "flush") return h("main", [h("div", { id: "probe" }, flush(mode === "flush" ? "flush" : undefined))]);
      return h("main", [
        h("div", { "data-contract": "rating.md#2", hidden: true }, [h(Rating, { form: "lamps", label: "Your rating", name: "score", max: 3, defaultValue: 2 })]),
        h("div", { "data-contract": "badge.md#2", hidden: true }, [h(Badge, { form: "led", variant: "success" }, text("Active"))]),
        h("div", { "data-contract": "progress-bar.md#2", hidden: true }, [h("label", { for: "upload" }, "Upload"), h(ProgressBar, { form: "meter", segments: 4, id: "upload", value: 40, max: 100 })]),
        h("div", { "data-contract": "spinner.md#2", hidden: true }, [h(Spinner, { form: "ring", label: "Loading" })]),
        h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Indicator forms" }, [
          h("form", { id: "owner-form" }),
          h(Rating, { form: "lamps", id: "rate", label: "Quality", name: "quality", class: "extra", style: { marginRight: "4px" }, "data-testid": "rate", modelValue: score.value,
            "onUpdate:modelValue": (next: number) => { changes.push(`rating:${next}`); score.value = next; } }),
          h(Rating, { form: "lamps", colour: "success", id: "rate-free", label: "Free", name: "free", defaultValue: 2 }),
          h(Rating, { form: "lamps", id: "rate-off", label: "Off", name: "off", defaultValue: 4, disabled: true }),
          h(Rating, { form: "owner-form", id: "rate-owned", label: "Owned", name: "owned" }),
          h(Rating, { id: "rate-plain", label: "Plain", name: "plain" }),
          h(Badge, { id: "b-count", form: "led", count: 7 }),
          h(Badge, { id: "b-ok", form: "led", variant: "success", class: "extra", style: { marginRight: "4px" } }, text("Active")),
          h(Badge, { id: "b-big", form: "led", variant: "danger", count: 120 }),
          h(Badge, { id: "b-flush", form: "flush", variant: "info" }, text("Plain")),
          h(ProgressBar, { id: "p-live", form: "meter", segments: 10, colour: "info", "aria-label": "Upload", value: value.value, class: "extra", style: { marginRight: "4px" }, "data-testid": "bar" }),
          h(ProgressBar, { id: "p-wait", form: "meter", "aria-label": "Waiting" }),
          h(ProgressBar, { id: "p-plain", "aria-label": "Plain", value: 20 }),
          h(Spinner, { id: "s-ring", form: "ring", label: "Loading results", showLabel: true, colour: "warning" }),
          h(Spinner, { id: "s-small", form: "ring", label: "Saving", size: "small" }),
          h(Spinner, { id: "s-flush", form: "flush", label: "Plain" }),
        ]),
        h("p", { id: "ind-read" }, `Quality ${score.value}, upload ${value.value ?? "unknown"}`),
      ]);
    };
  },
});

declare global {
  interface Window { strataIndicatorBinding: { score(): number; setScore(value: number): void; setValue(value: number | undefined): void; changes(): string[]; refs: { rating: HTMLFieldSetElement; bar: HTMLProgressElement } } }
}
createApp(App).mount("#root");
