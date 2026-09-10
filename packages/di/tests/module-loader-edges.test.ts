import { describe, expect, it } from "vitest";

import { Container, Injectable, Module } from "../src/index.js";
import { InvalidModuleError } from "../src/internal/module-loader.js";

// ─────────────────────────────────────────────────────────────────────
// Module-graph shapes the suite had never walked.
//
// The loader is a DFS with a path stack. Its cycle detection was tested; the two
// arms that make a NON-cyclic repeat harmless were not:
//
//   - the diamond (A imports B and C; both import D). D is reached twice on two
//     different paths, which is legal and must register D's providers exactly
//     once. The guard that does that — `if (visited.has(target)) return` — sits
//     one line below the cycle throw, so a regression there surfaces as either a
//     spurious `CyclicModuleImportError` or a double registration.
//   - an anonymous class handed to `registerModule`, whose error message falls
//     back to "<anonymous>". A consumer meets that string when they pass a class
//     expression, and it is the whole content of the diagnostic they get.
// ─────────────────────────────────────────────────────────────────────

describe("module loader — a diamond is not a cycle", () => {
  it("registers a doubly-imported module once and resolves it", () => {
    @Injectable()
    class SharedService {
      readonly id = "shared";
    }

    @Module({ providers: [SharedService], exports: [SharedService] })
    class SharedModule {}

    @Module({ imports: [SharedModule] })
    class LeftModule {}

    @Module({ imports: [SharedModule] })
    class RightModule {}

    @Module({ imports: [LeftModule, RightModule] })
    class RootModule {}

    const container = new Container();
    // The throw this asserts against is `CyclicModuleImportError`: reaching
    // SharedModule twice must not look like a loop.
    expect(() => container.registerModule(RootModule)).not.toThrow();

    const first = container.resolve(SharedService) as SharedService;
    const second = container.resolve(SharedService) as SharedService;
    expect(first.id).toBe("shared");
    // One registration, singleton scope — two resolves are the same instance.
    // A double registration would have replaced the provider and could return a
    // different object here.
    expect(second).toBe(first);
  });
});

describe("module loader — an undecorated class", () => {
  it("names the class in the error when it has a name", () => {
    class NotAModule {}

    const container = new Container();
    expect(() => container.registerModule(NotAModule)).toThrow(InvalidModuleError);
    expect(() => container.registerModule(NotAModule)).toThrow(/Class NotAModule has no @Module/);
  });

  it("falls back to <anonymous> when the class has no name", () => {
    // Returned from a call so no binding infers a name for it.
    const anonymous = (() => class {})();
    expect((anonymous as { name?: string }).name).toBe("");

    const container = new Container();
    expect(() => container.registerModule(anonymous)).toThrow(
      /Class <anonymous> has no @Module\(\) decorator/,
    );
  });
});
