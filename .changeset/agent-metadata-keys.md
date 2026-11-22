---
"@theokit/di-agent": minor
---

`@theokit/di-agent` owns its metadata keys (`AGENT_METADATA_KEYS`, same strings as before) and marks
the fourteen decorators nothing reads, with their `read*Metadata` functions, `@deprecated`. Nothing is
removed; `@Workflow` and `@Step` are unchanged (usetheokit/theokit-di#82).
