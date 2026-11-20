/**
 * The document delegates (`packages/ui/src/dom/delegate.ts`): every `attachStrata*` adds its listeners with the first attach for a
 * document and removes them, with the options they were added with, when the last disposer for it has run. Checked on the helper
 * itself and on real delegates over a fake document that records `addEventListener` and `removeEventListener`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireStrataDelegate, combineStrataDisposers } from "../../packages/ui/src/dom/delegate.ts";
import { attachStrataFaders } from "../../packages/ui/src/dom/fader.ts";
import { attachStrataKeypads } from "../../packages/ui/src/dom/keypad.ts";
import { attachStrataPads } from "../../packages/ui/src/dom/pad.ts";
import { attachStrataSelectDisplays } from "../../packages/ui/src/dom/select-display.ts";
import { attachStrataTooltips } from "../../packages/ui/src/dom/tooltip.ts";
import { attachStrataFeedback, listenForStrataFeedback } from "../../packages/ui/src/dom/feedback.ts";

/** A document that records its listeners: `live()` lists the ones now registered, as `type` or `type:capture:passive`. */
function fakeDocument(view) {
  const registered = [];
  const captured = options => (typeof options === "boolean" ? options : !!options?.capture);
  return {
    added: 0, removed: 0, defaultView: view ?? null, querySelectorAll: () => [],
    addEventListener(type, listener, options) { this.added++; registered.push({ type, listener, options }); },
    removeEventListener(type, listener, options) {
      const at = registered.findIndex(entry => entry.type === type && entry.listener === listener && captured(entry.options) === captured(options));
      if (at >= 0) { registered.splice(at, 1); this.removed++; }
    },
    live: () => registered.map(({ type, options }) => (typeof options === "object" ? `${type}:${options.capture ? "capture" : ""}:${options.passive === false ? "blocking" : options.passive ? "passive" : ""}` : options ? `${type}:capture` : type)),
    liveCount: () => registered.length,
  };
}

test("the first attach installs, a later attach only takes a reference, the last dispose removes", () => {
  const doc = fakeDocument();
  let installs = 0;
  const install = (target, scope) => { installs++; scope.listen(target, "click", () => undefined); scope.listen(target, "wheel", () => undefined, { passive: false }); };
  const first = acquireStrataDelegate(doc, install), second = acquireStrataDelegate(doc, install);
  assert.equal(installs, 1);
  assert.equal(doc.added, 2);
  first();
  assert.equal(doc.liveCount(), 2, "one reference is still held");
  second();
  assert.equal(doc.liveCount(), 0);
  assert.equal(doc.removed, 2);
});

test("a disposer called twice releases one reference, not two", () => {
  const doc = fakeDocument();
  const install = (target, scope) => scope.listen(target, "click", () => undefined);
  const first = acquireStrataDelegate(doc, install), second = acquireStrataDelegate(doc, install);
  first(); first(); first();
  assert.equal(doc.liveCount(), 1, "the second holder is still attached");
  second(); second();
  assert.equal(doc.liveCount(), 0);
});

test("attaching again after a full release installs again, with fresh state", () => {
  const doc = fakeDocument();
  const seen = [];
  const install = (target, scope) => { const state = { n: seen.length }; seen.push(state); scope.listen(target, "click", () => state.n); };
  acquireStrataDelegate(doc, install)();
  assert.equal(doc.liveCount(), 0);
  const again = acquireStrataDelegate(doc, install);
  assert.equal(seen.length, 2);
  assert.equal(doc.liveCount(), 1);
  again();
  assert.equal(doc.liveCount(), 0);
});

