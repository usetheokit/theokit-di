/**
 * Container — the DI runtime. Implements:
 *   - 3 scopes (SINGLETON / TRANSIENT / REQUEST via AsyncLocalStorage)
 *   - 4 provider types (useClass / useFactory / useValue / useExisting)
 *   - Cycle detection at resolve-time (path tracking)
 *   - Promise-lock REQUEST cache with cycle-first ordering and reject cleanup
 *   - Disposal lifecycle + freeze on first resolve
 */

import { AsyncLocalStorage } from "node:async_hooks";

import {
  AsyncPostConstructInSyncResolveError,
  AsyncProviderInSyncResolveError,
  ContainerDisposedError,
  ContainerFrozenError,
  CyclicDependencyError,
  describeClassName,
  describeToken,
  MissingInjectableError,
  ReflectMetadataMissingError,
  ScopeViolationError,
  TokenNotFoundError,
} from "./errors.js";
import { findCycles, type GraphEdge, type GraphNode } from "./internal/graph.js";
import {
  hasReflectMetadata,
  isInjectable,
  isPrimitiveTypeMarker,
  readInjectableMetadata,
  readInjectTokens,
  readOptionalFlags,
  readParamTypes,
  readPostConstruct,
  readPreDestroy,
} from "./internal/metadata.js";
import { loadModule } from "./internal/module-loader.js";
import type {
  ClassConstructor,
  ClassProvider,
  ContainerOptions,
  ExistingProvider,
  FactoryProvider,
  Provider,
  ResolutionContext,
  Token,
  ValueProvider,
} from "./types.js";
import { Scope } from "./types.js";

interface RequestStore {
  /**
   * Per-request cache. Stores either a resolved value OR a pending Promise
   * during materialization. On Promise rejection, the entry is
   * deleted.
   */
  readonly cache: Map<Token, unknown>;
  /** Instances created during this request — torn down when the request ends. */
  readonly instances: TrackedInstance[];
}

interface Disposable {
  dispose(): void | Promise<void>;
}

/**
 * An instance the container will tear down: it implements `Disposable`, declares a
 * `@PreDestroy` hook, or both. Wider than `Disposable` because a class whose only
 * teardown is the decorator has no `dispose()` to detect.
 */
type TrackedInstance = object;

/**
 * Marks a {@link ResolutionContext} created by the asynchronous path.
 *
 * The two contexts are otherwise identical, but `@PostConstruct` has to behave
 * differently in each: `resolveAsync` can await an async hook, `resolve` cannot. A
 * symbol keeps the distinction off the public `ResolutionContext` type.
 */
const ASYNC_CONTEXT = Symbol("theokit.di.asyncContext");

function isAsyncContext(ctx: ResolutionContext): boolean {
  return (ctx as unknown as Record<symbol, unknown>)[ASYNC_CONTEXT] === true;
}

interface Registration<T = unknown> {
  readonly token: Token<T>;
  readonly scope: Scope;
  readonly factory: (ctx: ResolutionContext) => T | Promise<T>;
  /**
   * For class providers — the target class. Used by `analyze()` to derive
   * edges via `design:paramtypes` metadata.
   */
  readonly classTarget?: ClassConstructor<T>;
  /**
   * For factory providers — the explicit inject list. Used by `analyze()`
   * to derive edges.
   */
  readonly injectTokens?: ReadonlyArray<Token>;
  /**
   * For existing providers — the aliased token. Used by `analyze()` to
   * derive edges.
   */
  readonly aliasTarget?: Token;
  /**
   * Whether the container CONSTRUCTED what this registration resolves to, and therefore owns
   * tearing it down.
   *
   * True for a class and for a factory: the container ran the code that produced the instance, and
   * in the ordinary case nobody else holds a reference, so nobody else can close it.
   *
   * False for a value and for an alias, for two different reasons. A `useValue` was built by the
   * caller, who still holds it — disposing it here would close, on the caller's behalf, a resource
   * the caller is also entitled to close, and a double close is a failure neither side can see
   * coming. An alias resolves to an instance ANOTHER registration already tracks, so tracking it
   * again would dispose one object once per token that names it.
   */
  readonly containerOwned: boolean;
}

