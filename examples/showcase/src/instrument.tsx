/**
 * Example 10, the Instrument gallery (`#/instrument`): every Instrument component on main in its premium form, grouped as the
 * plan's catalogue groups them (wave 1, wave 2, wave 3, the everyday forms), and one showpiece, a synthesiser voice, on panels
 * that are direct children of the Underglass root. `useStrataGpu` presents them on the GPU; with GPU off, or at the CSS level,
 * they keep the CSS presentation.
 *
 * The bar's switches are scopes on the root, which the helper observes, so nothing is re-enrolled: the level (CSS, Relief,
 * Objects, Instrument) is `data-strata-level` (CSS leaves the helper out), the theme `data-strata-theme`, and the character
 * `data-strata-character` on the document element (the room, `studio.*`, is the application's). The pointer light is
 * `pointer-light.ts`, a wrapper round the controller the helper is given. The stage is fluid (see `.stage-fluid`), so the page
 * reflows down to 320 px.
 *
 * The panels in play are the wall (a decorative layer), the bar, and one of the content panels, so the stage holds three layers
 * and the parts and emitters of one panel at a time: the notes tab states the totals.
 */
import "@underglass/ui/css";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { useGPUHost, useSurfaceRef } from "@underglass/react";
import { useSceneArt } from "./scene";
import {
  Badge, Button, ButtonGroup, Card, Checkbox, Dialog, Drawer, Display, Fader, Gauge, JogWheel, Keypad, KeypadKey, Knob, Lamp, Link, Meter, Pad, PadGrid, Panel, PatchBay, PatchPoint,
  ProgressBar, Radio, RadioGroup, Rating, RotarySelector, SegmentedControl, Select, Slider, Spinner, StatusLight, Switch, Tab, TabList, TabPanel, Tabs, TextField, ToggleButton, useStrataGpu,
} from "@underglass/ui/react";
import { pointerLight, type PointerLight } from "./pointer-light";
import { attachCssLevel } from "./css-level";
import { strataScene } from "@underglass/ui/gpu";
import { stageOf } from "@underglass/ui/dom";

export const levels = [["css", "CSS"], ["relief", "Relief"], ["objects", "Objects"], ["instrument", "Instrument"]] as const;
export type InstrumentLevel = typeof levels[number][0];
export const themes = [["light", "Light"], ["dark", "Dark"]] as const;
export type InstrumentTheme = typeof themes[number][0];
export const characters = [["premium", "Premium"], ["studio", "Studio"], ["hifi", "Hi-fi"], ["playful", "Playful"]] as const;
export type InstrumentCharacter = typeof characters[number][0];
export const tabs = [["showpiece", "Synthesiser"], ["wave1", "Wave 1"], ["wave2", "Wave 2"], ["wave3", "Wave 3"], ["everyday", "Everyday forms"], ["inputs", "Input forms"], ["notes", "Notes"]] as const;
export type InstrumentTab = typeof tabs[number][0];

/**
 * Whether the screen is a phone's (480 px or less): the few components with a width of their own (a meter's segments, a needle's dial, a horizontal
 * fader's travel) take a smaller size or fewer parts, so every panel's content fits the stage at 320 px.
 */
