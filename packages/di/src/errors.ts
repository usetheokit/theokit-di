/**
 * Typed error classes. All container failure modes use these — never
 * `throw new Error(...)` from production code (per system type-safety rule).
 */

import type { Token } from "./types.js";

/**
 * Renders a token to a human-readable string for error messages.
 * - Class tokens: `MyService`
 * - String tokens: `"DATABASE_URL"`
 * - Anything else: `<unknown token>` (defensive — should never happen)
 */
export function describeToken(token: Token): string {
  if (typeof token === "string") {
    return JSON.stringify(token);
  }
  if (typeof token === "function" && typeof token.name === "string" && token.name.length > 0) {
    return token.name;
  }
  return "<unknown token>";
}

/**
 * Renders a constructor's name for a diagnostic, falling back when it has none.
 *
 * `??` is WRONG here and was used at four call sites until 2026-09-01. An
 * anonymous class does not have an absent `name` — it has `""`, and `"" ?? x` is
 * `""`. So the fallbacks never fired, and a consumer who passed a class
 * expression read `Class  has no @Module() decorator.`: two spaces where the
 * identity should be, and nothing at all to search the codebase for.
 *
 * `describeToken` above had the check right (`name.length > 0`) and the other
 * sites drifted from it, so the knowledge lives in one place now.
 */
export function describeClassName(target: unknown, fallback: string): string {
  const name = (target as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" && name.length > 0 ? name : fallback;
}

/**
 * Thrown when `resolve()` / `resolveAsync()` is asked for a token that
 * was never registered.
 */
export class TokenNotFoundError extends Error {
  override readonly name = "TokenNotFoundError" as const;
  constructor(
    public readonly token: Token,
    public readonly resolutionPath: ReadonlyArray<Token>,
  ) {
    const pathStr =
      resolutionPath.length === 0 ? "(top-level)" : resolutionPath.map(describeToken).join(" → ");
    super(
      `No provider registered for token: ${describeToken(token)}\n` + `Resolution path: ${pathStr}`,
    );
  }
}

/**
 * Thrown when a resolution chain contains a cycle (A → B → A).
 * Detected at resolve-time, not register-time.
 *
 * The cycle check happens BEFORE cache lookup in resolveAsync
 * to prevent infinite Promise await deadlocks on async REQUEST-scoped
 * cycles.
 */
export class CyclicDependencyError extends Error {
  override readonly name = "CyclicDependencyError" as const;
  constructor(public readonly cycle: ReadonlyArray<Token>) {
    super(`Cyclic dependency detected: ${cycle.map(describeToken).join(" → ")}`);
  }
}

/**
 * Thrown when sync `resolve()` is called on a chain that contains an
 * async provider. The user must switch to `resolveAsync()`.
 */
export class AsyncProviderInSyncResolveError extends Error {
  override readonly name = "AsyncProviderInSyncResolveError" as const;
  constructor(public readonly token: Token) {
    super(
      `Provider for token ${describeToken(token)} is async (factory returned a Promise). ` +
        `Use container.resolveAsync() instead of container.resolve().`,
    );
  }
}

/**
 * Thrown when a class resolved through sync `resolve()` declares an async
 * `@PostConstruct` hook.
 *
 * The synchronous path cannot await it, and returning an instance whose
 * initialiser is still running would hand the caller something that looks ready
 * and is not — a failure that surfaces later, somewhere else. Failing here names
 * the class and the method instead.
 */
export class AsyncPostConstructInSyncResolveError extends Error {
  override readonly name = "AsyncPostConstructInSyncResolveError" as const;
  constructor(
    public readonly className: string,
    public readonly methodName: string,
  ) {
    super(
      `@PostConstruct ${className}.${methodName}() returned a Promise, and ` +
        `container.resolve() cannot await it. Use container.resolveAsync() instead, ` +
        `or make ${methodName}() synchronous.`,
    );
  }
}

/**
 * Thrown when a REQUEST-scoped provider is resolved outside of
 * `container.runInRequest()`.
 */
export class ScopeViolationError extends Error {
  override readonly name = "ScopeViolationError" as const;
  constructor(
    public readonly token: Token,
    message: string,
  ) {
    super(`Scope violation for token ${describeToken(token)}: ${message}`);
  }
}

/**
 * Thrown when a class is registered as a provider (via `useClass` or shorthand)
 * but lacks the `@Injectable()` decorator. The decorator emits
 * `design:paramtypes` metadata that the container needs to auto-resolve
 * constructor parameters.
 *
 * validateClassProvider() is called by BOTH the declarative
 * `providers: []` path AND the imperative `container.register()` path.
 */
export class MissingInjectableError extends Error {
  override readonly name = "MissingInjectableError" as const;
  constructor(public readonly target: { name?: string }) {
    super(
      `Class ${describeClassName(target, "<anonymous>")} has no @Injectable() decorator. ` +
        `Add @Injectable() above the class declaration before registering it.`,
    );
  }
}

/**
 * Thrown when `container.dispose()` is called and then a subsequent
 * `resolve()` / `resolveAsync()` is attempted.
 */
export class ContainerDisposedError extends Error {
  override readonly name = "ContainerDisposedError" as const;
  constructor() {
    super("Container has been disposed; subsequent resolves are not allowed.");
  }
}

/**
 * Thrown when `register()` or `registerModule()` is called AFTER the first
 * `resolve()` has materialized a singleton. The
 * container freezes after first resolve unless
 * `allowDynamicRegistration: true` was passed to the constructor.
 */
export class ContainerFrozenError extends Error {
  override readonly name = "ContainerFrozenError" as const;
  constructor(public readonly token: Token) {
    super(
      `Container is frozen — cannot register ${describeToken(token)} after first resolve(). ` +
        `Pass { allowDynamicRegistration: true } to the Container constructor to opt out (recommended for tests only).`,
    );
  }
}

/**
 * Thrown when `reflect-metadata` is not loaded. The polyfill mutates the
 * global `Reflect` object; without it, the container cannot read decorator
 * metadata. Surfaces at first `resolve()` of a class provider — but the
 * Container constructor also probes proactively.
 */
export class ReflectMetadataMissingError extends Error {
  override readonly name = "ReflectMetadataMissingError" as const;
  constructor() {
    super(
      "reflect-metadata is not loaded. Import 'reflect-metadata' ONCE at your application entry point " +
        "(e.g., the top of `src/main.ts`) and ensure your tsconfig has " +
        '`"experimentalDecorators": true` and `"emitDecoratorMetadata": true`.',
    );
  }
}
