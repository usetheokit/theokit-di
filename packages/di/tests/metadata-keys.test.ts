import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../src/index.js";

describe("METADATA_KEYS compatibility", () => {
  it("keeps the 16 deprecated agent keys at their current values", () => {
    const agent = {
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
    };
    for (const [k, v] of Object.entries(agent)) {
      expect((METADATA_KEYS as Record<string, string>)[k]).toBe(v);
    }
    expect(Object.keys(METADATA_KEYS)).toHaveLength(24);
  });
});
