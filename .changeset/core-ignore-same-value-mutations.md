---
"@underglass/core": minor
---

Ignore mutation records that change nothing: the runtime observes attribute and character-data old values, and a record whose old value equals the node's current value (a same-value `setAttribute`, `style`, `class` or `Text.data` write) no longer invalidates and recaptures its layers, nor requests a policy refresh or reconcile. A batch is ignored only if every record is, so A to B to A and A to B to C still capture; child-list records and added or removed attributes always capture. New metric `state().metrics.mutationsIgnored` and `perLayer[id].mutationsIgnored`. A component that wrote the same value every frame (#165) recaptured every layer every frame; 300 same-value writes now cost 0 captures (299 before).
