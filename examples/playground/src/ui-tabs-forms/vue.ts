/**
 * Strata Tabs forms Vue check page (`ui-tabs-forms-vue.html`): `Tabs`, `TabList`, `Tab` and `TabPanel` from `@underglass/ui/vue` with `form`, in plain
 * Vue, with no Underglass. It mirrors `ui-tabs-forms-react.html` element for element: the anatomy page's rail example (`tabs.md` section 11), a `v-model`
 * rail, an uncontrolled one with `class`, `style` and an attribute, a rail with manual activation, a vertical rail, a flush one, one whose `form` names nothing
 * and one with none, exposed through `window.strataTabsBinding` for `tests/browser/ui-tabs-forms-bindings.test.mjs`. `?mode=plain|flush|legacy` renders
 * `#probe` as the React page does.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, ref } from "vue";
import { Tab, TabList, TabPanel, Tabs } from "@underglass/ui/vue";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");
const bodies: Record<string, string> = { profile: "Your name and photo.", security: "Your password and two-step sign-in.", billing: "Your plan and invoices." };

const parts = (label: string) => [
  h(TabList, { label }, { default: () => [h(Tab, { value: "profile" }, { default: () => "Profile" }), h(Tab, { value: "security" }, { default: () => "Security" }), h(Tab, { value: "billing", disabled: true }, { default: () => "Billing" })] }),
  ...Object.entries(bodies).map(([value, text]) => h(TabPanel, { value }, { default: () => h("p", { style: { margin: 0 } }, text) })),
];

/** What the Tabs were before the form: the contract markup of `tabs.md`. */
const legacy = `
  <div class="ug-tabs" id="legacy">
    <div class="ug-tabs__list" role="tablist" aria-label="Probe">
      <span class="ug-tabs__rail" data-strata-face="groove" aria-hidden="true"></span>
      <button class="ug-tab" type="button" role="tab" id="legacy-tab-profile" aria-selected="true" aria-controls="legacy-panel-profile"><span class="ug-tab__label">Profile</span><span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span></button>
      <button class="ug-tab" type="button" role="tab" id="legacy-tab-security" aria-selected="false" aria-controls="legacy-panel-security" tabindex="-1"><span class="ug-tab__label">Security</span><span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span></button>
      <button class="ug-tab" type="button" role="tab" id="legacy-tab-billing" aria-selected="false" aria-controls="legacy-panel-billing" tabindex="-1" disabled><span class="ug-tab__label">Billing</span><span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span></button>
    </div>
    <div class="ug-tabs__panel" role="tabpanel" id="legacy-panel-profile" aria-labelledby="legacy-tab-profile" tabindex="0"><p style="margin:0">Your name and photo.</p></div>
    <div class="ug-tabs__panel" role="tabpanel" id="legacy-panel-security" aria-labelledby="legacy-tab-security" tabindex="0" hidden><p style="margin:0">Your password and two-step sign-in.</p></div>
    <div class="ug-tabs__panel" role="tabpanel" id="legacy-panel-billing" aria-labelledby="legacy-tab-billing" tabindex="0" hidden><p style="margin:0">Your plan and invoices.</p></div>
  </div>`;

const Probe = defineComponent({
  setup: () => () => h("main", [
    h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Probe" }, [
      mode === "legacy" ? h("div", { id: "probe", innerHTML: legacy })
        : h("div", { id: "probe" }, [h(Tabs, { id: "legacy", defaultValue: "profile", ...(mode === "flush" ? { form: "flush" } : {}) }, { default: () => parts("Probe") })]),
    ]),
  ]),
});

const App = defineComponent({
  setup() {
    const value = ref("profile");
    window.strataTabsBinding = { value: () => value.value, setValue: next => { value.value = next; }, changes: () => [...changes], refs: { get root() { return document.querySelector('[data-testid="free"]') as HTMLDivElement; } } };
    return () => h("main", [
      h("div", { "data-contract": "tabs.md#rail", hidden: true }, [h(Tabs, { id: "account", form: "rail", defaultValue: "profile" }, { default: () => [
        h(TabList, { label: "Account" }, { default: () => [h(Tab, { value: "profile" }, { default: () => "Profile" }), h(Tab, { value: "security" }, { default: () => "Security" }), h(Tab, { value: "billing", disabled: true }, { default: () => "Billing" })] }),
        h(TabPanel, { value: "profile" }, { default: () => h("p", "Your name and photo.") }),
        h(TabPanel, { value: "security" }, { default: () => h("p", "Your password and two-step sign-in.") }),
        h(TabPanel, { value: "billing" }, { default: () => h("p", "Your plan and invoices.") })] })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Tabs forms" }, [
        h(Tabs, { id: "acct", form: "rail", modelValue: value.value, "onUpdate:modelValue": (next: string) => { changes.push(next); value.value = next; } }, { default: () => parts("Controlled") }),
        h(Tabs, { id: "free", form: "rail", defaultValue: "security", class: "extra", style: { marginRight: "4px" }, "data-testid": "free" }, { default: () => parts("Uncontrolled") }),
        h(Tabs, { id: "manual", form: "rail", activation: "manual", defaultValue: "profile" }, { default: () => parts("Manual") }),
        h(Tabs, { id: "side", form: "rail", orientation: "vertical", defaultValue: "profile", size: "small" }, { default: () => parts("Side") }),
        h(Tabs, { id: "flat", form: "flush", defaultValue: "profile" }, { default: () => parts("Flat") }),
        h(Tabs, { id: "plain", form: "owner-form", defaultValue: "profile" }, { default: () => parts("Plain") }),
        h(Tabs, { id: "none", defaultValue: "profile" }, { default: () => parts("None") }),
      ]),
      h("p", { id: "tabs-read" }, `Tab ${value.value}`),
    ]);
  },
});

declare global {
  interface Window { strataTabsBinding: { value(): string; setValue(value: string): void; changes(): string[]; refs: { root: HTMLDivElement } } }
}
createApp(mode ? Probe : App).mount("#root");