function useCompact() {
  return useSyncExternalStore(listener => {
    const query = matchMedia("(max-width: 480px)");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, () => matchMedia("(max-width: 480px)").matches, () => false);
}

/** The anatomy pages, on the repository (the showcase is a public site; the docs live next to the code). */
const docs = (page: string) => { const [name, anchor] = page.split("#"); return `https://github.com/RaananW/underglass/blob/main/docs/ui-library/components/${name}.md${anchor ? `#${anchor}` : ""}`; };

/** One catalogue entry: its name, one line, the native control it is, its anatomy page and a live instance. */
function Entry({ id, name, summary, native, page, children }: { id: string; name: string; summary: string; native: ReactNode; page: string; children: ReactNode }) {
  return <section className="ig-entry" id={`ig-entry-${id}`} aria-labelledby={`ig-entry-${id}-name`}>
    <h3 id={`ig-entry-${id}-name`}>{name}</h3>
    <p className="ig-summary">{summary}</p>
    <p className="ig-native">Native: {native}. <Link href={docs(page)} target="_blank" rel="noreferrer">Anatomy page</Link></p>
    <div className="ig-live">{children}</div>
  </section>;
}

/** The decorative wall the panels stand on: the stage colour, in the root's theme, as a layer of its own under everything. */
function Wall() {
  const ref = useSurfaceRef<HTMLDivElement>({ id: "instrument-wall", decorative: true });
  return <div ref={ref} className="ig-wall" aria-hidden="true" inert style={{ pointerEvents: "none" }} />;
}

/** The whole page: the bar (switches and tabs) and one content panel on the wall. */
export function InstrumentGallery() {
  const real = useGPUHost();
  // No art for this example: its slot shrinks to one empty pixel, as the Strata gallery's does.
  useSceneArt(() => ({ layout: { x: 0, y: 0, width: 1, height: 1, overflow: "hidden" }, content: null }), []);
  const [level, setLevel] = useState<InstrumentLevel>("instrument");
  const [theme, setTheme] = useState<InstrumentTheme>("light");
  const [character, setCharacter] = useState<InstrumentCharacter>("premium");
  const [pointer, setPointer] = useState(true);
  const [tab, setTab] = useState<InstrumentTab>("showpiece");
  const [light, setLight] = useState<PointerLight>();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  // The pointer light wraps the controller the helper is given, so it is in every scene the helper sets.
  useEffect(() => {
    const created = pointerLight(real);
    setLight(created);
    return () => created.dispose();
  }, [real]);
  useEffect(() => { light?.enable(pointer); }, [light, pointer]);
  // At the CSS level the helper is left out, and the panels are plain layers with the CSS presentation (`css-level.ts`): the compositor stays on.
  const strata = useStrataGpu(level === "css" || !light ? null : light.controller, { panels: ".ug-panel" });
  useEffect(() => (level === "css" && root ? attachCssLevel(real) : undefined), [level, root, real]);
  // The root, read once the runtime has mounted (`container` throws during the first render).
  useEffect(() => {
    let element: HTMLElement | undefined;
    queueMicrotask(() => { element = real.container; setRoot(element); });
    return () => { element?.removeAttribute("data-strata-level"); element?.removeAttribute("data-strata-theme"); };
  }, [real]);
  useEffect(() => {
    if (level === "css") root?.removeAttribute("data-strata-level"); else root?.setAttribute("data-strata-level", level);
    root?.setAttribute("data-strata-theme", theme);
  }, [root, level, theme]);
  // The character is the application's (the room is declared on the document element), and goes when the example does.
  useEffect(() => {
    if (character !== "premium") document.documentElement.setAttribute("data-strata-character", character); else document.documentElement.removeAttribute("data-strata-character");
    return () => document.documentElement.removeAttribute("data-strata-character");
  }, [character]);
  // The stage's height is the panels' (the canvas, and so the content in it, cannot size itself from the content): measured as the panels
  // resize or change, written as a custom property on the stage.
  useEffect(() => {
    const stage = root?.closest<HTMLElement>(".stage");
    if (!root || !stage) return;
    const panels = () => root.querySelectorAll<HTMLElement>(":scope > .ig-bar, :scope > .ig-content");
    const measure = () => {
      let bottom = 0;
      for (const panel of panels()) bottom = Math.max(bottom, panel.offsetTop + panel.offsetHeight);
      stage.style.setProperty("--ig-stage-height", `${Math.ceil(bottom + 16)}px`);
    };
    const observer = new ResizeObserver(measure);
    for (const panel of panels()) observer.observe(panel);
    observer.observe(stage);
    measure();
    return () => { observer.disconnect(); stage.style.removeProperty("--ig-stage-height"); };
  }, [root, tab]);
  Object.assign(window, { instrumentGallery: {
    level, theme, character, tab, pointer, budgets, materials,
    scene: (element: HTMLElement) => strata.current?.scene(element), diagnostics: (element: HTMLElement) => strata.current?.diagnostics(element), refresh: () => strata.current?.refresh(), light: () => light?.stats(),
    setLevel, setTheme, setCharacter, setPointer, setTab, build: (element: HTMLElement) => strataScene(element, { level: "instrument" }),
  } });
  const content = tab === "showpiece" ? <Synth />
    : tab === "wave1" ? <WaveOne />
      : tab === "wave2" ? <WaveTwo />
        : tab === "wave3" ? <WaveThree />
          : tab === "everyday" ? <Everyday onDialog={() => setDialog(true)} onDrawer={() => setDrawer(true)} />
            : tab === "inputs" ? <InputForms />
              : <Notes />;
  return <>
    <Wall />
    <Panel id="ig-bar" className="ig-bar" title="Instrument" form="plate" aria-describedby="ig-bar-lede">
      <p id="ig-bar-lede" className="ig-lede">Strata's third level: every control is still the native element, drawn as a machined object lit by one key light.
        Choose how it is presented, the theme, the character and the pointer light; then pick a group of components or the synthesiser.</p>
      <div className="ig-switches">
        <ButtonGroup label="Presentation level">
          {levels.map(([value, label]) => <ToggleButton key={value} id={`ig-level-${value}`} pressed={level === value} onPressedChange={() => setLevel(value)}>{label}</ToggleButton>)}
        </ButtonGroup>
        <ButtonGroup label="Theme">
          {themes.map(([value, label]) => <ToggleButton key={value} id={`ig-theme-${value}`} pressed={theme === value} onPressedChange={() => setTheme(value)}>{label}</ToggleButton>)}
        </ButtonGroup>
        <ButtonGroup label="Character">
          {characters.map(([value, label]) => <ToggleButton key={value} id={`ig-character-${value}`} pressed={character === value} onPressedChange={() => setCharacter(value)}>{label}</ToggleButton>)}
        </ButtonGroup>
        <ToggleButton id="ig-pointer" pressed={pointer} onPressedChange={setPointer}>Pointer light</ToggleButton>
      </div>
      <Tabs id="ig-tabs" value={tab} onChange={value => setTab(value as InstrumentTab)}>
        <TabList label="Instrument groups">
          {tabs.map(([value, label]) => <Tab key={value} value={value}>{label}</Tab>)}
        </TabList>
      </Tabs>
    </Panel>
    {content}
    {root && <Dialog open={dialog} onClose={() => setDialog(false)} container={root} form="plate" title="Output stage" description="A machined plate that rises out of the chassis." id="ig-dialog"
      actions={<><Button onClick={() => setDialog(false)}>Cancel</Button><Button variant="accent" onClick={() => setDialog(false)}>Apply</Button></>} />}
    {root && <Drawer open={drawer} onClose={() => setDrawer(false)} container={root} form="tray" side="end" closeOnScrim title="Channel" description="A tray that slides out of the chassis edge."
      id="ig-drawer" actions={<Button variant="accent" onClick={() => setDrawer(false)}>Done</Button>}>
      <Slider form="fader" aria-label="Gain" min={0} max={10} defaultValue={3} />
    </Drawer>}
  </>;
}

/**
 * One panel of a group: a layer of its own. A scene holds at most 16 materials (core's `INSTRUMENT_MATERIALS`) and every component brings
 * its own (a knob four, a fader three, the switch forms eight, a meter its glass and a lens per zone colour), so a group is split into
 * panels that fit, and each is a plate. The first panel of a tab is the tab's panel (`aria-controls`), the others are regions.
 */
function Unit({ id, title, tab, wide, form = "plate", children }: { id: string; title: string; tab?: InstrumentTab; wide?: boolean; form?: "plate" | "tray"; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  // A presented layer is never removed while it is enrolled: the panel is let go before React takes it out (a tab changes the set of panels).
  useLayoutEffect(() => {
    const element = panel.current;
    return () => { if (element) stageOf(element)?.withdraw(element); };
  }, []);
  return <Panel ref={panel} id={tab ? `ig-tabs-panel-${tab}` : id} className={`ig-content ig-${id}${wide ? " ig-wide" : ""}`} title={title} form={form} {...(tab ? { role: "tabpanel", "aria-labelledby": `ig-tabs-tab-${tab}` } : {})}>
    {children}
  </Panel>;
}

// ---- Wave 1 ----

function WaveOne() {
  const [volume, setVolume] = useState(62);
  const compact = useCompact();
  return <>
    <Unit id="w1-dials" tab="wave1" title="Knob and Fader">
      <div className="ig-grid">
        <Entry id="knob" name="Knob" summary="A machined cylinder: a chamfered cap with a pointer, a skirt, the scale printed on the faceplate. Drag, click the ring, tap the cap or use the keys."
          native={<code>&lt;input type="range"&gt;</code>} page="knob">
          <Knob id="ig-volume" label="Volume" min={0} max={100} marks={[0, 50, 100]} unit="%" value={volume} onValueChange={setVolume} />
          <Knob id="ig-gain" label="Gain" min={-12} max={12} detents={5} marks={[-12, 0, 12]} unit=" dB" defaultValue={0} />
        </Entry>
        <Entry id="fader" name="Fader" summary="A slot in the faceplate with a capped carriage and a printed scale: vertical or horizontal, optionally with detents."
          native={<code>&lt;input type="range"&gt;</code>} page="fader">
          <Fader id="ig-trim" label="Trim" travel={110} min={-12} max={12} marks={[-12, 0, 12]} unit=" dB" defaultValue={3} />
          <Fader id="ig-pan" label="Pan" orientation="horizontal" travel={compact ? 70 : 120} min={-50} max={50} detents={5} marks={[-50, 0, 50]} defaultValue={0} />
        </Entry>
      </div>
    </Unit>
    <Unit id="w1-switches" title="Switches">
      <div className="ig-grid">
        <Entry id="switch" name="Switch forms" summary="The same switch as hardware: a flush slide, a rocker on a pivot, a bat lever that snaps over centre and a wall plate with a paddle."
          native={<code>&lt;input type="checkbox" role="switch"&gt;</code>} page="switch">
          <div className="ig-row">
            <Switch form="slide" id="ig-slide" defaultChecked>Slide</Switch>
            <Switch form="rocker" id="ig-rocker">Rocker</Switch>
            <Switch form="bat" id="ig-bat">Bat</Switch>
            <Switch form="wall" id="ig-wall-switch" defaultChecked>Wall</Switch>
          </div>
        </Entry>
      </div>
    </Unit>
  </>;
}

// ---- Wave 2 ----

function WaveTwo() {
  const compact = useCompact();
  return <>
    <Unit id="w2-lights" tab="wave2" title="Lamps, lights and meters">
      <div className="ig-grid">
        <Entry id="lamp" name="Lamp" summary="A lens on a bezel: a dark glass dome off, glowing and lighting the faceplate on. A momentary lamp is lit while it is held."
          native={<code>&lt;input type="checkbox" role="switch"&gt;</code>} page="lamp">
          <div className="ig-row">
            <Lamp id="ig-lamp-hold">Hold</Lamp>
            <Lamp id="ig-lamp-ready" colour="success" defaultChecked>Ready</Lamp>
            <Lamp id="ig-lamp-talk" colour="danger" momentary>Talk</Lamp>
          </div>
        </Entry>
        <Entry id="status-light" name="StatusLight" summary="A small lens that shows a state, named by its label: a colour from a status role, a tempo for a blink (steady under reduced motion)."
          native={<><code>&lt;span role="img"&gt;</code> or <code>&lt;output&gt;</code></>} page="status-light">
          <div className="ig-row">
            <StatusLight colour="success" label="Online" showLabel />
            <StatusLight colour="warning" label="Charging" blink="slow" showLabel />
            <StatusLight colour="danger" label="Fault" showLabel />
            <StatusLight colour="success" label="Idle" lit={false} showLabel />
          </div>
        </Entry>
        <Entry id="meter" name="Meter" summary="A bar of LED segments under glass with a printed scale, or a needle on an arc. The zones come from low, high and optimum."
          native={<code>&lt;meter&gt;</code>} page="meter">
          <div className="ig-row">
            <Meter id="ig-meter-bar" label="Level" value={72} min={0} max={100} low={60} high={85} optimum={30} peak segments={compact ? 10 : 16} marks={[0, 50, 100]} unit="%" />
            <Meter id="ig-meter-needle" form="needle" size={compact ? "small" : undefined} label="Drive" value={40} min={0} max={100} low={30} high={80} optimum={20} marks={[0, 50, 100]} unit="%" />
          </div>
        </Entry>
        <Entry id="gauge" name="Gauge" summary="A round dial under glass: a needle on a printed arc, a red zone below low and above high, the needle damped on a spring."
          native={<code>&lt;meter&gt;</code>} page="gauge">
          <Gauge id="ig-gauge" size={compact ? "small" : undefined} label="Pressure" value={64} min={0} max={100} low={20} high={80} marks={[0, 50, 100]} unit=" psi" />
        </Entry>
      </div>
    </Unit>
    <Unit id="w2-controls" title="Selector, buttons and displays">
      <div className="ig-grid">
        <Entry id="rotary" name="RotarySelector" summary="A knob with a pointer over a ring of printed positions, one detent for each option. The native popup stays in the overlay host."
          native={<code>&lt;select&gt;</code>} page="rotary-selector">
          <RotarySelector id="ig-rotary" label="Mode" defaultValue="mid" options={[{ value: "off", label: "Off" }, { value: "low", label: "Low" }, { value: "mid", label: "Mid" }, { value: "high", label: "High" }]} />
        </Entry>
        <Entry id="push" name="PushButton forms" summary="A momentary cap with a lit ring while it is held (Button), and a latching cap that stays down with an LED on (ToggleButton)."
          native={<><code>&lt;button&gt;</code> and <code>&lt;button aria-pressed&gt;</code></>} page="button#11-push-button-form-momentary">
          <div className="ig-row">
            <Button form="momentary" id="ig-push-talk" colour="danger">Talk</Button>
            <ToggleButton form="latching" id="ig-push-mute" colour="success" defaultPressed>Mute</ToggleButton>
          </div>
        </Entry>
        <Entry id="display" name="Display" summary="A glass window in a bezel, backlit, with the text printed under the glass: an editable field, or a read-only readout."
          native={<><code>&lt;input&gt;</code> (TextField form display) or <code>&lt;output&gt;</code></>} page="display">
          <div className="ig-col">
            <TextField form="display" id="ig-display-field" aria-label="Preset name" defaultValue="Warm pad" backlight="glowOn" />
            <Display label="Tempo" id="ig-display-out">128.0 BPM</Display>
          </div>
        </Entry>
      </div>
    </Unit>
  </>;
}

// ---- Wave 3 ----

function WaveThree() {
  const [jog, setJog] = useState(12);
  const compact = useCompact();
  return <>
  <Unit id="w3" tab="wave3" wide title="JogWheel and PatchBay">
    <div className="ig-grid">
      <Entry id="jog-wheel" name="JogWheel" summary="A large flat wheel in a bearing recess with a finger dimple: an endless encoder, a flick coasts. Tap the upper or lower half to step."
        native={<><code>&lt;input type="range"&gt;</code> with wrap</>} page="jog-wheel">
        <JogWheel id="ig-jog" label="Shuttle" min={0} max={99} value={jog} onValueChange={setJog} unit=" fr" />
      </Entry>
      <Entry id="patch-point" name="PatchPoint and PatchBay" summary="A jack in a washer: connected, it shows a plug and a short cable and lights its LED. A bay is a plinth of jacks."
        native={<><code>&lt;input type="checkbox"&gt;</code> in a <code>&lt;fieldset&gt;</code></>} page="patch-point">
        <PatchBay legend="Patch bay" columns={2}>
          <PatchPoint id="ig-patch-1" led defaultChecked>In 1</PatchPoint>
          <PatchPoint id="ig-patch-2" led="warning">In 2</PatchPoint>
          <PatchPoint id="ig-patch-3" led>Out 1</PatchPoint>
          <PatchPoint id="ig-patch-4" button led="danger">Out 2</PatchPoint>
        </PatchBay>
      </Entry>
    </div>
  </Unit>
  <Unit id="w3-pads" title="Pad and Keypad">
    <div className="ig-grid">
      <Entry id="pad" name="Pad and PadGrid" summary="A soft square cap lit from below, in a grid: held it glows, latching it stays lit. The arrow keys move between pads; the press velocity is optional."
        native={<><code>&lt;button&gt;</code> (<code>aria-pressed</code> when latching) in a <code>&lt;div role="group"&gt;</code></>} page="pad">
        <PadGrid label="Drum pads" columns={compact ? 2 : 4}>
          <Pad id="ig-pad-kick">Kick</Pad>
          <Pad id="ig-pad-snare">Snare</Pad>
          <Pad id="ig-pad-hat" latching colour="success">Hat</Pad>
          <Pad id="ig-pad-clap" latching defaultPressed>Clap</Pad>
        </PadGrid>
      </Entry>
      <Entry id="keypad" name="Keypad" summary="Machined square caps with a printed legend on one polished plinth; a second, smaller legend can be printed under the first. The keys are one tab stop."
        native={<><code>&lt;button&gt;</code>s in a <code>&lt;fieldset&gt;</code></>} page="keypad">
        <Keypad label="Number entry" columns={3}>
          {keypad.map(([key, shift]) => <KeypadKey key={key} id={`ig-key-${key === "*" ? "star" : key === "#" ? "hash" : key}`} shift={shift || undefined}>{key}</KeypadKey>)}
        </Keypad>
      </Entry>
    </div>
  </Unit>
  </>;
}

/** The synthesiser's scale pads: a major scale over the tune, a name and its semitones. */
const scale: readonly (readonly [string, number])[] = [["C", 0], ["D", 2], ["E", 4], ["F", 5], ["G", 7], ["A", 9], ["B", 11], ["C+", 12]];
/** The keys of a phone keypad and their second legends. */
const keypad: readonly (readonly [string, string])[] = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]];

// ---- Everyday forms ----

function Everyday({ onDialog, onDrawer }: { onDialog(): void; onDrawer(): void }) {
  const [score, setScore] = useState(4);
  const compact = useCompact();
  return <>
    <Unit id="e-sliders" tab="everyday" title="Sliders, ratings and badges">
      <div className="ig-grid">
        <Entry id="slider" name="Slider forms" summary="The Slider as the Knob's or the Fader's object over its own native input: the premium default is the fader, a knob is one prop away."
          native={<code>&lt;input type="range"&gt;</code>} page="slider#11-hardware-forms-knob-and-fader">
          <div className="ig-row">
            <Slider form="knob" id="ig-slider-knob" aria-label="Drive" marks={[0, 50, 100]} defaultValue={40} unit="%" />
            <Slider form="fader" id="ig-slider-fader" aria-label="Mix" travel={compact ? 70 : undefined} min={0} max={10} defaultValue={6} />
          </div>
        </Entry>
        <Entry id="rating" name="Rating" summary="A row of lamps, lit up to the score; the radios stay the control."
          native={<code>&lt;input type="radio"&gt;</code>} page="rating#11-indicator-form-lamps">
          <Rating form="lamps" id="ig-rating" label="Quality" value={score} onChange={setScore} />
        </Entry>
        <Entry id="badge" name="Badge" summary="An LED pill: a StatusLight's lens before the text, in the colour of the variant."
          native={<code>&lt;span&gt;</code>} page="badge#11-indicator-form-led">
          <div className="ig-row">
            <Badge form="led" variant="success">Active</Badge>
            <Badge form="led" variant="danger" count={120} />
          </div>
        </Entry>
      </div>
    </Unit>
    <Unit id="e-plates" form="tray" title="Progress, plates and trays">
      <div className="ig-grid">
        <Entry id="progress" name="ProgressBar and Spinner" summary="A segment meter lit from the value, and a ring of LEDs that chases while it waits (steady under reduced motion)."
          native={<><code>&lt;progress&gt;</code> and <code>&lt;span role="status"&gt;</code></>} page="progress-bar#11-indicator-form-meter">
          <div className="ig-col">
            <ProgressBar form="meter" id="ig-progress" segments={12} aria-label="Upload" value={60} />
            <Spinner form="ring" id="ig-spinner" label="Loading results" showLabel />
          </div>
        </Entry>
        <Entry id="plates" name="Card forms" summary="A machined plate or a recessed tray: a rim or a wall of parts standing inside the element's box, over its face, which stays captured."
          native={<code>&lt;article&gt;</code>} page="card#11-plate-and-tray-forms">
          <div className="ig-col">
            <Card form="plate" id="ig-card-plate" title="Plate">A machined plate.</Card>
            <Card form="tray" id="ig-card-tray" title="Tray">The body sits in a tray.</Card>
          </div>
        </Entry>
        <Entry id="panel-forms" name="Panel forms" summary="The panel is the layer: every panel of this gallery is a plate, and this one is a tray, its content in a recessed wall under the printed title."
          native={<code>&lt;section&gt;</code>} page="panel#11-plate-and-tray-forms">
          <p className="ig-note">This panel is a tray; the panels around it are plates.</p>
        </Entry>
        <Entry id="dialog" name="Dialog plate" summary="A plate that rises out of the chassis. It opens in the root as a panel of its own, over a scrim."
          native={<code>&lt;dialog role="dialog"&gt;</code>} page="dialog#11-plate-form">
          <Button id="ig-open-dialog" onClick={onDialog}>Open dialog</Button>
        </Entry>
        <Entry id="drawer" name="Drawer tray" summary="A tray that slides out of the chassis edge, with a fader inside. It opens in the root as a panel of its own."
          native={<code>&lt;dialog role="dialog"&gt;</code>} page="drawer#11-tray-form">
          <Button id="ig-open-drawer" onClick={onDrawer}>Open drawer</Button>
        </Entry>
      </div>
    </Unit>
  </>;
}

// ---- Input forms ----

function InputForms() {
  return <>
    <Unit id="i-latching" tab="inputs" title="Checkbox, radio bank and segmented control">
      <div className="ig-grid">
        <Entry id="checkbox" name="Checkbox" summary="The same native checkbox as a small latching square key whose ring lights while it is checked."
          native={<code>&lt;input type="checkbox"&gt;</code>} page="checkbox#11-latching-form-latching">
          <div className="ig-col">
            <Checkbox form="latching" id="ig-check-1" defaultChecked>Open issues</Checkbox>
            <Checkbox form="latching" id="ig-check-2" colour="success">Closed issues</Checkbox>
          </div>
        </Entry>
        <Entry id="radio" name="Radio bank" summary="A preset bank: the radios as interlocking latching buttons on one plinth, one down at a time, each label printed on its cap."
          native={<><code>&lt;input type="radio"&gt;</code> in a <code>&lt;fieldset&gt;</code></>} page="radio#11-latching-form-the-preset-bank-bank">
          <RadioGroup form="bank" legend="Preset" name="ig-bank" defaultValue="b" id="ig-bank">
            <Radio value="a">A</Radio>
            <Radio value="b">B</Radio>
            <Radio value="c">C</Radio>
          </RadioGroup>
        </Entry>
        <Entry id="segmented" name="SegmentedControl" summary="The same radios as latching buttons on one plinth, the selected one down with its LED lit."
          native={<><code>&lt;input type="radio"&gt;</code> in a <code>&lt;fieldset&gt;</code></>} page="segmented-control#11-latching-form-latching">
          <SegmentedControl form="latching" label="View" id="ig-segmented" defaultValue="list"
            options={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }, { value: "map", label: "Map" }]} />
        </Entry>
      </div>
    </Unit>
    <Unit id="e-select" title="Select and tabs forms">
      <div className="ig-grid">
        <Entry id="select" name="Select forms" summary="The same native select as a rotary selector's dial, or as a display window with two step buttons. The browser's own list stays."
          native={<code>&lt;select&gt;</code>} page="select#11-hardware-forms-selector-and-display">
          <div className="ig-col">
            <Select form="selector" id="ig-select-selector" aria-label="Wave" defaultValue="saw">
              <option value="sine">Sine</option><option value="saw">Saw</option><option value="square">Square</option>
            </Select>
            <Select form="display" id="ig-select-display" aria-label="Region" defaultValue="eu">
              <option value="eu">Europe</option><option value="us">Americas</option><option value="ap">Asia Pacific</option>
            </Select>
          </div>
        </Entry>
        <Entry id="tabs" name="Tabs rail" summary="The tabs as latching keys on one rail, each with an LED that lights while its tab is selected, the panel the faceplate under it."
          native={<code>role="tablist"</code>} page="tabs#11-rail-form-rail">
          <Tabs id="ig-rail" form="rail" defaultValue="one">
            <TabList label="Channels">
              <Tab value="one">One</Tab>
              <Tab value="two">Two</Tab>
              <Tab value="three">Three</Tab>
            </TabList>
            <TabPanel value="one">Channel one is on the rail.</TabPanel>
            <TabPanel value="two">Channel two.</TabPanel>
            <TabPanel value="three">Channel three.</TabPanel>
          </Tabs>
        </Entry>
      </div>
    </Unit>
  </>;
}

