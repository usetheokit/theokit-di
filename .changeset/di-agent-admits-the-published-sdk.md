---
"@theokit/di-agent": minor
---

The `@theokit/sdk` peer range admits the published `latest`. `>=4.0.1 <5` excluded `5.9.0`, so the
dependency gate counted this package among those a release would strand
(usetheokit/shared-workflows#64).

**Both ends were installed and run, not reasoned about from a changelog:**

| sdk | typecheck | suite |
| --- | --- | --- |
| 4.0.1 — the declared floor, previously untested here | clean | 118 passed, 2 skipped |
| 5.9.0 — the published latest | clean | 118 passed, 2 skipped |

No code changed: the two imports this package makes — `@theokit/sdk` and `@theokit/sdk/workflow` —
resolve identically across the major.

A clean consumer install of this package's tarball with `@theokit/sdk@5.9.0` reports no `ERESOLVE`
and resolves **one** copy of the sdk. That check is here because widening a peer range is how
`@theokit/studio` ended up with two copies in a consumer's tree, and a range that installs is not the
same claim as a range that installs once.
