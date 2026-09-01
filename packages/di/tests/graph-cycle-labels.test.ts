import { describe, expect, it } from "vitest";

import { findCycles } from "../src/internal/graph.js";
import type { Token } from "../src/types.js";

// ─────────────────────────────────────────────────────────────────────
// Cycle labelling and de-duplication.
//
// `findCycles` reports each distinct cycle once. "Distinct" is decided by
// `canonicalCycleKey`, which rotates the cycle so its smallest stringified token
// comes first — so the same loop found from two different entry points collapses
// to one report. Two things were never exercised:
//
//   1. the rotation itself, which only does work when the smallest token is NOT
//      already first. Every prior test happened to enter its cycle at the
//      alphabetically-first node, so the loop that finds the minimum never took
//      its `<` branch and the de-duplication was, in coverage terms, a no-op.
//   2. two of the three arms of `stringifyToken`. Tokens can be strings, classes
//      or anything else the caller registered — a symbol, most realistically —
//      and an anonymous class has no `.name` to print.
//
// These are tested against `findCycles` directly rather than through
// `Container.analyze()`, because a symbol token in a real container never
// participates in a class-constructor cycle: the shapes exist in the graph layer
// and can only be reached there.
// ─────────────────────────────────────────────────────────────────────

const singleton = "singleton" as never;

function snapshotOf(tokens: ReadonlyArray<Token>, edges: ReadonlyArray<[Token, Token]>) {
  return {
    nodes: tokens.map((token) => ({ token, scope: singleton, isAsync: false })),
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}

describe("findCycles — de-duplication across entry points", () => {
  it("reports one cycle when the entry node is not the smallest token", () => {
    // Entering at "z" means the minimum ("a") sits last, which is the only way
    // the rotation loop advances past its first element.
    const cycles = findCycles(
      snapshotOf(
        ["z", "a"],
        [
          ["z", "a"],
          ["a", "z"],
        ],
      ),
    );

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(["z", "a", "z"]);
  });

  it("reports one cycle, not three, for a triangle reachable from every corner", () => {
    const cycles = findCycles(
      snapshotOf(
        ["c", "b", "a"],
        [
          ["c", "b"],
          ["b", "a"],
          ["a", "c"],
        ],
      ),
    );

    expect(cycles).toHaveLength(1);
  });
});

describe("findCycles — tokens that are not strings", () => {
  it("labels a cycle through a symbol token without throwing", () => {
    const marker = Symbol("marker") as unknown as Token;
    const cycles = findCycles(
      snapshotOf(
        [marker, "a"],
        [
          [marker, "a"],
          ["a", marker],
        ],
      ),
    );

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toContain(marker);
  });

  it("labels a cycle through an anonymous class without throwing", () => {
    // A class expression assigned to a `const` normally INFERS a name, so the
    // `?? "<anon>"` fallback needs a constructor that genuinely has none.
    const anonymous = (() => class {})() as unknown as Token;
    expect((anonymous as { name?: string }).name).toBe("");

    const cycles = findCycles(
      snapshotOf(
        [anonymous, "a"],
        [
          [anonymous, "a"],
          ["a", anonymous],
        ],
      ),
    );

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toContain(anonymous);
  });

  it("still collapses a symbol cycle found from its other end", () => {
    const marker = Symbol("marker") as unknown as Token;
    // Two disconnected components sharing no node: each yields its own cycle, so
    // a wrong canonical key would show up as a collapse that should not happen.
    const cycles = findCycles(
      snapshotOf(
        [marker, "a", "b", "c"],
        [
          [marker, "a"],
          ["a", marker],
          ["b", "c"],
          ["c", "b"],
        ],
      ),
    );

    expect(cycles).toHaveLength(2);
  });
});
