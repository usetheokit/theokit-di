import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

describe("METADATA_KEYS deprecation tags", () => {
  it("tags exactly the 16 agent keys, and none of the 8 container keys", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/internal/metadata.ts", import.meta.url)),
      "utf8",
    );
    const body = src.slice(src.indexOf("METADATA_KEYS = {"), src.indexOf("} as const"));
    const entries = [...body.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(\w+):/g)];
    expect(entries).toHaveLength(24);
    const tagged = entries.filter((m) => m[1]!.includes("@deprecated")).map((m) => m[2]);
    expect(tagged).toHaveLength(16);
    for (const k of [
      "INJECTABLE",
      "INJECT_TOKENS",
      "OPTIONAL_FLAGS",
      "DESIGN_PARAMTYPES",
      "QUALIFIER_NAMES",
      "PRIMARY",
      "POST_CONSTRUCT",
      "PRE_DESTROY",
    ]) {
      expect(tagged).not.toContain(k);
    }
  });
});
