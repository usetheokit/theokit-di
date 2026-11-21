import { Container, Scope } from "@theokit/di";
import { describe, expect, it, vi } from "vitest";

import { AGENT_TOKEN, createAgentBoundary, createAgentProvider } from "../src/index.js";

interface A {
  seed: string;
  disposed: boolean;
  dispose(): void;
}
const make = (seed: string): A => ({
  seed,
  disposed: false,
  dispose() {
    this.disposed = true;
  },
});

describe("createAgentBoundary", () => {
  it("calls the factory once with the seed", async () => {
    const factory = vi.fn(make);
    const b = createAgentBoundary({ factory });
    await b.withAgent("m1", (a) => a.seed);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith("m1");
  });

  it("shares one agent between collaborators in one work", async () => {
    const container = new Container();
    const b = createAgentBoundary({ factory: make, container });
    await b.withAgent("m1", async (a) => {
      expect(await container.resolveAsync(AGENT_TOKEN)).toBe(a);
      expect(container.requestSeed()).toBe("m1");
    });
  });

  it("gives concurrent calls their own agents", async () => {
    const b = createAgentBoundary({ factory: async (s: string) => make(s) });
    const [x, y] = await Promise.all([
      b.withAgent("a", async (ag) => {
        await new Promise((r) => setTimeout(r, 5));
        return ag;
      }),
      b.withAgent("b", (ag) => ag),
    ]);
    expect(x).not.toBe(y);
    expect([x.seed, y.seed]).toEqual(["a", "b"]);
  });

  it("disposes the agent when work settles, on success and throw", async () => {
    const b = createAgentBoundary({ factory: make });
    const ok = await b.withAgent("s", (a) => a);
    expect(ok.disposed).toBe(true);
    let seen!: A;
    await expect(
      b.withAgent("s", (a) => {
        seen = a;
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(seen.disposed).toBe(true);
  });

  it("rejects with the factory's own error", async () => {
    const err = new Error("boom");
    const b = createAgentBoundary({
      factory: () => {
        throw err;
      },
    });
    await expect(b.withAgent("s", () => 1)).rejects.toBe(err);
  });
});

describe("createAgentProvider without a seed", () => {
  it("still resolves inside a plain runInRequest", async () => {
    const c = new Container();
    c.register(createAgentProvider({ factory: () => ({ id: 1 }), scope: Scope.REQUEST }));
    expect(await c.runInRequest(() => c.resolveAsync(AGENT_TOKEN))).toEqual({ id: 1 });
  });
});
