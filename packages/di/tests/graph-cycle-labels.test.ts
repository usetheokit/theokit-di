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
//   2. cycles through a token that is neither a string nor a named class — a
//      symbol, or an anonymous class. Those went through a renderer that no
//      longer exists (see below); what they exercise now is that the walk and
//      its de-duplication handle a token they cannot describe.
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

describe("findCycles — de-duplication keys on identity, not on a label", () => {
  // A label is not an identity. The canonical key used to be built out of a
  // token's RENDERING, so two DIFFERENT classes that happen to share a `name`
  // produced the same key and the second cycle was discarded as a duplicate of
  // the first. The key is built from an identity table now.
  //
  // The trigger is not exotic. Two files each declaring `class Logger` and
  // `class Service` is close to inevitable in a codebase of any size, and costs
  // nothing anywhere else in JavaScript.

  it("reports both cycles when two disjoint pairs share their class names", () => {
    const makePair = () => {
      class Logger {}
      class Service {}
      return [Logger as unknown as Token, Service as unknown as Token] as const;
    };
    const [firstLogger, firstService] = makePair();
    const [secondLogger, secondService] = makePair();

    // Same name, different constructor — the premise the assertion rests on.
    expect((firstLogger as { name: string }).name).toBe((secondLogger as { name: string }).name);
    expect(firstLogger).not.toBe(secondLogger);

    const cycles = findCycles(
      snapshotOf(
        [firstLogger, firstService, secondLogger, secondService],
        [
          [firstLogger, firstService],
          [firstService, firstLogger],
          [secondLogger, secondService],
          [secondService, secondLogger],
        ],
      ),
    );

    expect(cycles).toHaveLength(2);
  });

  it("reports both cycles when two disjoint pairs are anonymous classes", () => {
    // Every anonymous class renders as the same label, so they collided with each
    // other for the same reason.
    const anon = () => (() => class {})() as unknown as Token;
    const [a1, a2, b1, b2] = [anon(), anon(), anon(), anon()];

    const cycles = findCycles(
      snapshotOf(
        [a1, a2, b1, b2],
        [
          [a1, a2],
          [a2, a1],
          [b1, b2],
          [b2, b1],
        ],
      ),
    );

    expect(cycles).toHaveLength(2);
  });

  it("reports both cycles when two disjoint pairs are symbol tokens", () => {
    const sym = () => Symbol("token") as unknown as Token;
    const [a1, a2, b1, b2] = [sym(), sym(), sym(), sym()];

    const cycles = findCycles(
      snapshotOf(
        [a1, a2, b1, b2],
        [
          [a1, a2],
          [a2, a1],
          [b1, b2],
          [b2, b1],
        ],
      ),
    );

    expect(cycles).toHaveLength(2);
  });

  it("rotates when a later cycle carries a token numbered before its own entry", () => {
    // Ids are handed out in the order tokens first appear IN A RECORDED CYCLE, not
    // in visit order, so a cycle found later can contain a token that already holds
    // a lower number than the node the walk entered it on. That is the only shape
    // in which the rotation does any work, and without it the loop below is dead:
    //
    //   outer → inner → leaf → inner   records [inner, leaf, inner]  ids inner=0, leaf=1
    //   inner → outer                  records [outer, inner, outer] ids outer=2 → [2,0,2]
    //
    // The second key must rotate to 0→2→2, and a broken rotation would key it as
    // 2→0→2 — still unique here, but no longer entry-point independent, which is
    // the entire property this key exists to have.
    const cycles = findCycles(
      snapshotOf(
        ["outer", "inner", "leaf"],
        [
          ["outer", "inner"],
          ["inner", "leaf"],
          ["inner", "outer"],
          ["leaf", "inner"],
        ],
      ),
    );

    expect(cycles).toHaveLength(2);
    expect(cycles).toContainEqual(["inner", "leaf", "inner"]);
    expect(cycles).toContainEqual(["outer", "inner", "outer"]);
  });

  it("still collapses one cycle reached twice within a single walk", () => {
    // The de-duplication must keep doing its job. `hub` is reached from two
    // predecessors, so the back edge into it is traversed twice on two different
    // paths — one cycle, found twice.
    const cycles = findCycles(
      snapshotOf(
        ["hub", "left", "right"],
        [
          ["hub", "left"],
          ["hub", "right"],
          ["left", "hub"],
          ["right", "hub"],
        ],
      ),
    );

    // Two distinct loops here (hub→left→hub and hub→right→hub), not one — the
    // point is that neither is reported twice.
    expect(cycles).toHaveLength(2);
    const keys = cycles.map((c) => c.map(String).join(","));
    expect(new Set(keys).size).toBe(keys.length);
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
