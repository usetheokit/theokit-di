import { describe, expect, it } from "vitest";

import { Container, Inject, Injectable, Optional } from "../src/index.js";
import { readInjectTokens, readOptionalFlags } from "../src/internal/metadata.js";

// ─────────────────────────────────────────────────────────────────────
// Two decorators of the same kind on one constructor.
//
// Both `@Inject` and `@Optional` open with the same shape:
//
//     const existing = Reflect.getMetadata(KEY, target);
//     const map = existing instanceof Map ? existing : new Map();
//
// With a single decorated parameter only the `new Map()` arm ever runs, and that
// is what every test in this suite exercised. The `existing` arm — the one that
// makes a SECOND decorator on the same constructor accumulate instead of
// clobbering the first — had never been executed.
//
// That arm is the whole reason the code reads metadata before writing it. If it
// were broken, a class with two `@Inject` parameters would resolve exactly one of
// them and silently pass `undefined` for the other.
// ─────────────────────────────────────────────────────────────────────

describe("@Inject accumulates across parameters", () => {
  it("records a token per parameter index rather than keeping only the last", () => {
    @Injectable()
    class TwoInjected {
      constructor(
        @Inject("FIRST") readonly first: string,
        @Inject("SECOND") readonly second: string,
      ) {}
    }

    const tokens = readInjectTokens(TwoInjected);
    expect(tokens.size).toBe(2);
    expect(tokens.get(0)).toBe("FIRST");
    expect(tokens.get(1)).toBe("SECOND");
  });

  it("resolves both parameters end to end, not just the last one decorated", () => {
    @Injectable()
    class Pair {
      constructor(
        @Inject("HOST") readonly host: string,
        @Inject("PORT") readonly port: number,
      ) {}
    }

    // Parameter decorators apply right-to-left, so this is the ordering that
    // would expose a clobbering bug: `HOST` is written second, into the map
    // `PORT` created.
    const container = new Container({
      providers: [
        { provide: "HOST", useValue: "localhost" },
        { provide: "PORT", useValue: 5432 },
        Pair,
      ],
    });

    const pair = container.resolve(Pair) as Pair;
    expect(pair.host).toBe("localhost");
    expect(pair.port).toBe(5432);
  });
});

describe("@Optional accumulates across parameters", () => {
  it("records an index per parameter rather than keeping only the last", () => {
    @Injectable()
    class TwoOptional {
      constructor(
        @Optional() @Inject("MISSING_A") readonly a?: string,
        @Optional() @Inject("MISSING_B") readonly b?: string,
      ) {}
    }

    const flags = readOptionalFlags(TwoOptional);
    expect(flags.size).toBe(2);
    expect(flags.has(0)).toBe(true);
    expect(flags.has(1)).toBe(true);
  });
});
