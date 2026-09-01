---
"@theokit/di": patch
---

Name an anonymous class `<anonymous>` in diagnostics instead of rendering nothing.

Four call sites wrote a class name as `target.name ?? "<anonymous>"`, and that fallback could never
fire: an anonymous class has `name === ""`, not an absent one, and `"" ?? x` is `""`. A consumer who
passed a class expression read `Class  has no @Module() decorator.` — two spaces where the identity
belongs, and nothing to search the codebase for. `MissingInjectableError`, `InvalidModuleError`, the
`emitted as ...` hint in constructor-parameter diagnostics and the cycle labels in `analyze()` are
all affected.

`describeToken` in the same file had the check right all along (`name.length > 0`); the other sites
had drifted from it. The knowledge now lives in one exported helper, `describeClassName`.