test("two documents are independent, and so are two delegates on one document", () => {
  const one = fakeDocument(), other = fakeDocument();
  const a = (target, scope) => scope.listen(target, "click", () => undefined);
  const b = (target, scope) => scope.listen(target, "keydown", () => undefined);
  const releaseOne = acquireStrataDelegate(one, a), releaseOther = acquireStrataDelegate(other, a), releaseB = acquireStrataDelegate(one, b);
  assert.deepEqual([one.liveCount(), other.liveCount()], [2, 1]);
  releaseOne();
  assert.deepEqual([one.live(), other.live()], [["keydown"], ["click"]], "the other document and the other delegate keep theirs");
  releaseOther(); releaseB();
  assert.deepEqual([one.liveCount(), other.liveCount()], [0, 0]);
});

test("a release runs the cleanups, newest first, after the listeners are gone, and one failing cleanup does not stop the rest", () => {
  const doc = fakeDocument();
  const order = [];
  const release = acquireStrataDelegate(doc, (target, scope) => {
    scope.listen(target, "click", () => undefined);
    scope.onRelease(() => order.push(`first (listeners left: ${doc.liveCount()})`));
    scope.onRelease(() => { order.push("second"); throw new Error("boom"); });
  });
  assert.throws(() => release(), /boom/);
  assert.deepEqual(order, ["second", "first (listeners left: 0)"]);
  assert.equal(doc.liveCount(), 0);
  release();
  assert.equal(order.length, 2, "a disposer that has run does nothing more");
});

test("an install that throws leaves nothing attached and can be tried again", () => {
  const doc = fakeDocument();
  let fail = true;
  const install = (target, scope) => { scope.listen(target, "click", () => undefined); if (fail) throw new Error("no"); };
  assert.throws(() => acquireStrataDelegate(doc, install), /no/);
  assert.equal(doc.liveCount(), 0);
  fail = false;
  const release = acquireStrataDelegate(doc, install);
  assert.equal(doc.liveCount(), 1);
  release();
});

test("combined disposers each run their own", () => {
  const calls = [];
  combineStrataDisposers(() => calls.push("a"), () => calls.push("b"))();
  assert.deepEqual(calls, ["a", "b"]);
});

test("attachStrataFaders keeps its listeners and options, and the blocking wheel listener goes with the last disposer", () => {
  const doc = fakeDocument();
  const first = attachStrataFaders(doc), second = attachStrataFaders(doc);
  assert.ok(doc.live().includes("wheel::blocking"), "the wheel listener is not passive");
  assert.ok(doc.live().includes("input:capture"), "the input listener is in the capture phase");
  const count = doc.liveCount();
  assert.equal(doc.added, count, "attached once");
  first();
  assert.equal(doc.liveCount(), count);
  second();
  assert.equal(doc.liveCount(), 0, "nothing is left, the feedback gesture listeners included");
  attachStrataFaders(doc)();
  assert.equal(doc.liveCount(), 0);
});

test("the combined delegates (pads, keypads, select displays) give back every reference they took", () => {
  for (const attach of [attachStrataPads, attachStrataKeypads, attachStrataSelectDisplays]) {
    const doc = fakeDocument();
    const a = attach(doc), b = attach(doc);
    assert.ok(doc.liveCount() > 0);
    a();
    assert.ok(doc.liveCount() > 0);
    b();
    assert.equal(doc.liveCount(), 0, attach.name);
  }
});

test("the page's window listeners (scroll, resize) are removed too", () => {
  const view = fakeDocument();
  const doc = fakeDocument(view);
  const release = attachStrataTooltips(doc);
  assert.deepEqual(view.live().sort(), ["resize", "scroll:capture:passive"]);
  release();
  assert.equal(view.liveCount() + doc.liveCount(), 0);
});

test("feedback: the handle's detach gives back its reference once, and the delegates' hold is separate", () => {
  const doc = fakeDocument();
  const handle = attachStrataFeedback({ sound: true }, doc);
  const release = listenForStrataFeedback(doc);
  assert.equal(doc.liveCount(), 2, "pointerdown and keydown, once");
  handle.detach(); handle.detach();
  assert.equal(doc.liveCount(), 2, "the delegate's reference holds them");
  release();
  assert.equal(doc.liveCount(), 0);
});
