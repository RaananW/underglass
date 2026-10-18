/**
 * Feedback (design language section 20): opt-in synthesised sound and haptics for Instrument controls, both off by
 * default. Decorative: nothing depends on it, every sound and pulse goes with a visible change of state, and it never
 * blocks, delays or changes the native event path (every listener is passive and only observes).
 * - **Where it is on:** `feedback.sound` and `feedback.haptics`, tokens set per application (`createStrataTheme({
 *   feedback: { sound: true } })`) or per scope (`StrataScope feedback`), resolved on the control itself; or, for the
 *   whole page, the `sound` and `haptics` options of `attachStrataFeedback`, which override the tokens when given.
 *   `muted: true` silences everything.
 * - **Sound:** four sounds, click (a push button), tick (a detent), thunk (a latch) and snap (a lever, rocker or
 *   paddle thrown), each synthesised from three parameters (`feedback.<sound>.pitch`, `.decay` and `.noise`: the
 *   premium set, in the tokens until characters land), with no audio assets. The `AudioContext` is created only on the
 *   visitor's first gesture (`pointerdown` or `keydown`) on a control whose sound is on, and resumed there, as
 *   browsers require; until then, and with sound off, no audio object exists at all. Each sound is panned towards its
 *   control's place across the viewport.
 * - **Haptics:** a short `navigator.vibrate` pulse where the device has one, only in answer to the visitor's own
 *   input on the control, and never under `prefers-reduced-motion: reduce`.
 * Controls call `strataFeedback(element, kind)`: the switch forms on every throw (`dom/switch.ts`), a detented Fader
 * with `tick` as each detent passes (`dom/fader.ts`); the Knob's detents will call it the same way.
 */

/** The four sounds of a character's sound set. */
export type StrataSoundKind = "click" | "tick" | "thunk" | "snap";
/** One sound's three parameters: its tone (Hz), its decay (the envelope's time constant, ms) and its noise (0–1). */
export interface StrataSound { pitch: number; decay: number; noise: number }

/** The premium sound set, the tokens' defaults (`feedback.<sound>.*`). */
export const strataSoundSet: Record<StrataSoundKind, StrataSound> = {
  click: { pitch: 2400, decay: 4, noise: 0.6 },
  tick: { pitch: 3200, decay: 2, noise: 0.3 },
  thunk: { pitch: 140, decay: 18, noise: 0.25 },
  snap: { pitch: 1800, decay: 6, noise: 0.75 },
};
/** The pulse per sound, ms. */
export const strataPulses: Record<StrataSoundKind, number> = { click: 8, tick: 5, thunk: 16, snap: 12 };

/** How long a sound lasts: five of its decay's time constants, in samples. */
export const strataSoundLength = (sound: StrataSound, sampleRate: number) => Math.max(1, Math.round((sampleRate * 5 * sound.decay) / 1000));

/**
 * One sound as samples (mono, −1 to 1, peak 0.8): a tone at `pitch` mixed with deterministic noise by `noise`, under
 * an exponential envelope of time constant `decay` that starts after a 0.3 ms attack and fades to exactly 0 over its
 * last tenth. Pure, so tests and an `AudioBuffer` see the same samples.
 */
export function synthesiseStrataSound(sound: StrataSound, sampleRate = 48000): Float32Array {
  const length = strataSoundLength(sound, sampleRate), samples = new Float32Array(length);
  const tau = Math.max(1e-4, sound.decay / 1000), attack = Math.max(1, Math.round(sampleRate * 0.0003)), fade = Math.max(1, Math.round(length / 10));
  const mix = Math.min(1, Math.max(0, sound.noise));
  let seed = 0x2545f491, peak = 0;
  for (let index = 0; index < length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const time = index / sampleRate, noise = seed / 0x80000000 - 1;
    const tone = Math.sin(2 * Math.PI * sound.pitch * time);
    const envelope = Math.exp(-time / tau) * Math.min(1, index / attack) * Math.min(1, (length - 1 - index) / fade);
    samples[index] = ((1 - mix) * tone + mix * noise) * envelope;
    peak = Math.max(peak, Math.abs(samples[index]!));
  }
  if (peak > 0) for (let index = 0; index < length; index++) samples[index] = (samples[index]! / peak) * 0.8;
  return samples;
}

/** The page's feedback options; each overrides the tokens when given. */
export interface StrataFeedbackOptions {
  /** Sound everywhere on (`true`) or off (`false`); by default each control's `feedback.sound` token decides. */
  sound?: boolean;
  /** Haptics everywhere on or off; by default each control's `feedback.haptics` token decides. */
  haptics?: boolean;
  /** The application's mute: no sound and no pulse while true. */
  muted?: boolean;
  /** Loudness, 0–1 (0.5 by default). */
  volume?: number;
}
export interface StrataFeedbackHandle {
  /** Changes the options (merged with the current ones). */
  update(options: StrataFeedbackOptions): void;
  /** The audio context, once a gesture on a control with sound on has created it. */
  context(): AudioContext | undefined;
  /** Removes the options and closes the audio context; the gesture listeners stay, inert, until a new attach. */
  detach(): void;
}