// ---- The showpiece: Voice-1, a synthesiser voice ----

const waves = [["sine", "Sine"], ["tri", "Tri"], ["saw", "Saw"], ["pulse", "Pulse"]] as const;
type Wave = typeof waves[number][0];
const rates = [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]] as const;
type Rate = typeof rates[number][0];
const patches = [["lfoCut", "LFO to Cutoff"], ["lfoPitch", "LFO to Pitch"], ["envCut", "Env to Cutoff"], ["noise", "Noise to Mix"]] as const;
type Patch = typeof patches[number][0];
interface Voice { wave: Wave; tune: number; cutoff: number; reso: number; level: number; attack: number; decay: number; sustain: number; release: number }

/** The sixteen patches the wheel browses: deterministic, so a patch number always loads the same sound. */
export function presetOf(n: number): Voice {
  return { wave: waves[n % 4]![0], tune: ((n * 7) % 25) - 12, cutoff: 30 + ((n * 37) % 60), reso: (n * 23) % 70, level: 55 + ((n * 11) % 35),
    attack: (n * 13) % 60, decay: 20 + ((n * 17) % 50), sustain: 40 + ((n * 19) % 55), release: 10 + ((n * 29) % 60) };
}
/** The oscillator's pitch in Hz from its tune in semitones (middle C at 0). */
export const pitchOf = (tune: number) => 261.63 * 2 ** (tune / 12);
/** The filter's cutoff in Hz from the knob (20 Hz to 20 kHz, exponential). */
export const cutoffHz = (value: number) => Math.round(20 * 1000 ** (value / 100));

