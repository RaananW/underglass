// The no-op rule for mutation records (issue #181): a batch is ignored only when every record's old value equals the
// node's current value. Runs in Node with minimal stand-ins for a target that has an attribute or text value.
import test from "node:test";
import assert from "node:assert/strict";
import { isNoOpMutation } from "../../packages/core/src/mutations.ts";

/** A batch for one attribute: the values written in order from `start`, as the records the browser delivers. */
function attributeBatch(start, writes) {
  let value = start;
  const target = { getAttribute: () => value, getAttributeNS: () => value };
  const records = writes.map(next => { const record = { type: "attributes", target, attributeName: "x", attributeNamespace: null, oldValue: value }; value = next; return record; });
  return records;
}
const ignored = records => records.every(isNoOpMutation);

test("A -> A is ignored", () => assert.equal(ignored(attributeBatch("A", ["A"])), true));
test("A -> A -> A is ignored", () => assert.equal(ignored(attributeBatch("A", ["A", "A"])), true));
test("A -> B is changed", () => assert.equal(ignored(attributeBatch("A", ["B"])), false));
test("A -> B -> A is changed: the second record has old value B, which differs from the current A", () => {
  const records = attributeBatch("A", ["B", "A"]);
  assert.deepEqual(records.map(isNoOpMutation), [true, false]);
  assert.equal(ignored(records), false);
});
test("A -> B -> C is changed", () => assert.equal(ignored(attributeBatch("A", ["B", "C"])), false));
test("an added attribute (old value null) is never a no-op", () => {
  assert.equal(isNoOpMutation({ type: "attributes", target: { getAttribute: () => null }, attributeName: "x", attributeNamespace: null, oldValue: null }), false);
});
test("a removed attribute is never a no-op", () => {
  assert.equal(isNoOpMutation({ type: "attributes", target: { getAttribute: () => null }, attributeName: "x", attributeNamespace: null, oldValue: "A" }), false);
});
test("an attribute added and removed in one task is changed (its second record's old value differs)", () => {
  // null -> "B" -> removed: the first record's old value is null (never a no-op), so the batch is changed.
  const target = { getAttribute: () => null };
  const records = [{ type: "attributes", target, attributeName: "x", attributeNamespace: null, oldValue: null }, { type: "attributes", target, attributeName: "x", attributeNamespace: null, oldValue: "B" }];
  assert.equal(ignored(records), false);
});
test("a namespaced attribute compares its namespaced value", () => {
  const target = { getAttribute: () => "wrong", getAttributeNS: (namespace, name) => (namespace === "ns" && name === "x" ? "A" : null) };
  assert.equal(isNoOpMutation({ type: "attributes", target, attributeName: "x", attributeNamespace: "ns", oldValue: "A" }), true);
});
test("character data compares against target.data", () => {
  assert.equal(isNoOpMutation({ type: "characterData", target: { data: "hi" }, oldValue: "hi" }), true);
  assert.equal(isNoOpMutation({ type: "characterData", target: { data: "yo" }, oldValue: "hi" }), false);
});
test("a child-list record is never a no-op", () => {
  assert.equal(isNoOpMutation({ type: "childList", target: {}, oldValue: null }), false);
  assert.equal(isNoOpMutation({ type: "childList", target: {}, oldValue: "x" }), false);
});
