import { describe, expect, it } from "vitest";

import { Container, MissingRequestSeedError, Scope, ScopeViolationError } from "../src/index.js";

const tick = () => new Promise((r) => setTimeout(r, 2));

describe("requestSeed", () => {
  it("a REQUEST-scoped factory reads the seed", async () => {
    const c = new Container();
    c.register({
      provide: "who",
      useFactory: () => c.requestSeed<string>(),
      scope: Scope.REQUEST,
    });
    expect(await c.runInRequest(async () => c.resolveAsync("who"), { seed: "a" })).toBe("a");
  });

  it("concurrent requests each see their own seed", async () => {
    const c = new Container();
    const read = async () => {
      await tick();
      return c.requestSeed<string>();
    };
    const [a, b] = await Promise.all([
      c.runInRequest(read, { seed: "a" }),
      c.runInRequest(read, { seed: "b" }),
    ]);
    expect([a, b]).toEqual(["a", "b"]);
  });

  it("nested requests see their own seed and the outer one is restored", async () => {
    const c = new Container();
    const seen = await c.runInRequest(
      async () => {
        const inner = await c.runInRequest(async () => c.requestSeed<string>(), { seed: "inner" });
        return [inner, c.requestSeed<string>()];
      },
      { seed: "outer" },
    );
    expect(seen).toEqual(["inner", "outer"]);
  });

  it("throws ScopeViolationError outside a request", () => {
    expect(() => new Container().requestSeed()).toThrow(ScopeViolationError);
  });

  it("throws MissingRequestSeedError when no seed was passed", async () => {
    const c = new Container();
    const run = c.runInRequest(async () => c.requestSeed());
    await expect(run).rejects.toThrow(MissingRequestSeedError);
    await expect(run).rejects.toThrow(/\{ seed \}/);
  });

  it("falsy seeds, including undefined, are seeds", async () => {
    const c = new Container();
    for (const seed of [0, "", false, null, undefined]) {
      expect(await c.runInRequest(async () => c.requestSeed(), { seed })).toBe(seed);
    }
  });
});
