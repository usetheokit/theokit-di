import { afterEach, describe, expect, it } from "vitest";

import { Module, readModuleMetadata } from "../src/decorators/module.js";
import {
  isInjectable,
  METADATA_KEYS,
  readInjectableMetadata,
  readInjectTokens,
  readOptionalFlags,
  readParamTypes,
  readPostConstruct,
  readPreDestroy,
} from "../src/internal/metadata.js";

// ─────────────────────────────────────────────────────────────────────
// The reader layer's fail-safe paths.
//
// Every reader in `internal/metadata.ts` opens with `if (!hasReflectMetadata())`
// and the docblocks promise what happens next: "Returns [] if the class was not
// decorated OR emitDecoratorMetadata is off in the consumer's tsconfig." That
// promise was untested — the suite imports `reflect-metadata` once in
// `vitest.setup.ts`, so every test ran with the polyfill present and the guard
// arms were dead weight in coverage.
//
// It is not a hypothetical consumer either: a consumer who forgets the
// `reflect-metadata` import gets these paths on their first resolve, and the
// contract they meet is "an empty collection, not a crash". A guard nobody has
// watched work is a guard nobody knows the shape of.
// ─────────────────────────────────────────────────────────────────────

/**
 * Run `fn` with `Reflect.getMetadata` removed, then put it back.
 *
 * Deleting the property rather than reassigning it is what the guard actually
 * tests for (`typeof Reflect.getMetadata !== "function"`), and it is the state a
 * consumer who never imported `reflect-metadata` is really in. The restore runs
 * in `finally` so a failing assertion cannot leave the polyfill missing for the
 * rest of the file — that would turn one red test into every red test.
 */
function withoutReflectMetadata<T>(fn: () => T): T {
  const holder = Reflect as unknown as Record<string, unknown>;
  const saved = holder.getMetadata;
  delete holder.getMetadata;
  try {
    return fn();
  } finally {
    holder.getMetadata = saved;
  }
}

class Undecorated {}

afterEach(() => {
  // Belt and braces: the helper restores in `finally`, and this catches a throw
  // from anywhere else in the file that skipped the helper entirely.
  expect(typeof (Reflect as unknown as { getMetadata?: unknown }).getMetadata).toBe("function");
});

describe("metadata readers without reflect-metadata", () => {
  it("readParamTypes returns an empty array instead of throwing", () => {
    expect(withoutReflectMetadata(() => readParamTypes(Undecorated))).toEqual([]);
  });

  it("readInjectTokens returns an empty map instead of throwing", () => {
    const out = withoutReflectMetadata(() => readInjectTokens(Undecorated));
    expect(out.size).toBe(0);
  });

  it("readOptionalFlags returns an empty set instead of throwing", () => {
    const out = withoutReflectMetadata(() => readOptionalFlags(Undecorated));
    expect(out.size).toBe(0);
  });

  it("readInjectableMetadata returns undefined instead of throwing", () => {
    expect(withoutReflectMetadata(() => readInjectableMetadata(Undecorated))).toBeUndefined();
  });

  it("isInjectable reports false rather than claiming a decorator it cannot read", () => {
    expect(withoutReflectMetadata(() => isInjectable(Undecorated))).toBe(false);
  });

  it("readPostConstruct returns undefined instead of throwing", () => {
    expect(withoutReflectMetadata(() => readPostConstruct(Undecorated))).toBeUndefined();
  });

  it("readPreDestroy returns undefined instead of throwing", () => {
    expect(withoutReflectMetadata(() => readPreDestroy(Undecorated))).toBeUndefined();
  });

  it("readModuleMetadata returns undefined instead of throwing", () => {
    @Module({ providers: [] })
    class DecoratedModule {}

    // Decorated, so the ONLY reason for `undefined` here is the missing reader —
    // which is what distinguishes this from the undecorated case below.
    expect(readModuleMetadata(DecoratedModule)).toBeDefined();
    expect(withoutReflectMetadata(() => readModuleMetadata(DecoratedModule))).toBeUndefined();
  });
});

describe("metadata readers against a value of the wrong shape", () => {
  // These arms exist because `Reflect.getMetadata` returns `unknown`. Anything
  // can be under the key — another library writing to a colliding key, or a
  // hand-rolled `defineMetadata` call. The readers narrow rather than trust, and
  // the narrowing had never been exercised with a value that fails it.

  it("readInjectableMetadata rejects a non-object under the injectable key", () => {
    class Wrong {}
    Reflect.defineMetadata(METADATA_KEYS.INJECTABLE, "not-an-object", Wrong);

    expect(readInjectableMetadata(Wrong)).toBeUndefined();
    expect(isInjectable(Wrong)).toBe(false);
  });

  it("readModuleMetadata rejects a non-object under the module key", () => {
    // The key is a private constant in `decorators/module.ts`. Reading it back off
    // a decorated class instead of retyping the literal is what keeps this test
    // honest: a hardcoded key that stopped matching would leave the assertion
    // passing over an undecorated class, which is a green test measuring nothing.
    @Module({ providers: [] })
    class Probe {}
    const [moduleKey] = Reflect.getOwnMetadataKeys(Probe) as string[];
    expect(moduleKey).toBeDefined();

    class WrongModule {}
    Reflect.defineMetadata(moduleKey as string, 42, WrongModule);

    expect(readModuleMetadata(WrongModule)).toBeUndefined();
  });
});