interface FeedbackState { options: StrataFeedbackOptions; context?: AudioContext; buffers: Map<string, AudioBuffer>; gesture: WeakMap<Element, number> }
const states = new WeakMap<Document, FeedbackState>();

/** A control's resolved `feedback.<name>` token (on when it is 1). */
const token = (element: Element, name: string) => {
  try { return Number.parseFloat(getComputedStyle(element).getPropertyValue(`--strata-feedback-${name}`)) >= 0.5; } catch { return false; }
};
const soundOf = (element: Element, kind: StrataSoundKind): StrataSound => {
  const style = getComputedStyle(element), fallback = strataSoundSet[kind];
  const read = (key: keyof StrataSound) => { const value = Number.parseFloat(style.getPropertyValue(`--strata-feedback-${kind}-${key}`)); return Number.isFinite(value) ? value : fallback[key]; };
  return { pitch: read("pitch"), decay: read("decay"), noise: read("noise") };
};
const soundOn = (state: FeedbackState, element: Element) => !state.options.muted && (state.options.sound ?? token(element, "sound"));
const hapticsOn = (state: FeedbackState, element: Element) => !state.options.muted && (state.options.haptics ?? token(element, "haptics"))
  && !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
/** The Instrument controls feedback belongs to (the switch forms and faders; knobs as their detents join). */
const controls = ".ug-switch[data-strata-form] .ug-switch__input, .ug-knob__input, .ug-fader__input";

/** The page's feedback state, with its gesture listeners, created once per document. */
function stateOf(doc: Document): FeedbackState {
  let state = states.get(doc);
  if (state) return state;
  const created: FeedbackState = { options: {}, buffers: new Map(), gesture: new WeakMap() };
  states.set(doc, created);
  state = created;
  // The first gesture on a control with sound on creates the audio context (and every gesture resumes it), inside the
  // gesture, as browsers allow. A trusted gesture also marks the control as the visitor's own input, for haptics.
  const gesture = (event: Event) => {
    const control = (event.target as Element | null)?.closest?.(controls);
    if (!control || !event.isTrusted) return;
    created.gesture.set(control, event.timeStamp || performance.now());
    if (!soundOn(created, control)) return;
    try {
      const Context = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!created.context && Context) created.context = new Context();
      if (created.context?.state === "suspended") void created.context.resume().catch(() => undefined);
    } catch { /* no audio: feedback stays silent */ }
  };
  doc.addEventListener("pointerdown", gesture, { capture: true, passive: true });
  doc.addEventListener("keydown", gesture, { capture: true, passive: true });
  return created;
}

/**
 * Sets the page's feedback options (sound and haptics override the tokens when given; `muted` silences everything) and
 * makes sure the gesture listeners are in place. The switch forms' behaviour attaches the listeners itself, so this is
 * only needed to set options.
 */
export function attachStrataFeedback(options: StrataFeedbackOptions = {}, doc: Document = document): StrataFeedbackHandle {
  const state = stateOf(doc);
  state.options = { ...options };
  return {
    update: next => { state.options = { ...state.options, ...next }; },
    context: () => state.context,
    detach: () => { state.options = {}; void state.context?.close().catch(() => undefined); state.context = undefined; state.buffers.clear(); },
  };
}

/** Makes sure `doc` listens for the gestures that unlock audio; idempotent. */
export function listenForStrataFeedback(doc: Document = document): void { stateOf(doc); }

/**
 * Plays `kind` for `element` and pulses, where each is on for it: sound only once a gesture has created the audio
 * context, a pulse only within a second of the visitor's own gesture on the control. Never throws.
 */
export function strataFeedback(element: Element, kind: StrataSoundKind): void {
  try {
    const doc = element.ownerDocument, state = stateOf(doc);
    const control = element.closest(controls) ?? element;
    const own = (performance.now() - (state.gesture.get(control) ?? -Infinity)) < 1000;
    if (own && hapticsOn(state, control)) (doc.defaultView?.navigator ?? navigator).vibrate?.(strataPulses[kind]);
    const context = state.context;
    if (!context || context.state === "closed" || !soundOn(state, control)) return;
    const sound = soundOf(control, kind), key = `${kind}:${sound.pitch}:${sound.decay}:${sound.noise}:${context.sampleRate}`;
    let buffer = state.buffers.get(key);
    if (!buffer) {
      const samples = synthesiseStrataSound(sound, context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      state.buffers.set(key, buffer);
    }
    const source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner();
    const box = control.getBoundingClientRect(), width = doc.defaultView?.innerWidth || 1;
    pan.pan.value = Math.max(-1, Math.min(1, ((box.left + box.width / 2) / width) * 2 - 1)) * 0.6;
    gain.gain.value = Math.min(1, Math.max(0, state.options.volume ?? 0.5));
    source.buffer = buffer;
    source.connect(gain).connect(pan).connect(context.destination);
    source.start();
  } catch { /* feedback is decorative: never let it break the control */ }
}
