---
"@theokit/di-agent": minor
---

Add `createAgentBoundary({ factory })`, whose `withAgent(seed, work)` opens a request scope seeded
with `seed`, builds one agent from it and disposes it when `work` settles. `createAgentProvider`
gains a seeded form (`factory: (seed) => ...` with a `container`). The `@theokit/di` peer range is
now `>=0.3.0 <0.4`, the first release with `requestSeed` (usetheokit/theokit-di#81).
