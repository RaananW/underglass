/**
 * Which mutation records change nothing. The browser reports `setAttribute(name, sameValue)` and a same-value
 * `Text.data` write as records even though the DOM is identical, so an observer that recaptures on every record
 * recaptures for work that cannot change a pixel.
 *
 * The rule is evaluated when the batch is delivered, against the node's current value. A record is a no-op only when
 * the value it replaced equals the current value: `record.oldValue === current`. Child-list records are never no-ops
 * (re-appending a node reorders it), and neither is a record whose old value is `null` (the attribute was added).
 *
 * A batch is the writes of one task in order, v0 -> v1 -> ... -> vn, with each record holding the value it replaced
 * (v0 .. v(n-1)) and vn the current value. If every record is a no-op then every vi equals vn: nothing changed, so the
 * batch is a no-op. If any vi differs from vn then record i+1 has `oldValue !== current` and is not a no-op, so the
 * batch is reported as changed. Hence a batch is ignored exactly when each of its records is, and the check needs no
 * grouping:
 *
 * - A -> A: old A, current A: ignored.
 * - A -> B: old A, current B: changed.
 * - A -> B -> A: records old A (equal) and old B (differs): changed. The DOM passed through B and the observer cannot
 *   prove that no paint or capture saw it, so it recaptures.
 * - A -> B -> C: old A and old B, both differ from C: changed.
 */
export function isNoOpMutation(record: Pick<MutationRecord, "type" | "target" | "attributeName" | "attributeNamespace" | "oldValue">): boolean {
  if (record.oldValue === null) return false;
  if (record.type === "attributes") {
    const target = record.target as Element;
    const current = record.attributeNamespace
      ? target.getAttributeNS(record.attributeNamespace, record.attributeName!)
      : target.getAttribute(record.attributeName!);
    return current === record.oldValue;
  }
  if (record.type === "characterData") return (record.target as CharacterData).data === record.oldValue;
  return false;
}
