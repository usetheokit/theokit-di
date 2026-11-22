import "reflect-metadata";
import { METADATA_KEYS } from "@theokit/di";
import { describe, expect, it } from "vitest";
import { AGENT_METADATA_KEYS, readToolMetadata, Tool } from "../src/index.js";

describe("AGENT_METADATA_KEYS", () => {
  const keys = Object.keys(AGENT_METADATA_KEYS) as (keyof typeof AGENT_METADATA_KEYS)[];

  it("holds the 16 agent keys", () => {
    expect(keys).toHaveLength(16);
  });

  it.each(keys)("%s equals the @theokit/di value", (k) => {
    expect(AGENT_METADATA_KEYS[k]).toBe(METADATA_KEYS[k]);
  });

  it("reads @Tool back, and reads metadata written under the @theokit/di key", () => {
    class A {
      @Tool({ name: "t", description: "d" })
      run(): void {}
    }
    expect(readToolMetadata(A).get("run")).toEqual({ name: "t", description: "d" });

    class B {}
    Reflect.defineMetadata(
      METADATA_KEYS.TOOL,
      new Map([["x", { name: "n", description: "d" }]]),
      B,
    );
    expect(readToolMetadata(B).get("x")?.name).toBe("n");
  });
});
