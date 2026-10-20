/**
 * Unit tests for the playground TODO app's reducer and renderer diagnostics
 * (`examples/playground/src/apps/todo`). Pure state logic, no browser. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTodos, reduceTodos, visibleTasks, TASK_LIMIT, NOTES_LIMIT } from "../../examples/playground/src/apps/todo/model.ts";
import { rendererDiagnostic } from "../../examples/playground/src/apps/todo/diagnostics.ts";

test("TODO reducer supports actual add/edit/complete/filter/remove with bounded event state", () => {
  let state = reduceTodos(initialTodos(), { type: "draft", title: "  Native task  " });
  state = reduceTodos(state, { type: "add" });
  assert.equal(state.tasks[2].title, "Native task");
  assert.equal(state.draft, "");
  state = reduceTodos(state, { type: "edit", id: 3, title: "Edited task" });
  assert.equal(state.event.kind, "added");
  state = reduceTodos(state, { type: "confirm", id: 3 });
  assert.equal(state.event.kind, "edited");
  state = reduceTodos(state, { type: "toggle", id: 3 });
  state = reduceTodos(state, { type: "filter", filter: "completed" });
  assert.deepEqual(visibleTasks(state).map(task => task.id), [3]);
  state = reduceTodos(state, { type: "remove", id: 3 });
  assert.equal(state.tasks.length, 2);
  assert.equal(state.event.sequence, 4);
});
test("list/detail uses stable IDs, live bounded notes, search and deterministic selected deletion", () => {
  let state = reduceTodos(initialTodos(), { type: "select", id: 1 });
  state = reduceTodos(state, { type: "notes", id: 1, value: "Original multiline\nnotes" });
  state = reduceTodos(state, { type: "save", id: 1 });
  assert.equal(state.selectedId, 1);
  assert.equal(state.tasks[0].notes, "Original multiline\nnotes");
  const rejected = reduceTodos(state, { type: "notes", id: 1, value: "a".repeat(NOTES_LIMIT + 1) });
  assert.equal(rejected.tasks, state.tasks);
  assert.match(rejected.message, /limited/);
  state = reduceTodos(state, { type: "search", value: "SPACE" });
  assert.deepEqual(visibleTasks(state).map(task => task.id), [2]);
  assert.equal(state.selectedId, 1, "Filtering never destroys the detail control state");
  state = reduceTodos(state, { type: "back" });
  assert.equal(state.selectedId, null);
  state = reduceTodos(state, { type: "select", id: 1 });
  state = reduceTodos(state, { type: "request-delete", id: 1 });
  assert.equal(state.deleteId, 1);
  state = reduceTodos(state, { type: "cancel-delete" });
  assert.equal(state.deleteId, null);
  state = reduceTodos(state, { type: "request-delete", id: 1 });
  state = reduceTodos(state, { type: "remove", id: 1 });
  assert.equal(state.selectedId, null);
  assert.equal(state.deleteId, null);
  assert.match(reduceTodos(state, { type: "save", id: 1 }).message, /no longer/);
  assert.equal(reduceTodos(state, { type: "select", id: 1 }).selectedId, null);
});
// The prefix of each diagnostic names its category, so GPU errors and capability absence are told apart from admission.
test("diagnostics distinguish admission and authored framework boundaries from factual capability absence", () => {
  assert.match(rendererDiagnostic("dom", "Missing requestPaint canvas.content"), /^capability/);
  assert.match(rendererDiagnostic("dom", "Offscreen functional admission unproven"), /^admission/);
  assert.equal(rendererDiagnostic("dom", "GPU admission failed: Error: Functional native clipping is unproven: admission deferred until the owning output probe is inside the viewport; explicitly enable again when visible"),
    "admission · dom: GPU admission failed: Error: Functional native clipping is unproven: admission deferred until the owning output probe is inside the viewport; explicitly enable again when visible");
  assert.match(rendererDiagnostic("dom", "Explicit disable: original controls and React root retained in ordinary DOM."), /^lifecycle/);
  assert.match(rendererDiagnostic("disposed", "Disposed root, captures, pixel canvases, textures, effect, renderer, engine and owned listeners."), /^lifecycle/);
  assert.match(rendererDiagnostic("dom", "Ordinary DOM startup; admission pending."), /^lifecycle/);
  assert.match(rendererDiagnostic("dom", "GPU admission failed: Error: Unsupported transformed ancestor requires explicit adapter"), /^authored\/framework-boundary/);
  // A slow engine request is a transient admission note, not a GPU error.
  assert.match(rendererDiagnostic("dom", "WebGPU initialization slow (over 5000 ms); ordinary DOM stays presented and admission continues."), /^admission/);
  assert.match(rendererDiagnostic("dom", "GPU admission failed: Error: requestDevice failed: device error"), /^gpu-error/);
  assert.match(rendererDiagnostic("dom", "Unsupported transformed ancestor"), /^authored\/framework-boundary/);
  assert.match(rendererDiagnostic("dom", "GPU upload failure"), /^gpu-error/);
  assert.match(rendererDiagnostic("gpu", "Complete output"), /^active/);
});
test("TODO invalid titles, stale tasks and capacity report explicit usable state", () => {
  let state = initialTodos();
  assert.match(reduceTodos(state, { type: "add" }).message, /Enter/);
  assert.match(reduceTodos(state, { type: "remove", id: 99 }).message, /no longer/);
  while (state.tasks.length < TASK_LIMIT) {
    state = reduceTodos(reduceTodos(state, { type: "draft", title: "Task" }), { type: "add" });
  }
  const rejected = reduceTodos(state, { type: "add" });
  assert.equal(rejected.tasks, state.tasks);
  assert.match(reduceTodos(reduceTodos(state, { type: "draft", title: "Another" }), { type: "add" }).message, /six/);
  const blank = reduceTodos(state, { type: "edit", id: 1, title: " " });
  assert.match(reduceTodos(blank, { type: "confirm", id: 1 }).message, /cannot be empty/);
});
