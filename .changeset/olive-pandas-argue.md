---
"@theokit/di": patch
---

`analyze()` no longer drops a cycle when two classes share a name.

`findCycles` de-duplicated cycles by the token's RENDERING rather than by the token, so two different
classes with the same `name` produced the same key and the second cycle was discarded as a duplicate
of the first. Two files each declaring `class Logger` and `class Service` was enough to trigger it, as
was any two anonymous classes or any two symbol tokens: `analyze()` reported one cycle, and nothing
said the other had been dropped. A consumer debugging a cyclic dependency fixed the loop they were
shown and met the next one on the following run.

Cycles are now keyed on an identity table. The rotation that makes the key independent of which node
the walk entered on is unchanged.