/**
 * The synthesiser voice: real controls wired to each other, on four module panels (a layer holds at most 16 materials, so the voice cannot
 * be one panel). The power switch gates everything; the gate (a held Trigger or the latching Hold) lights its LED and opens the output; the
 * Level fader, the filter and the resonance set the output meter and the Clip light; a patch jack opens the filter by a step on the gauge
 * and lights its LED; the wheel loads a patch into the knobs, faders and rotary; the display prints the pitch.
 */
function Synth() {
  const compact = useCompact();
  const [voice, setVoice] = useState<Voice>(() => presetOf(2));
  const [patch, setPatch] = useState(2);
  const [power, setPower] = useState(true);
  const [hold, setHold] = useState(true);
  const [trigger, setTrigger] = useState(false);
  const [note, setNote] = useState<number | null>(null);
  const [entry, setEntry] = useState("");
  const [rate, setRate] = useState<Rate>("normal");
  const [patched, setPatched] = useState<Record<Patch, boolean>>({ lfoCut: false, lfoPitch: false, envCut: false, noise: false });
  const set = <K extends keyof Voice>(key: K) => (value: Voice[K]) => setVoice(current => ({ ...current, [key]: value }));
  const gate = power && (hold || trigger || note !== null);
  const openings = (patched.lfoCut ? 1 : 0) + (patched.envCut ? 1 : 0);
  const cutoff = Math.min(100, voice.cutoff + 12 * openings);
  const output = gate ? Math.min(100, Math.round(voice.level * (0.35 + 0.65 * cutoff / 100) + voice.reso * 0.2)) : 0;
  const clipping = power && output > 85;
  const wave = waves.find(([value]) => value === voice.wave)![1].toUpperCase();
  const text = !power ? "----" : entry ? `P${entry.padEnd(2, "_")} ENTRY` : `P${String(patch + 1).padStart(2, "0")} ${wave} ${pitchOf(voice.tune + (note ?? 0)).toFixed(1)} Hz`;
  const modulating = power && (patched.lfoCut || patched.lfoPitch);
  // The trigger is the held push button: pressed with the pointer or Space/Enter, released when it leaves or lifts.
  const press = { onPointerDown: () => setTrigger(true), onPointerUp: () => setTrigger(false), onPointerLeave: () => setTrigger(false), onPointerCancel: () => setTrigger(false),
    onKeyDown: (event: KeyboardEvent) => { if (event.key === " " || event.key === "Enter") setTrigger(true); }, onKeyUp: () => setTrigger(false), onBlur: () => setTrigger(false) };
  // A pad plays the voice at its scale degree while it is held (the pointer, or Space and Enter); the keypad types a patch number and # loads it.
  const padHold = (index: number) => ({ onPointerDown: () => setNote(index), onPointerUp: () => setNote(null), onPointerLeave: () => setNote(current => current === index ? null : current), onPointerCancel: () => setNote(null),
    onKeyDown: (event: KeyboardEvent) => { if (event.key === " " || event.key === "Enter") setNote(index); }, onKeyUp: () => setNote(null), onBlur: () => setNote(null) });
  const key = (legend: string) => {
    if (legend === "*") setEntry("");
    else if (legend === "#") { const number = Number(entry); if (entry && number >= 1 && number <= 16) { setPatch(number - 1); setVoice(presetOf(number - 1)); } setEntry(""); }
    else setEntry(current => current.length >= 2 ? legend : current + legend);
  };
  return <>
    <Unit id="syn-master" tab="showpiece" title="Voice-1 · Master">
      <div className="syn" data-power={power} data-gate={gate}>
        <div className="syn-head">
          <div className="syn-screen">
            <Display label="Patch" id="syn-display" lit={power} live="off">{text}</Display>
            <p className="syn-caption" id="syn-caption">{power ? `Output ${output}%${clipping ? ", clipping" : ""}${gate ? "" : ", gate closed"}` : "Power off"}</p>
          </div>
          <JogWheel id="syn-jog" label="Patch" min={0} max={15} value={patch} onValueChange={next => { setPatch(next); setVoice(presetOf(next)); }} />
        </div>
        <div className="syn-row">
          <Button form="momentary" id="syn-trigger" colour="success" {...press}>Trigger</Button>
          <ToggleButton form="latching" id="syn-hold" colour="success" pressed={hold} onPressedChange={setHold}>Hold</ToggleButton>
          <StatusLight id="syn-gate" colour="success" label={gate ? "Gate open" : "Gate closed"} lit={gate} showLabel />
        </div>
      </div>
    </Unit>
    <Unit id="syn-sound" title="Voice-1 · Sound">
      <div className="syn">
        <div className="syn-body">
          <section className="syn-group" aria-label="Oscillator">
            <h3>Oscillator</h3>
            <RotarySelector id="syn-wave" label="Wave" value={voice.wave} onValueChange={value => set("wave")(value as Wave)} options={waves.map(([value, label]) => ({ value, label }))} />
            <Knob id="syn-tune" label="Tune" min={-12} max={12} step={1} marks={[-12, 0, 12]} unit=" st" value={voice.tune} onValueChange={set("tune")} />
          </section>
          <section className="syn-group" aria-label="Filter">
            <h3>Filter</h3>
            <Knob id="syn-cutoff" label="Cutoff" min={0} max={100} marks={[0, 50, 100]} value={voice.cutoff} onValueChange={set("cutoff")} format={value => `${cutoffHz(value)} Hz`} />
            <Knob id="syn-reso" label="Reso" min={0} max={100} marks={[0, 50, 100]} unit="%" value={voice.reso} onValueChange={set("reso")} />
            <Gauge id="syn-gauge" size={compact ? "small" : undefined} label="Filter" min={0} max={100} low={10} high={90} value={cutoff} format={value => `${cutoffHz(value)} Hz`} marks={[0, 50, 100]} />
          </section>
          <section className="syn-group syn-env" aria-label="Envelope">
            <h3>Envelope</h3>
            <div className="syn-faders">
              <Fader id="syn-attack" label="A" travel={compact ? 64 : 96} min={0} max={100} value={voice.attack} onValueChange={set("attack")} unit="%" />
              <Fader id="syn-decay" label="D" travel={compact ? 64 : 96} min={0} max={100} value={voice.decay} onValueChange={set("decay")} unit="%" />
              <Fader id="syn-sustain" label="S" travel={compact ? 64 : 96} min={0} max={100} value={voice.sustain} onValueChange={set("sustain")} unit="%" />
              <Fader id="syn-release" label="R" travel={compact ? 64 : 96} min={0} max={100} value={voice.release} onValueChange={set("release")} unit="%" />
            </div>
          </section>
        </div>
      </div>
    </Unit>
    <Unit id="syn-output" title="Voice-1 · Output">
      <div className="syn">
        <div className="syn-body">
          <section className="syn-group" aria-label="Power">
            <h3>Power</h3>
            <Switch form="bat" id="syn-power" checked={power} onChange={event => setPower(event.target.checked)}>Power</Switch>
            <StatusLight id="syn-power-light" colour="success" label={power ? "Power on" : "Power off"} lit={power} showLabel />
          </section>
          <section className="syn-group syn-out" aria-label="Level">
            <h3>Level</h3>
            <Fader id="syn-level" label="Level" travel={compact ? 64 : 96} min={0} max={100} value={voice.level} onValueChange={set("level")} unit="%" />
          </section>
          <section className="syn-group syn-out" aria-label="Output meter">
            <h3>Meter</h3>
            <Meter id="syn-meter" label="Out" value={output} min={0} max={100} low={60} high={85} optimum={30} peak segments={compact ? 10 : 16} marks={[0, 50, 100]} unit="%" />
            <StatusLight id="syn-clip" colour="danger" label="Clip" lit={clipping} showLabel />
          </section>
        </div>
      </div>
    </Unit>
    <Unit id="syn-pads" title="Voice-1 · Pads and keys">
      <div className="syn">
        <div className="syn-body">
          <PadGrid label="Scale pads" columns={4} size={compact ? "small" : undefined}>
            {scale.map(([label, semitones], index) => <Pad key={index} id={`syn-pad-${index}`} {...padHold(semitones)}>{label}</Pad>)}
          </PadGrid>
          <Keypad label="Patch number" columns={3} size={compact ? "small" : undefined}>
            {keypad.map(([legend]) => <KeypadKey key={legend} id={`syn-key-${legend === "*" ? "clear" : legend === "#" ? "enter" : legend}`} {...(legend === "*" ? { "aria-label": "Clear" } : legend === "#" ? { "aria-label": "Enter" } : {})}
              onClick={() => key(legend)}>{legend}</KeypadKey>)}
          </Keypad>
        </div>
      </div>
    </Unit>
    <Unit id="syn-patch" title="Voice-1 · Modulation">
      <div className="syn">
        <div className="syn-body">
          <PatchBay legend="Mod bay" columns={2} className="syn-bay">
            {patches.map(([key, label]) => <PatchPoint key={key} id={`syn-patch-${key}`} led checked={patched[key]}
              onChange={event => setPatched(current => ({ ...current, [key]: event.target.checked }))}>{label}</PatchPoint>)}
          </PatchBay>
          <section className="syn-group" aria-label="LFO">
            <h3>LFO</h3>
            <RotarySelector id="syn-rate" label="Rate" value={rate} onValueChange={value => setRate(value as Rate)} options={rates.map(([value, label]) => ({ value, label }))} />
            <StatusLight id="syn-lfo" colour="success" label={modulating ? `LFO ${rate}` : "LFO idle"} lit={modulating} blink={rate} showLabel />
          </section>
        </div>
      </div>
    </Unit>
  </>;
}

