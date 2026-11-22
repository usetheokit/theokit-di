/**
 * The metadata keys the agent decorators write. Same strings `@theokit/di` exposes as
 * `METADATA_KEYS` today, so metadata written by an older install still reads back.
 */
export const AGENT_METADATA_KEYS = {
  SANDBOX: "usetheo:di:sandbox",
  SUBAGENT: "usetheo:di:subagent",
  SQUAD: "usetheo:di:squad",
  STEP: "usetheo:di:step",
  HITL: "usetheo:di:hitl",
  AUTO_SUMMARIZE: "usetheo:di:auto-summarize",
  TOOL: "usetheo:di:tool",
  WORKFLOW: "usetheo:di:workflow",
  EVAL: "usetheo:di:eval",
  CRON: "usetheo:di:cron",
  SUBSCRIPTION: "usetheo:di:subscription",
  AUTH: "usetheo:di:auth",
  RETRIEVER: "usetheo:di:retriever",
  RERANKER: "usetheo:di:reranker",
  TEXT_SPLITTER: "usetheo:di:text-splitter",
  MEMORY_SCOPE: "usetheo:di:memory-scope",
} as const;
