---
"@theokit/di": minor
---

Mark the 16 agent keys in `METADATA_KEYS` as `@deprecated`. `@theokit/di-agent` owns them as
`AGENT_METADATA_KEYS`; the container never read them. Values are unchanged and nothing is removed
until the next major.