/**
 * Lightweight DI container. See `README.md` for usage examples.
 *
 * **On the size of this class.** It is deliberately large: the single point
 * of truth for DI resolution, covering registry lookup, the SINGLETON,
 * TRANSIENT and REQUEST lifecycles, `@Injectable` metadata reads, alias
 * resolution, request-scope propagation through `AsyncLocalStorage`, and the
 * dispose chain. Splitting those concerns across separate classes would
 * fragment cohesion and force consumers to coordinate through an internal
 * micro-interface that buys neither testability nor extensibility.
 *
 * The complexity budget is held at the method level instead: long methods
 * are broken up with Extract Method, which is why several private helpers
 * below exist only to keep their caller readable.
 */
export class Container {
  private readonly registrations = new Map<Token, Registration>();
  private readonly singletonCache = new Map<Token, unknown>();
  private readonly singletonInstances: TrackedInstance[] = [];
  private readonly requestStorage = new AsyncLocalStorage<RequestStore>();
  private readonly options: Required<ContainerOptions>;
  private hasResolved = false;
  private disposed = false;

  constructor(options: ContainerOptions = {}) {
    this.options = {
      providers: options.providers ?? [],
      allowDynamicRegistration: options.allowDynamicRegistration ?? false,
    };
    // Proactive probe — if reflect-metadata is missing, surface early
    // rather than at first resolve. ReflectMetadataMissingError is thrown
    // only at the first class-resolve attempt; we tolerate non-class
    // setups (only value/factory providers don't need it).
    // (No throw here — see resolveClass.)
    for (const provider of this.options.providers) {
      this.register(provider);
    }
  }

  /**
   * Register a provider. Accepts:
   *   - A full Provider (useClass / useFactory / useValue / useExisting)
   *   - A bare class (shorthand expands to ClassProvider { provide: X, useClass: X })
   *
   * ClassProvider validation runs via `validateClassProvider()`
   * regardless of which API path was used.
   */
  register<T>(providerOrClass: Provider<T> | ClassConstructor<T>): void {
    this.assertNotDisposed();
    this.assertNotFrozen(this.tokenOf(providerOrClass));

    const provider = this.normalizeShorthand(providerOrClass);
    this.validateProvider(provider);

    const registration = this.normalizeProvider(provider);

    if (this.registrations.has(registration.token)) {
      // NestJS behavior: last write wins. Single stderr warn.
      process.stderr.write(
        `[@theokit/di] Warning: provider for token ${describeToken(registration.token)} replaced.\n`,
      );
    }
    this.registrations.set(registration.token, registration);
  }

  /**
   * Load a `@Module()`-decorated class plus all transitively imported
   * modules. Walks imports BFS, registers every provider, validates
   * exports.
   *
   * An undecorated class throws `InvalidModuleError`. Respects the
   * freeze-after-first-resolve guarantee — each child `register()` checks
   * `assertNotFrozen`.
   */
  registerModule(moduleClass: ClassConstructor): void {
    this.assertNotDisposed();
    loadModule(moduleClass, this);
  }

  /**
   * True if the container has a registration for `token`.
   */
  has(token: Token): boolean {
    return this.registrations.has(token);
  }

  /**
   * Synchronously resolve a token. Throws `AsyncProviderInSyncResolveError`
   * if the resolution chain contains an async provider.
   */
  resolve<T>(token: Token<T>): T {
    this.assertNotDisposed();
    this.hasResolved = true;
    const ctx = this.createContext([]);
    return this.resolveInContext(token, ctx) as T;
  }

  /**
   * Asynchronously resolve a token. Always returns a Promise even for sync
   * providers (for API uniformity).
   */
  async resolveAsync<T>(token: Token<T>): Promise<T> {
    this.assertNotDisposed();
    this.hasResolved = true;
    const ctx = this.createContextAsync([]);
    return (await this.resolveAsyncInContext(token, ctx)) as T;
  }

