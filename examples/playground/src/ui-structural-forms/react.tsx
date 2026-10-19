/**
 * Strata structural forms React check page (`ui-structural-forms-react.html`): `Slider`, `Card`, `Panel`, `Dialog` and `Drawer` from
 * `@underglass/ui/react` with `form`, in plain React, with no Underglass. `[data-contract]` containers render the anatomy pages'
 * form examples (`slider.md#2` and `#3`, `card.md#2` and `#3`, `panel.md#2` and `#3`, and the Dialog's and Drawer's third examples
 * once opened); the panel below holds a controlled knob slider, an uncontrolled fader with a ref, `className`, `style` and an attribute,
 * a slider in a Field, a slider whose `form` names its form owner, plate and tray Cards and Panels, and the Dialog and Drawer, opened by
 * `window.strataStructureBinding.open("dialog" | "drawer" | "none")`; `contracts(true)` opens the Dialog and the Drawer of `dialog.md#3` and `drawer.md#3`.
 * `?mode=plain|flush|legacy` renders `#probe` instead: a Slider, a Card and a Panel with no `form`, with `form="flush"`, and as the contract
 * markup they had before the forms (the flush checks compare the three, pixel for pixel).
 * `window.strataStructureBinding` exposes the state for `tests/browser/ui-structural-forms-bindings.test.mjs`;
 * `ui-structural-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Card, Dialog, Drawer, Field, Panel, Slider } from "@underglass/ui/react";

const changes: number[] = [];
const mode = new URLSearchParams(location.search).get("mode");

/** What the three controls were before the forms: the contract markup of `slider.md`, `card.md` and `panel.md`. */
const legacy = `
  <input type="range" class="ug-slider" data-strata-face="groove" min="0" max="100" step="1" value="40" aria-label="Mix">
  <article class="ug-card" data-strata-face="raised" aria-labelledby="card-title"><h3 class="ug-card__title" id="card-title">Card</h3><div class="ug-card__body"><p>Body</p></div><div class="ug-card__footer"><button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Save</span></button></div></article>
  <section class="ug-panel" data-strata-face="raised" data-strata-elevation="floating" aria-labelledby="panel-title"><h2 id="panel-title">Panel</h2><p>Content</p></section>`.replace(/>\s+</g, "><");

/** The same controls as `legacy`, through the bindings, with `form` as given (none, or `flush`). */
function Flush({ form }: { form?: "flush" }) {
  return (
    <>
      <Slider form={form} aria-label="Mix" min={0} max={100} step={1} defaultValue={40} />
      <Card form={form} title="Card" footer={<button type="button" className="ug-button" data-strata-face="raised"><span className="ug-button__label">Save</span></button>}><p>Body</p></Card>
      <Panel form={form} title="Panel"><p>Content</p></Panel>
    </>
  );
}

