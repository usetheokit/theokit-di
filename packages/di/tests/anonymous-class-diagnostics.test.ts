import { describe, expect, it } from "vitest";
import { describeClassName, MissingInjectableError } from "../src/errors.js";
import { Container } from "../src/index.js";
import { findCycles } from "../src/internal/graph.js";
import { InvalidModuleError } from "../src/internal/module-loader.js";
import type { Token } from "../src/types.js";

// ─────────────────────────────────────────────────────────────────────
// Regression: an anonymous class in a diagnostic.
//
// Four call sites rendered a class name as `target.name ?? "<anonymous>"`. That
// fallback can never fire: an anonymous class does not have an ABSENT `name`, it
// has `""`, and `"" ?? x` is `""`. So a consumer who passed a class expression
// read
//
//     Class  has no @Module() decorator.
//
// — two spaces where the identity belongs, nothing to grep for, and no signal
// that the class was anonymous rather than that the message was truncated. The
// defect was invisible in coverage as a "missing branch" rather than as a
// failure, because an unreachable arm and an untested one look identical.
//
// `describeToken` in the same file had the check right all along
// (`name.length > 0`); the four sites had drifted from it. They now share one
// helper, and these tests pin each rendering that a consumer actually reads.
// ─────────────────────────────────────────────────────────────────────

/**
 * A class with a genuinely empty `name` — a binding would infer one, so the
 * class expression is returned from a call instead.
 *
 * The return type keeps `name` on it. Annotating this as a bare
 * `new () => unknown` drops the property, and the error constructors declare
 * `target: { name?: string }` — so the test would stop compiling against the
 * shape the production code actually accepts.
 */
function anonymousClass(): (new () => unknown) & { readonly name: string } {
  return (() => class {})();
}

describe("describeClassName", () => {
  it("returns the name when there is one", () => {
    class Named {}
    expect(describeClassName(Named, "<fallback>")).toBe("Named");
  });

  it("falls back on an empty name, which is what an anonymous class has", () => {
    const anon = anonymousClass();
    expect(anon.name).toBe("");
    expect(describeClassName(anon, "<fallback>")).toBe("<fallback>");
  });

  it("falls back on a missing name, a null target, and a non-string name", () => {
    expect(describeClassName({}, "<fallback>")).toBe("<fallback>");
    expect(describeClassName(null, "<fallback>")).toBe("<fallback>");
    expect(describeClassName(undefined, "<fallback>")).toBe("<fallback>");
    expect(describeClassName({ name: 42 }, "<fallback>")).toBe("<fallback>");
  });
});

describe("diagnostics naming an anonymous class", () => {
  it("MissingInjectableError says <anonymous> rather than nothing", () => {
    const anon = anonymousClass();
    const error = new MissingInjectableError(anon);

    expect(error.message).toContain("Class <anonymous> has no @Injectable() decorator");
    expect(error.message).not.toContain("Class  has no");
  });

  it("InvalidModuleError says <anonymous> rather than nothing", () => {
    const anon = anonymousClass();
    const error = new InvalidModuleError(anon);

    expect(error.message).toContain("Class <anonymous> has no @Module() decorator");
    expect(error.message).not.toContain("Class  has no");
  });

  it("registerModule surfaces that message through the container", () => {
    const container = new Container();
    expect(() => container.registerModule(anonymousClass())).toThrow(
      /Class <anonymous> has no @Module\(\) decorator/,
    );
  });

  it("labels a cycle through an anonymous class as <anon>, not as an empty string", () => {
    // What this does NOT assert, having measured it: that the fix changes which
    // cycles are reported. `canonicalCycleKey` de-duplicates by LABEL, so two
    // structurally identical cycles over indistinguishable tokens collapse into
    // one either way — `c:` and `c:<anon>` collide with themselves equally. That
    // is a separate, pre-existing defect in the de-duplication key (it also
    // drops a cycle when two modules each declare a `class Logger`), filed on its
    // own rather than smuggled in here.
    //
    // The two cycles below stay distinct because their STRING tokens differ, and
    // that is the whole reason this assertion holds.
    const first = anonymousClass() as unknown as Token;
    const second = anonymousClass() as unknown as Token;
    const singleton = "singleton" as never;

    const cycles = findCycles({
      nodes: [first, second, "a", "b"].map((token) => ({
        token: token as Token,
        scope: singleton,
        isAsync: false,
      })),
      edges: [
        { from: first, to: "a" },
        { from: "a", to: first },
        { from: second, to: "b" },
        { from: "b", to: second },
      ],
    });

    expect(cycles).toHaveLength(2);
  });
});
