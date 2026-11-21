---
"@theokit/di": minor
---

`Container.runInRequest(callback, { seed })` carries a per-request value, read with
`container.requestSeed<T>()`. It throws `ScopeViolationError` outside a request and the new
`MissingRequestSeedError` when the request was opened without a seed. Calls without options behave
as before (usetheokit/theokit-di#80).
