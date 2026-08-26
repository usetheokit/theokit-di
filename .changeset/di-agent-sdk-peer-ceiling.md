---
"@theokit/di-agent": minor
---

Realign the `@theokit/sdk` peer with the SDK this package actually imports.

**Install-contract break.** `@theokit/sdk` moves from `^1.3.0` to `>=4.0.1 <5`. An app pinned below
4 stops satisfying the peer. Minor bump because the version is still 0.x, where minor is the
breaking slot.

The old range described nothing that existed. `src/workflow-builder.ts` imports
`@theokit/sdk/workflow` at runtime, the package is developed and tested against the modern SDK, and
the published SDK has been on 4.x for months — so `npm i @theokit/di-agent @theokit/sdk@^4` ended in
`ERESOLVE`, and pnpm users got a peer warning for a combination that was never supported.
(usetheokit/theokit-di#40)

Verified at both ends of the new range: the suite passes against 4.0.1 and against 4.57.0. The
`@theokit/sdk` devDependency moves to `^4.57.0` for the same reason the range went stale unnoticed —
CI was resolving 1.x, compiling against it, and going green on a combination no consumer installs.