// ---- Notes ----

/** The parts and emitters each panel carries, as measured by `tests/browser/showcase-instrument.test.mjs` (the test fails if these go stale). */
export const budgets = {
  showpiece: { parts: 162, emitters: 38 }, wave1: { parts: 37, emitters: 0 }, wave2: { parts: 53, emitters: 32 }, wave3: { parts: 67, emitters: 8 }, everyday: { parts: 43, emitters: 27 }, inputs: { parts: 54, emitters: 15 },
} as const;

/** The materials each panel holds (the helper's `StrataGpu.diagnostics` count, cap 16), as measured by the browser test, which fails if these go stale. */
export const materials: Record<string, [title: string, count: number]> = {
  "ig-tabs-panel-showpiece": ["Voice-1 · Master", 13], "syn-sound": ["Voice-1 · Sound", 12], "syn-output": ["Voice-1 · Output", 13], "syn-pads": ["Voice-1 · Pads and keys", 6], "syn-patch": ["Voice-1 · Modulation", 9],
  "ig-tabs-panel-wave1": ["Knob and Fader", 10], "w1-switches": ["Switches", 11],
  "ig-tabs-panel-wave2": ["Lamps, lights and meters", 12], "w2-controls": ["Selector, buttons and displays", 14],
  "ig-tabs-panel-wave3": ["JogWheel and PatchBay", 12], "w3-pads": ["Pad and Keypad", 7],
  "ig-tabs-panel-everyday": ["Sliders, ratings and badges", 14], "e-plates": ["Progress, plates and trays (a tray panel)", 8],
  "ig-tabs-panel-inputs": ["Checkbox, radio bank and segmented control", 7], "e-select": ["Select and tabs forms", 14], "ig-tabs-panel-notes": ["Notes", 2],
};

