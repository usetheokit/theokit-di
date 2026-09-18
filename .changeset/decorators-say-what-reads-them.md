---
"@theokit/di-agent": patch
---

The README states what the decorators do and what reads them, because the export list reads like a
promise that something runs them (usetheokit/theokit-di#70).

`@Tool`, `@SubAgent`, `@Squad`, `@Workflow`, `@Step`, `@Cron`, `@Hitl`, `@Retriever`, `@Reranker`
and their siblings write metadata onto a class and nothing else. The split is deliberate — a
declaration and the runtime that acts on it version independently — but a consumer reading the
exports has no way to learn that, and reasonably concludes `@Workflow` executes something.

Measured across every repository in this ecosystem, excluding `node_modules`: **no consumer outside
this package reads any of the readers, `@theokit/sdk` included.** Inside it, `workflow-builder.ts`
reads `readStepMetadata` and `readWorkflowMetadata`; the other fourteen readers have no consumer
anywhere. The issue reported zero readers in total — the two in `workflow-builder.ts` are the
refinement, and they matter because the docblock in `decorators/tool.ts` says *"nothing in this
package acts on it"*, which is true of `@Tool` and not of `@Workflow`.

Nothing is retired and no behaviour changes. A declaration surface waiting for a consumer is a fine
thing to be, stated; the README now says which one it is, and points at `AgentBuilder` for someone
choosing an authoring surface that executes today.

`tests/decorator-consumers.test.ts` keeps the table honest in both directions: wiring a reader fails
until the table names it, and naming a decorator the code does not read fails too. Both were proven
by breaking them — the first assertion was written against the whole README, passed with a reader
wired, and was rewritten to read the table row.
