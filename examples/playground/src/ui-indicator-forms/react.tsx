/**
 * Strata indicator forms React check page (`ui-indicator-forms-react.html`): `Rating`, `Badge`, `ProgressBar` and `Spinner` with their
 * indicator forms from `@underglass/ui/react` in plain React, with no Underglass. `[data-contract="rating.md#2"]`, `[data-contract="badge.md#2"]`,
 * `[data-contract="progress-bar.md#2"]` and `[data-contract="spinner.md#2"]` render the anatomy pages' indicator examples; the panel below holds a
 * controlled Rating with lamps, an uncontrolled one with a colour, a disabled one, a Rating whose `form` names a form owner, Badges, a bar with a
 * live value and an indeterminate one, and Spinners.
 * `?mode=plain|flush|legacy` renders `#probe` instead: the same controls with no `form`, with `form="flush"`, and as the contract markup they
 * had before the indicator forms (the flush checks compare the three, pixel for pixel).
 * `window.strataIndicatorBinding` exposes the state for `tests/browser/ui-indicator-forms-bindings.test.mjs`;
 * `ui-indicator-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge, ProgressBar, Rating, Spinner } from "@underglass/ui/react";

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

/** The same controls as `legacy`, through the bindings, with `form` as given (none, or `flush`). */
function Flush({ form }: { form?: "flush" }) {
  return (
    <>
      <Rating form={form} label="Your rating" name="score" defaultValue={3} />
      <Badge form={form}>3</Badge>
      <Badge form={form} variant="success">Active</Badge>
      <Badge form={form} variant="danger" count={120} />
      <ProgressBar form={form} aria-label="Upload" value={40} />
      <ProgressBar form={form} aria-label="Waiting" />
      <Spinner form={form} label="Loading" showLabel />
      <Spinner form={form} label="Saving" size="small" />
    </>
  );
}

function App() {
  const [score, setScore] = useState(3);
  const [value, setValue] = useState<number | undefined>(40);
  const ref = useRef<HTMLFieldSetElement>(null);
  const barRef = useRef<HTMLProgressElement>(null);
  useEffect(() => {
    window.strataIndicatorBinding = { score: () => score, setScore, setValue, changes: () => [...changes], refs: { rating: ref.current!, bar: barRef.current! } };
  });
  if (mode === "legacy") return <main><div id="probe" dangerouslySetInnerHTML={{ __html: legacy }} /></main>;
  if (mode === "plain" || mode === "flush") return <main><div id="probe"><Flush form={mode === "flush" ? "flush" : undefined} /></div></main>;
  return (
    <main>
      <div data-contract="rating.md#2" hidden><Rating form="lamps" label="Your rating" name="score" max={3} defaultValue={2} /></div>
      <div data-contract="badge.md#2" hidden><Badge form="led" variant="success">Active</Badge></div>
      <div data-contract="progress-bar.md#2" hidden><label htmlFor="upload">Upload</label><ProgressBar form="meter" segments={4} id="upload" value={40} max={100} /></div>
      <div data-contract="spinner.md#2" hidden><Spinner form="ring" label="Loading" /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Indicator forms">
        <form id="owner-form" />
        <Rating ref={ref} form="lamps" id="rate" label="Quality" name="quality" className="extra" style={{ marginRight: 4 }} data-testid="rate" value={score}
          onChange={next => { changes.push(`rating:${next}`); setScore(next); }} />
        <Rating form="lamps" colour="success" id="rate-free" label="Free" name="free" defaultValue={2} />
        <Rating form="lamps" id="rate-off" label="Off" name="off" defaultValue={4} disabled />
        <Rating form="owner-form" id="rate-owned" label="Owned" name="owned" />
        <Rating id="rate-plain" label="Plain" name="plain" />
        <Badge id="b-count" form="led" count={7} />
        <Badge id="b-ok" form="led" variant="success" className="extra" style={{ marginRight: 4 }}>Active</Badge>
        <Badge id="b-big" form="led" variant="danger" count={120} />
        <Badge id="b-flush" form="flush" variant="info">Plain</Badge>
        <ProgressBar ref={barRef} id="p-live" form="meter" segments={10} colour="info" aria-label="Upload" value={value} className="extra" style={{ marginRight: 4 }} data-testid="bar" />
        <ProgressBar id="p-wait" form="meter" aria-label="Waiting" />
        <ProgressBar id="p-plain" aria-label="Plain" value={20} />
        <Spinner id="s-ring" form="ring" label="Loading results" showLabel colour="warning" />
        <Spinner id="s-small" form="ring" label="Saving" size="small" />
        <Spinner id="s-flush" form="flush" label="Plain" />
      </section>
      <p id="ind-read">Quality {score}, upload {value ?? "unknown"}</p>
    </main>
  );
}

declare global {
  interface Window { strataIndicatorBinding: { score(): number; setScore(value: number): void; setValue(value: number | undefined): void; changes(): string[]; refs: { rating: HTMLFieldSetElement; bar: HTMLProgressElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