function App() {
  const [drive, setDrive] = useState(40);
  const [shown, setShown] = useState<"dialog" | "drawer" | "none">("none"), [contracts, setContracts] = useState(false);
  const [dialogHost, setDialogHost] = useState<HTMLElement | null>(null), [drawerHost, setDrawerHost] = useState<HTMLElement | null>(null);
  const knob = useRef<HTMLInputElement>(null), fader = useRef<HTMLInputElement>(null), card = useRef<HTMLElement>(null), panel = useRef<HTMLElement>(null);
  useEffect(() => {
    window.strataStructureBinding = { drive: () => drive, setDrive, changes: () => [...changes], open: setShown, contracts: setContracts, refs: { knob: knob.current!, fader: fader.current!, card: card.current!, panel: panel.current! } };
  });
  if (mode === "legacy") return <main><div id="probe" dangerouslySetInnerHTML={{ __html: legacy }} /></main>;
  if (mode === "plain" || mode === "flush") return <main><div id="probe"><Flush form={mode === "flush" ? "flush" : undefined} /></div></main>;
  return (
    <main>
      <div data-contract="slider.md#2" hidden><Slider form="knob" id="drive-example" name="drive" aria-label="Drive" marks={[0, 50, 100]} defaultValue={40} /></div>
      <div data-contract="slider.md#3" hidden><Slider form="fader" id="trim-example" name="trim" aria-label="Trim" min={-12} max={12} step={6} detents={5} marks={[-12, 0, 12]} defaultValue={0} unit=" dB" /></div>
      <div data-contract="card.md#2" hidden><Card form="plate" titleId="plate-card-title" title="Plate">A machined plate.</Card></div>
      <div data-contract="card.md#3" hidden><Card form="tray" titleId="tray-card-title" title="Tray">The body sits in a tray.</Card></div>
      <div data-contract="panel.md#2" hidden><Panel form="plate" titleId="plate-panel-title" title="Plate">Content</Panel></div>
      <div data-contract="panel.md#3" hidden><Panel form="tray" titleId="tray-panel-title" title="Tray">Content</Panel></div>
      <div data-contract="dialog.md#3" ref={setDialogHost}>
        <Dialog open={contracts} container={dialogHost} form="plate" title="Discard changes?" titleId="discard-title" description="Your edits will be lost." descriptionId="discard-description" actions={<Button data-strata-close="">Keep editing</Button>} />
      </div>
      <div data-contract="drawer.md#3" ref={setDrawerHost}>
        <Drawer open={contracts} container={drawerHost} form="tray" title="Filters" titleId="filters-title" description="Narrow the list." descriptionId="filters-description" actions={<Button data-strata-close="">Done</Button>} />
      </div>
      <form id="owner" aria-label="Owner" />
      <section className="ug-panel" data-strata-face="raised" aria-label="Structural forms" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 20 }}>
        <Slider form="knob" id="drive" name="drive" aria-label="Drive" marks={[0, 50, 100]} value={drive} onChange={event => { changes.push(Number(event.target.value)); setDrive(Number(event.target.value)); }} unit="%" />
        <Slider form="fader" id="trim" ref={fader} aria-label="Trim" min={-12} max={12} step={6} detents={5} defaultValue={0} unit=" dB" className="extra" style={{ marginRight: 4 }} data-testid="trim" />
        <Field help="Mixes the dry signal."><Slider form="knob" id="wet" ref={knob} min={0} max={10} defaultValue={3} size="small" /></Field>
        <Slider form="owner" id="owned" name="owned" aria-label="Owned" min={0} max={10} defaultValue={5} />
        <Slider form="flush" id="flat" aria-label="Flat" defaultValue={60} />
        <Card form="plate" ref={card} id="card-plate" title="Plate card" className="extra" style={{ marginRight: 4 }} data-testid="card" footer={<button type="button" className="ug-button" data-strata-face="raised"><span className="ug-button__label">Save</span></button>}>A machined plate.</Card>
        <Card form="tray" id="card-tray" title="Tray card">The body sits in a tray.</Card>
        <Card form="flush" id="card-flush" title="Flush card">The card of before.</Card>
        <Panel form="plate" ref={panel} id="panel-plate" title="Plate panel" className="extra" style={{ marginRight: 4 }} data-testid="panel"><p>Content</p></Panel>
        <Panel form="tray" id="panel-tray" title="Tray panel"><p>Content</p></Panel>
        <Panel form="flush" id="panel-flush" title="Flush panel"><p>Content</p></Panel>
      </section>
      <p id="drive-read">Drive {drive}%</p>
      <Dialog open={shown === "dialog"} onClose={() => setShown("none")} form="plate" title="Output stage" id="dialog-plate" data-testid="dialog" actions={<button type="button" className="ug-button" data-strata-face="raised" data-strata-close onClick={() => setShown("none")}><span className="ug-button__label">Close</span></button>}>
        <Slider form="knob" id="dialog-level" aria-label="Level" marks={[0, 10]} min={0} max={10} defaultValue={4} />
      </Dialog>
      <Drawer open={shown === "drawer"} onClose={() => setShown("none")} form="tray" side="end" title="Channel" id="drawer-tray" data-testid="drawer" closeOnScrim actions={<button type="button" className="ug-button" data-strata-face="raised" onClick={() => setShown("none")}><span className="ug-button__label">Done</span></button>}>
        <Slider form="fader" id="drawer-gain" aria-label="Gain" min={0} max={10} defaultValue={3} />
      </Drawer>
    </main>
  );
}

declare global {
  interface Window { strataStructureBinding: { drive(): number; setDrive(value: number): void; changes(): number[]; open(which: "dialog" | "drawer" | "none"): void; contracts(open: boolean): void; refs: { knob: HTMLInputElement; fader: HTMLInputElement; card: HTMLElement; panel: HTMLElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
