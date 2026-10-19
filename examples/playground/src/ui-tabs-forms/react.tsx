/**
 * Strata Tabs forms React check page (`ui-tabs-forms-react.html`): `Tabs`, `TabList`, `Tab` and `TabPanel` from `@underglass/ui/react` with `form`,
 * in plain React, with no Underglass. A `[data-contract]` container renders the anatomy page's rail example (`tabs.md` section 11); the panel below holds
 * a controlled rail, an uncontrolled rail with a ref, `className`, `style` and an attribute, a rail with manual activation, a vertical rail, a flush
 * one, one whose `form` names nothing and one with `form="flush"`. `?mode=plain|flush|legacy` renders `#probe` instead: Tabs with no `form`, with
 * `form="flush"`, and as the contract markup they had before the form (the flush checks compare the three, pixel for pixel).
 * `window.strataTabsBinding` exposes the state for `tests/browser/ui-tabs-forms-bindings.test.mjs`; `ui-tabs-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tab, TabList, TabPanel, Tabs } from "@underglass/ui/react";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");
const bodies: Record<string, string> = { profile: "Your name and photo.", security: "Your password and two-step sign-in.", billing: "Your plan and invoices." };

function Parts({ label }: { label: string }) {
  return (
    <>
      <TabList label={label}><Tab value="profile">Profile</Tab><Tab value="security">Security</Tab><Tab value="billing" disabled>Billing</Tab></TabList>
      {Object.entries(bodies).map(([value, text]) => <TabPanel key={value} value={value}><p style={{ margin: 0 }}>{text}</p></TabPanel>)}
    </>
  );
}

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

function Probe() {
  return (
    <main>
      <section className="ug-panel" data-strata-face="raised" aria-label="Probe">
        {mode === "legacy" ? <div id="probe" dangerouslySetInnerHTML={{ __html: legacy }} />
          : <div id="probe">{mode === "flush" ? <Tabs id="legacy" form="flush" defaultValue="profile"><Parts label="Probe" /></Tabs> : <Tabs id="legacy" defaultValue="profile"><Parts label="Probe" /></Tabs>}</div>}
      </section>
    </main>
  );
}

function App() {
  const [value, setValue] = useState("profile");
  const ref = useRef<HTMLDivElement>(null);
  window.strataTabsBinding = { value: () => value, setValue, changes: () => [...changes], refs: { get root() { return ref.current!; } } };
  return (
    <main>
      <div data-contract="tabs.md#rail" hidden>
        <Tabs id="account" form="rail" defaultValue="profile">
          <TabList label="Account"><Tab value="profile">Profile</Tab><Tab value="security">Security</Tab><Tab value="billing" disabled>Billing</Tab></TabList>
          <TabPanel value="profile"><p>Your name and photo.</p></TabPanel>
          <TabPanel value="security"><p>Your password and two-step sign-in.</p></TabPanel>
          <TabPanel value="billing"><p>Your plan and invoices.</p></TabPanel>
        </Tabs>
      </div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Tabs forms">
        <Tabs id="acct" form="rail" value={value} onChange={next => { changes.push(next); setValue(next); }}><Parts label="Controlled" /></Tabs>
        <Tabs ref={ref} id="free" form="rail" defaultValue="security" className="extra" style={{ marginRight: "4px" }} data-testid="free"><Parts label="Uncontrolled" /></Tabs>
        <Tabs id="manual" form="rail" activation="manual" defaultValue="profile"><Parts label="Manual" /></Tabs>
        <Tabs id="side" form="rail" orientation="vertical" defaultValue="profile" size="small"><Parts label="Side" /></Tabs>
        <Tabs id="flat" form="flush" defaultValue="profile"><Parts label="Flat" /></Tabs>
        <Tabs id="plain" form="owner-form" defaultValue="profile"><Parts label="Plain" /></Tabs>
        <Tabs id="none" defaultValue="profile"><Parts label="None" /></Tabs>
      </section>
      <p id="tabs-read">Tab {value}</p>
    </main>
  );
}

declare global {
  interface Window { strataTabsBinding: { value(): string; setValue(value: string): void; changes(): string[]; refs: { root: HTMLDivElement } } }
}
createRoot(document.getElementById("root")!).render(mode ? <Probe /> : <App />);