  /**
   * Run `callback` inside a fresh REQUEST scope. All REQUEST-scoped
   * providers resolved within `callback` (or any async continuation) share
   * a single per-request cache.
   *
   * try/finally guarantees REQUEST-scoped instances are disposed
   * even if the callback throws.
   */
  async runInRequest<R>(callback: () => R | Promise<R>): Promise<R> {
    this.assertNotDisposed();
    const store: RequestStore = {
      cache: new Map(),
      instances: [],
    };
    try {
      return await this.requestStorage.run(store, async () => callback());
    } finally {
      await this.disposeInstances(store.instances);
    }
  }

  /**
   * Debug helper — returns a snapshot of the dependency graph.
   *
   * Detects cycles in unused providers too (resolve-time
   * detection only fires for resolves that actually traverse the cycle).
   * Use this proactively in tests / dev mode to surface latent cycles.
   */
  analyze(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    cycles: ReadonlyArray<ReadonlyArray<Token>>;
  } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (const [token, registration] of this.registrations.entries()) {
      nodes.push({
        token,
        scope: registration.scope,
        isAsync: false, // resolved at resolve-time; v1 leaves this as best-effort.
      });
      // Edges are inferred via constructor metadata for class providers and
      // explicit inject lists for factory providers. ValueProvider has none.
      const deps = this.getDirectDependencies(token);
      for (const dep of deps) {
        edges.push({ from: token, to: dep });
      }
    }
    const cycles = findCycles({ nodes, edges });
    return { nodes, edges, cycles };
  }

  private getDirectDependencies(token: Token): ReadonlyArray<Token> {
    const registration = this.registrations.get(token);
    if (registration === undefined) return [];

    // FactoryProvider: explicit inject list.
    if (registration.injectTokens !== undefined) {
      return registration.injectTokens;
    }

    // ExistingProvider: single alias.
    if (registration.aliasTarget !== undefined) {
      return [registration.aliasTarget];
    }

    // ClassProvider: read paramtypes from the target class (NOT from `token`,
    // since the registered token may be a string while useClass points to
    // a class).
    const classTarget = registration.classTarget;
    if (classTarget !== undefined) {
      const out: Token[] = [];
      const paramTypes = readParamTypes(classTarget);
      const injectTokens = readInjectTokens(classTarget);
      paramTypes.forEach((paramType, i) => {
        const explicit = injectTokens.get(i);
        if (explicit !== undefined) {
          out.push(explicit);
        } else if (!isPrimitiveTypeMarker(paramType)) {
          out.push(paramType as Token);
        }
      });
      return out;
    }

    // ValueProvider has no deps.
    return [];
  }

  /**
   * Dispose the container — runs `dispose()` (or `Symbol.asyncDispose`) on
   * every singleton instance in reverse construction order. Idempotent.
   * Subsequent `resolve()` throws `ContainerDisposedError`.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.disposeInstances(this.singletonInstances);
    this.singletonCache.clear();
  }

  /**
   * Symbol.asyncDispose alias — enables `await using container = new Container(...)`.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: validation
  // ─────────────────────────────────────────────────────────────────────

  private normalizeShorthand<T>(providerOrClass: Provider<T> | ClassConstructor<T>): Provider<T> {
    if (typeof providerOrClass === "function") {
      // Bare class — expand to ClassProvider { provide: X, useClass: X }
      return {
        provide: providerOrClass,
        useClass: providerOrClass,
      };
    }
    return providerOrClass;
  }

  private tokenOf<T>(providerOrClass: Provider<T> | ClassConstructor<T>): Token<T> {
    if (typeof providerOrClass === "function") return providerOrClass;
    return providerOrClass.provide;
  }

  private validateProvider<T>(provider: Provider<T>): void {
    if (provider.provide === undefined || provider.provide === null) {
      throw new TypeError(
        "Provider.provide must be a class or non-empty string token, got: " +
          String(provider.provide),
      );
    }
    if ("useClass" in provider) {
      this.validateClassProvider(provider as ClassProvider<T>);
    }
    // ExistingProvider's target is validated lazily (resolve-time) — the
    // chain may legitimately point to another existing provider not yet
    // registered. ValueProvider needs no validation. FactoryProvider's
    // `inject` tokens are validated lazily.
  }

  /**
   * Shared by both declarative providers: [] AND imperative
   * register() — every class provider must have @Injectable().
   */
  private validateClassProvider<T>(provider: ClassProvider<T>): void {
    if (typeof provider.useClass !== "function") {
      throw new TypeError(
        `ClassProvider.useClass must be a class constructor, got ${typeof provider.useClass}.`,
      );
    }
    if (!isInjectable(provider.useClass)) {
      throw new MissingInjectableError(provider.useClass as { name?: string });
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new ContainerDisposedError();
  }

  /**
   * The container freezes on first resolve. Late registrations
   * require explicit `allowDynamicRegistration: true` (testing escape hatch).
   */
  private assertNotFrozen(token: Token): void {
    if (this.hasResolved && !this.options.allowDynamicRegistration) {
      throw new ContainerFrozenError(token);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: provider normalization to Registration
  // ─────────────────────────────────────────────────────────────────────

  private normalizeProvider<T>(provider: Provider<T>): Registration<T> {
    if ("useClass" in provider) {
      return this.fromClassProvider(provider);
    }
    if ("useFactory" in provider) {
      return this.fromFactoryProvider(provider);
    }
    if ("useValue" in provider) {
      return this.fromValueProvider(provider);
    }
    return this.fromExistingProvider(provider);
  }

  private fromClassProvider<T>(provider: ClassProvider<T>): Registration<T> {
    const target = provider.useClass;
    const scopeFromDecorator = readInjectableMetadata(target)?.scope;
    const scope = provider.scope ?? scopeFromDecorator ?? Scope.SINGLETON;
    return {
      token: provider.provide,
      scope,
      factory: (ctx) => this.constructClassWithAsyncFallback(target, ctx),
      classTarget: target,
      containerOwned: true,
    };
  }

  private fromFactoryProvider<T>(provider: FactoryProvider<T>): Registration<T> {
    const injectTokens = provider.inject ?? [];
    return {
      token: provider.provide,
      scope: provider.scope ?? Scope.SINGLETON,
      factory: (ctx) => {
        // Refactored via Extract Method (D422): delegate sync attempt
        // to tryResolveSyncDeps to keep this lambda below complexity-10.
        const result = this.tryResolveSyncDeps(injectTokens, ctx);
        if ("args" in result) {
          return provider.useFactory(...result.args);
        }
        // Async fallback: await every dep, then invoke factory.
        return Promise.all(injectTokens.map((dep) => ctx.resolveAsync(dep))).then((asyncArgs) =>
          provider.useFactory(...asyncArgs),
        );
      },
      injectTokens,
      containerOwned: true,
    };
  }

  /**
   * Attempt sync resolution of a flat dep list (factory provider shape).
   * Returns `{ args }` on success or `{ needsAsync: true }` if any dep
   * raised AsyncProviderInSyncResolveError. Throws for any other error.
   * Extracted via D422 to keep fromFactoryProvider.factory below complexity 10.
   */
  private tryResolveSyncDeps(
    injectTokens: ReadonlyArray<Token>,
    ctx: ResolutionContext,
  ): { args: unknown[] } | { needsAsync: true } {
    const args: unknown[] = [];
    for (const dep of injectTokens) {
      try {
        args.push(ctx.resolve(dep));
      } catch (err) {
        if (err instanceof AsyncProviderInSyncResolveError) {
          return { needsAsync: true };
        }
        throw err;
      }
    }
    return { args };
  }

  private fromValueProvider<T>(provider: ValueProvider<T>): Registration<T> {
    return {
      token: provider.provide,
      scope: Scope.SINGLETON,
      factory: () => provider.useValue,
      containerOwned: false,
    };
  }

  private fromExistingProvider<T>(provider: ExistingProvider<T>): Registration<T> {
    return {
      token: provider.provide,
      scope: Scope.SINGLETON,
      factory: (ctx) => ctx.resolve(provider.useExisting) as T,
      aliasTarget: provider.useExisting,
      containerOwned: false,
    };
  }

  /**
   * Resolve constructor params + build instance. Tries sync first; if any
   * dep is async, falls back to awaiting via `resolveAsync`.
   *
   * Refactored via Extract Method: orchestrates 3 helpers:
   *   - validateMetadata: detect emitDecoratorMetadata off
   *   - tryResolveSync: sync resolution loop with AsyncProvider bailout
   *   - resolveAllAsync: Promise.all fallback when any dep is async
   */
  private constructClassWithAsyncFallback<T>(
    target: ClassConstructor<T>,
    ctx: ResolutionContext,
  ): T | Promise<T> {
    if (!hasReflectMetadata()) {
      throw new ReflectMetadataMissingError();
    }
    const paramTypes = readParamTypes(target);
    const injectTokens = readInjectTokens(target);
    const optionalFlags = readOptionalFlags(target);

    this.validateMetadata(target, paramTypes);

    const syncResult = this.tryResolveSync(target, paramTypes, injectTokens, optionalFlags, ctx);
    if ("args" in syncResult) {
      const instance = new target(...syncResult.args);
      // Every dependency resolved synchronously, but the caller may still be on the
      // async path — where an async `@PostConstruct` can be awaited rather than refused.
      return isAsyncContext(ctx)
        ? runPostConstructAsync(target, instance)
        : runPostConstructSync(target, instance);
    }

    return this.resolveAllAsync(target, paramTypes, injectTokens, optionalFlags, ctx).then(
      (instance) => runPostConstructAsync(target, instance),
    );
  }

  /**
   * Detection: zero paramTypes for a class that declares a non-empty
   * constructor strongly suggests emitDecoratorMetadata is off.
   */
  private validateMetadata<T>(target: ClassConstructor<T>, paramTypes: readonly unknown[]): void {
    if (paramTypes.length === 0 && target.length > 0) {
      throw new TypeError(
        `Class ${target.name} has @Injectable() but no constructor metadata. ` +
          'Add `"emitDecoratorMetadata": true` to your tsconfig.json.',
      );
    }
  }

  /**
   * Handle a single primitive-marker param (e.g. `param: string` without
   * explicit @Inject). Returns `undefined` for optional, throws for required.
   * Extracted to keep tryResolveSync below the complexity-10 cap (D422).
   */
  private handlePrimitiveParam<T>(
    target: ClassConstructor<T>,
    paramType: unknown,
    index: number,
    isOptional: boolean,
  ): undefined {
    if (isOptional) return undefined;
    throw new TypeError(
      `Class ${target.name} has a primitive/interface constructor parameter at index ${index} ` +
        `(emitted as ${describeClassName(paramType, "<unknown>")}). ` +
        "Primitives and interfaces cannot be auto-resolved — use `@Inject('SOME_STRING_TOKEN')` to provide an explicit token.",
    );
  }

  /**
   * Attempt sync resolution. Returns `{ args }` on success, `{ needsAsync: true }`
   * if any dep raised AsyncProviderInSyncResolveError. Throws for any other error.
   */
  private tryResolveSync<T>(
    target: ClassConstructor<T>,
    paramTypes: readonly unknown[],
    injectTokens: ReadonlyMap<number, Token>,
    optionalFlags: ReadonlySet<number>,
    ctx: ResolutionContext,
  ): { args: unknown[] } | { needsAsync: true } {
    const args: unknown[] = [];
    for (let index = 0; index < paramTypes.length; index += 1) {
      const paramType = paramTypes[index];
      const explicit = injectTokens.get(index);
      const isOptional = optionalFlags.has(index);
      const tokenForParam = explicit ?? (paramType as Token);

      if (explicit === undefined && isPrimitiveTypeMarker(paramType)) {
        args.push(this.handlePrimitiveParam(target, paramType, index, isOptional));
        continue;
      }

      try {
        args.push(this.resolveOrOptional(tokenForParam, ctx, isOptional));
      } catch (err) {
        if (err instanceof AsyncProviderInSyncResolveError) {
          return { needsAsync: true };
        }
        throw err;
      }
    }
    return { args };
  }

  /**
   * Async fallback: resolve every dep via resolveAsync, then construct.
   * Called when tryResolveSync returned `{ needsAsync: true }`.
   */
  private resolveAllAsync<T>(
    target: ClassConstructor<T>,
    paramTypes: readonly unknown[],
    injectTokens: ReadonlyMap<number, Token>,
    optionalFlags: ReadonlySet<number>,
    ctx: ResolutionContext,
  ): Promise<T> {
    const argPromises: Promise<unknown>[] = paramTypes.map((paramType, index) => {
      const explicit = injectTokens.get(index);
      const isOptional = optionalFlags.has(index);
      const tokenForParam = explicit ?? (paramType as Token);

      if (explicit === undefined && isPrimitiveTypeMarker(paramType)) {
        // Primitive marker without explicit token: tryResolveSync would have
        // either pushed undefined (optional) or thrown (non-optional). When
        // we reach here, the sync pass bailed early on an unrelated index;
        // primitives at this index are necessarily optional (non-optional
        // would have thrown). Mirror sync behavior: resolve to undefined.
        return Promise.resolve(undefined);
      }

      return ctx.resolveAsync(tokenForParam).catch((err: unknown) => {
        if (isOptional && err instanceof TokenNotFoundError) return undefined;
        throw err;
      });
    });

    return Promise.all(argPromises).then((args) => new target(...args));
  }

  private resolveOrOptional<T>(
    token: Token<T>,
    ctx: ResolutionContext,
    isOptional: boolean,
  ): T | undefined {
    try {
      return ctx.resolve(token);
    } catch (err) {
      if (isOptional && err instanceof TokenNotFoundError) return undefined;
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: sync resolution
  // ─────────────────────────────────────────────────────────────────────

  private resolveInContext<T>(token: Token<T>, ctx: ResolutionContext): T {
    // 1. Cycle check FIRST
    if (ctx.path.includes(token)) {
      throw new CyclicDependencyError([...ctx.path, token]);
    }

    // 2. Scope-aware cache lookup
    const cached = this.lookupCache(token);
    if (cached !== undefined) {
      if (cached instanceof Promise) {
        // Sync resolve hit an async cached promise → user error.
        throw new AsyncProviderInSyncResolveError(token);
      }
      return cached as T;
    }

    // 3. Materialize
    const registration = this.registrations.get(token);
    if (registration === undefined) {
      throw new TokenNotFoundError(token, ctx.path);
    }

    if (registration.scope === Scope.REQUEST) {
      this.assertRequestActive(token);
    }

    const childCtx = this.createContext([...ctx.path, token]);
    const value = registration.factory(childCtx);

    if (value instanceof Promise) {
      // Cache the in-flight Promise BEFORE throwing so the async
      // fallback (constructClassWithAsyncFallback → ctx.resolveAsync) finds
      // it and does NOT call the factory a second time. Without this the
      // factory runs twice — once here (discarded) and once on async retry —
      // doubling resource creation per resolve and leaking the first instance
      // (it never reaches trackInstance, so dispose() never sees it).
      this.storeInCache(token, value, registration.scope);
      value.then(
        (resolved) => {
          this.storeInCache(token, resolved, registration.scope);
          this.trackInstance(resolved, registration);
        },
        () => {
          this.deleteFromCache(token, registration.scope);
        },
      );
      throw new AsyncProviderInSyncResolveError(token);
    }

    this.storeInCache(token, value, registration.scope);
    this.trackInstance(value, registration);
    return value as T;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: async resolution (Promise-lock cache)
  // ─────────────────────────────────────────────────────────────────────

  private async resolveAsyncInContext<T>(token: Token<T>, ctx: ResolutionContext): Promise<T> {
    // 1. Cycle check FIRST — BEFORE cache lookup.
    //    Otherwise async cycles hit the in-flight Promise and deadlock.
    if (ctx.path.includes(token)) {
      throw new CyclicDependencyError([...ctx.path, token]);
    }

    // 2. Cache lookup — may return a Promise (in-flight factory) or value.
    const cached = this.lookupCache(token);
    if (cached !== undefined) {
      return cached as T | Promise<T>;
    }

    // 3. Materialize.
    const registration = this.registrations.get(token);
    if (registration === undefined) {
      throw new TokenNotFoundError(token, ctx.path);
    }

    if (registration.scope === Scope.REQUEST) {
      this.assertRequestActive(token);
    }

    const childCtx = this.createContextAsync([...ctx.path, token]);
    const result = registration.factory(childCtx);

    // 4. Store Promise OR value immediately (so concurrent callers wait).
    if (result instanceof Promise) {
      this.storeInCache(token, result, registration.scope);
      // Cleanup cache on rejection — never poison the cache.
      result.then(
        (value) => {
          this.storeInCache(token, value, registration.scope);
          this.trackInstance(value, registration);
        },
        () => {
          this.deleteFromCache(token, registration.scope);
        },
      );
      return result as Promise<T>;
    }
    this.storeInCache(token, result, registration.scope);
    this.trackInstance(result, registration);
    return result as T;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: scope-aware cache helpers
  // ─────────────────────────────────────────────────────────────────────

  private lookupCache(token: Token): unknown {
    if (this.singletonCache.has(token)) return this.singletonCache.get(token);
    const store = this.requestStorage.getStore();
    if (store?.cache.has(token)) return store.cache.get(token);
    return undefined;
  }

  private storeInCache(token: Token, value: unknown, scope: Scope): void {
    if (scope === Scope.SINGLETON) {
      this.singletonCache.set(token, value);
      return;
    }
    if (scope === Scope.REQUEST) {
      const store = this.requestStorage.getStore();
      if (store !== undefined) {
        store.cache.set(token, value);
      }
      return;
    }
    // TRANSIENT — never cached.
  }

  private deleteFromCache(token: Token, scope: Scope): void {
    if (scope === Scope.SINGLETON) {
      this.singletonCache.delete(token);
      return;
    }
    if (scope === Scope.REQUEST) {
      const store = this.requestStorage.getStore();
      store?.cache.delete(token);
    }
  }

  /**
   * Record an instance for teardown, when this container is the one that should tear it down.
   *
   * Two questions, in this order. Does the container OWN it — see `containerOwned`; a value the
   * caller handed in and an instance reached through an alias are both refused here. And does it
   * have any teardown at all: a class whose only teardown is `@PreDestroy` has no `dispose()`, so
   * testing `isDisposable` alone would silently skip it.
   */
  private trackInstance(value: unknown, registration: Registration): void {
    if (!registration.containerOwned) return;
    const { scope } = registration;
    if (!isDisposable(value) && !hasPreDestroy(value)) return;
    if (scope === Scope.SINGLETON) {
      this.singletonInstances.push(value);
      return;
    }
    if (scope === Scope.REQUEST) {
      const store = this.requestStorage.getStore();
      store?.instances.push(value);
    }
  }

  private assertRequestActive(token: Token): void {
    if (this.requestStorage.getStore() === undefined) {
      throw new ScopeViolationError(
        token,
        "REQUEST scope requires container.runInRequest(...) to be active.",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: ResolutionContext factories
  // ─────────────────────────────────────────────────────────────────────

  private createContext(path: ReadonlyArray<Token>): ResolutionContext {
    return {
      path,
      resolve: <U>(t: Token<U>): U => this.resolveInContext(t, this.createContext(path)),
      resolveAsync: <U>(t: Token<U>): Promise<U> =>
        this.resolveAsyncInContext(t, this.createContextAsync(path)),
    };
  }

  private createContextAsync(path: ReadonlyArray<Token>): ResolutionContext {
    const ctx: ResolutionContext = {
      path,
      resolve: <U>(t: Token<U>): U => this.resolveInContext(t, this.createContext(path)),
      resolveAsync: <U>(t: Token<U>): Promise<U> =>
        this.resolveAsyncInContext(t, this.createContextAsync(path)),
    };
    return Object.assign(ctx, { [ASYNC_CONTEXT]: true });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal: disposal
  // ─────────────────────────────────────────────────────────────────────

  private async disposeInstances(instances: TrackedInstance[]): Promise<void> {
    const errors: unknown[] = [];
    // Reverse construction order — dispose dependents before deps.
    for (let i = instances.length - 1; i >= 0; i -= 1) {
      const instance = instances[i];
      if (instance === undefined) continue;
      try {
        // `@PreDestroy` runs BEFORE `dispose()`, as its docstring promises.
        await callPreDestroy(instance);
        const asAsync = (instance as { [Symbol.asyncDispose]?: () => unknown })[
          Symbol.asyncDispose
        ];
        if (typeof asAsync === "function") {
          await asAsync.call(instance);
        } else if (isDisposable(instance)) {
          await instance.dispose();
        }
      } catch (err) {
        errors.push(err);
      }
    }
    instances.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more instances failed to dispose.");
    }
  }
}

function isDisposable(value: unknown): value is Disposable {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as { dispose?: unknown; [k: symbol]: unknown };
  if (typeof candidate.dispose === "function") return true;
  if (typeof candidate[Symbol.asyncDispose] === "function") return true;
  return false;
}

/**
 * Resolve the `@PostConstruct` method of `target` on `instance`, if it declared one.
 *
 * Returns whatever the hook returned so the two call sites can decide what to do with a
 * Promise — awaiting it is only possible on the async path.
 */
function callPostConstruct<T>(target: ClassConstructor<T>, instance: T): unknown {
  const hook = readPostConstruct(target);
  if (hook === undefined) return undefined;
  const method = (instance as Record<string | symbol, unknown>)[hook];
  if (typeof method !== "function") return undefined;
  return (method as (this: T) => unknown).call(instance);
}

/**
 * Run `@PostConstruct` on the synchronous resolution path.
 *
 * An async hook cannot be awaited here, and handing back an object whose initialiser has
 * not finished is worse than failing: the caller gets something that looks ready and is
 * not. So this refuses, and names the method that has to change.
 */
function runPostConstructSync<T>(target: ClassConstructor<T>, instance: T): T {
  const returned = callPostConstruct(target, instance);
  if (isThenable(returned)) {
    throw new AsyncPostConstructInSyncResolveError(target.name, String(readPostConstruct(target)));
  }
  return instance;
}

/** Run `@PostConstruct` on the asynchronous path, awaiting the hook when it returns a Promise. */
async function runPostConstructAsync<T>(target: ClassConstructor<T>, instance: T): Promise<T> {
  const returned = callPostConstruct(target, instance);
  if (isThenable(returned)) await returned;
  return instance;
}

/**
 * Run the `@PreDestroy` method of `instance`, if its class declared one.
 *
 * Awaited unconditionally: `await` on a non-Promise is a no-op, and disposal is already
 * an async path, so a synchronous hook costs nothing here.
 */
async function callPreDestroy(instance: object): Promise<void> {
  const ctor = instance.constructor as ClassConstructor | undefined;
  if (typeof ctor !== "function") return;
  const hook = readPreDestroy(ctor);
  if (hook === undefined) return;
  const method = (instance as Record<string | symbol, unknown>)[hook];
  if (typeof method !== "function") return;
  await (method as (this: object) => unknown).call(instance);
}

/** Whether the class declares a `@PreDestroy` hook — used to decide whether to track it. */
function hasPreDestroy(value: unknown): value is TrackedInstance {
  if (value === null || typeof value !== "object") return false;
  const ctor = (value as { constructor?: unknown }).constructor;
  if (typeof ctor !== "function") return false;
  return readPreDestroy(ctor as ClassConstructor) !== undefined;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