function Notes() {
  return <Unit id="notes" tab="notes" wide title="Notes"><div className="ig-notes">
    <section aria-labelledby="ig-notes-decision">
      <h3 id="ig-notes-decision">The showpiece: a synthesiser, not a smart-home wall</h3>
      <p>The plan lists both. The synthesiser won because what main supports best today is the hardware that a voice is made of: knobs, faders, switches, lamps, a meter, a gauge, a display,
        a jog wheel, a patch bay, push buttons, rotary selectors, pads and a keypad are all there, and they wire to each other the way a real panel does. A smart-home wall wants a
        thermostat dial, which does not exist.</p>
    </section>
    <section aria-labelledby="ig-notes-wiring">
      <h3 id="ig-notes-wiring">What is wired to what</h3>
      <p>All of it is ordinary React state over the native controls. The power switch gates the display, the lights and the meter; the gate lamp follows a held Trigger or the latching Hold;
        the Level fader, Cutoff and Reso set the output meter and the Clip light; a patch jack opens the filter by a step on the gauge and lights its LED; the wheel loads a patch into the
        knobs, faders and rotary; a held scale pad opens the gate and plays at its note; the keypad types a patch number into the display and # loads it; the display prints the pitch of the Tune knob; the LFO light blinks at the rate the second rotary selects; and the wall-plate lock disables the controls
        through a disabled fieldset.</p>
    </section>
    <section aria-labelledby="ig-notes-budgets">
      <h3 id="ig-notes-budgets">Budgets</h3>
      <p>One content panel is on the stage at a time, with the bar and the wall. The plan's budgets are 2,048 parts and 64 emitters per layer and 6,000 parts on the stage. Measured in the
        browser test at the Instrument level (the bar adds 19 parts to every tab, and the pointer light one emitter to every panel): the synthesiser {budgets.showpiece.parts} parts and {budgets.showpiece.emitters} emitters, wave 1 {budgets.wave1.parts} and {budgets.wave1.emitters},
        wave 2 {budgets.wave2.parts} and {budgets.wave2.emitters}, wave 3 {budgets.wave3.parts} and {budgets.wave3.emitters}, the everyday forms {budgets.everyday.parts} and {budgets.everyday.emitters}, the input forms {budgets.inputs.parts} and {budgets.inputs.emitters}.
        A scene holds at most 16 materials, so each group is split into panels; the helper's own count (<code>StrataGpu.diagnostics</code>) for each is:</p>
      <ul>{Object.entries(materials).map(([id, [title, count]]) => <li key={id}>{title}: {count} of 16 materials</li>)}</ul>
      <p>On a phone the stage is at most 4,096 CSS px tall (one canvas, 8,192 device px at DPR 2), so at 320 px the intro is hidden.</p>
    </section>
    <section aria-labelledby="ig-notes-light">
      <h3 id="ig-notes-light">The pointer light and the characters</h3>
      <p>The pointer light is the plan's: an additive emitter you carry (never a second key light), with the contrast guard on every text run, only with a fine pointer, off under more contrast and forced
        colours, kept without its fade under reduced motion. The Strata helper does not own it yet, so this page does what the helper will: it wraps the controller and writes the light into each scene.
        The characters (studio, hi-fi, playful) are scopes (<code>data-strata-character</code>) on the document element: the same markup, different proportions, finishes and springs.</p>
    </section>
    <section aria-labelledby="ig-notes-next">
      <h3 id="ig-notes-next">Not here yet</h3>
      <p>Every Instrument component and character on main is in this gallery. Not wired: the Slider's <code>wheel</code> form (reserved) and the characters' geometry (larger parts), which the runtime does not read yet.</p>
    </section>
  </div></Unit>;
}
