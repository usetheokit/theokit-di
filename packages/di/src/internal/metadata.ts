/**
 * Single source of truth for the metadata keys our decorators write and
 * the container reads. Keeping them here means container.ts and
 * decorators/*.ts agree on the wire format.
 *
 * The 16 agent keys (`SANDBOX` through `MEMORY_SCOPE`) are not read by the
 * container. They are kept for compatibility only and are deprecated;
 * `@theokit/di-agent` owns them as `AGENT_METADATA_KEYS`.
 */

import type { ClassConstructor, Scope, Token } from "../types.js";

export const METADATA_KEYS = {
  /** Marker that a class was decorated with `@Injectable()`. */
  INJECTABLE: "usetheo:di:injectable",
  /** Map<number, Token> from `@Inject(token)` parameter decorators. */
  INJECT_TOKENS: "usetheo:di:inject-tokens",
  /** Set<number> from `@Optional()` parameter decorators. */
  OPTIONAL_FLAGS: "usetheo:di:optional",
  /** TS-emitted constructor parameter types (requires `emitDecoratorMetadata`). */
  DESIGN_PARAMTYPES: "design:paramtypes",
  /** Map<number, string> from `@Qualifier(name)` parameter decorators. */
  QUALIFIER_NAMES: "usetheo:di:qualifier-names",
  /** boolean from `@Primary` class decorator. */
  PRIMARY: "usetheo:di:primary",
  /** string | symbol from `@PostConstruct` method decorator. */
  POST_CONSTRUCT: "usetheo:di:post-construct",
  /** string | symbol from `@PreDestroy` method decorator. */
  PRE_DESTROY: "usetheo:di:pre-destroy",
  /**
   * Map<string|symbol, SandboxOptions> from `@UseSandbox()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  SANDBOX: "usetheo:di:sandbox",
  /**
   * Map<string|symbol, SubAgentSpec> from `@SubAgent()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  SUBAGENT: "usetheo:di:subagent",
  /**
   * Map<string|symbol, SquadMetadata> from `@Squad()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  SQUAD: "usetheo:di:squad",
  /**
   * Map<string|symbol, StepMetadata> from `@Step()` method decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  STEP: "usetheo:di:step",
  /**
   * Map<string|symbol, HitlMetadata> from `@Hitl()` method decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  HITL: "usetheo:di:hitl",
  /**
   * AutoSummarizeConfig from `@AutoSummarize()` class decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  AUTO_SUMMARIZE: "usetheo:di:auto-summarize",
  /**
   * Map<string|symbol, ToolOptions> from `@Tool()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  TOOL: "usetheo:di:tool",
  /**
   * WorkflowOptions from `@Workflow()` class decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  WORKFLOW: "usetheo:di:workflow",
  /**
   * EvalOptions from `@Eval()` class decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  EVAL: "usetheo:di:eval",
  /**
   * Map<string|symbol, CronMetadata> from `@Cron()` method decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  CRON: "usetheo:di:cron",
  /**
   * Map<string|symbol, SubscriptionOptions> from `@Subscription()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  SUBSCRIPTION: "usetheo:di:subscription",
  /**
   * AuthOptions from `@Auth()` class decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  AUTH: "usetheo:di:auth",
  /**
   * Map<string|symbol, RetrieverOptions> from `@Retriever()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  RETRIEVER: "usetheo:di:retriever",
  /**
   * Map<string|symbol, RerankerOptions> from `@Reranker()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  RERANKER: "usetheo:di:reranker",
  /**
   * Map<string|symbol, TextSplitterOptions> from `@TextSplitter()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  TEXT_SPLITTER: "usetheo:di:text-splitter",
  /**
   * Map<string|symbol, MemoryScopeOptions> from `@MemoryScopeDecorator()` property decorator.
   *
   * @deprecated Owned by @theokit/di-agent as AGENT_METADATA_KEYS. Kept for compatibility; removed in the next major.
   */
  MEMORY_SCOPE: "usetheo:di:memory-scope",
} as const;

export interface InjectableMetadata {
  scope?: Scope;
}

/**
 * Probe whether `reflect-metadata` is loaded. Returns `false` if `Reflect`
 * lacks the `getMetadata` function the polyfill installs.
 */
export function hasReflectMetadata(): boolean {
  return (
    typeof Reflect !== "undefined" &&
    typeof (Reflect as unknown as { getMetadata?: unknown }).getMetadata === "function"
  );
}

/**
 * Read constructor param types emitted by `emitDecoratorMetadata`.
 * Returns `[]` if the class was not decorated OR `emitDecoratorMetadata`
 * is off in the consumer's tsconfig.
 */
export function readParamTypes(target: ClassConstructor): ReadonlyArray<unknown> {
  if (!hasReflectMetadata()) return [];
  const out = Reflect.getMetadata(METADATA_KEYS.DESIGN_PARAMTYPES, target) as unknown;
  if (!Array.isArray(out)) return [];
  return out;
}

/**
 * Read explicit `@Inject(token)` overrides keyed by constructor parameter
 * index.
 */
export function readInjectTokens(target: ClassConstructor): ReadonlyMap<number, Token> {
  if (!hasReflectMetadata()) return new Map();
  const out = Reflect.getMetadata(METADATA_KEYS.INJECT_TOKENS, target) as unknown;
  if (!(out instanceof Map)) return new Map();
  return out as ReadonlyMap<number, Token>;
}

/**
 * Read `@Optional()` flags keyed by constructor parameter index.
 */
export function readOptionalFlags(target: ClassConstructor): ReadonlySet<number> {
  if (!hasReflectMetadata()) return new Set();
  const out = Reflect.getMetadata(METADATA_KEYS.OPTIONAL_FLAGS, target) as unknown;
  if (!(out instanceof Set)) return new Set();
  return out as ReadonlySet<number>;
}

/**
 * Read `@Injectable({ scope })` metadata. Returns `undefined` if the class
 * was not decorated. The container then checks `isInjectable()` (or treats
 * it as a registration error).
 */
export function readInjectableMetadata(target: ClassConstructor): InjectableMetadata | undefined {
  if (!hasReflectMetadata()) return undefined;
  const out = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, target) as unknown;
  if (out === undefined || out === null) return undefined;
  if (typeof out !== "object") return undefined;
  return out as InjectableMetadata;
}

/**
 * Whether the class was decorated with `@Injectable()` at all.
 */
export function isInjectable(target: ClassConstructor): boolean {
  return readInjectableMetadata(target) !== undefined;
}

/**
 * Read the method name `@PostConstruct` marked, if any.
 *
 * The decorator writes to `target.constructor`, so a subclass inherits its base
 * class's hook through the prototype chain — which is what `Reflect.getMetadata`
 * does by default, and what a consumer extending a decorated base expects.
 */
export function readPostConstruct(target: ClassConstructor): string | symbol | undefined {
  return readLifecycleHook(target, METADATA_KEYS.POST_CONSTRUCT);
}

/** Read the method name `@PreDestroy` marked, if any. */
export function readPreDestroy(target: ClassConstructor): string | symbol | undefined {
  return readLifecycleHook(target, METADATA_KEYS.PRE_DESTROY);
}

function readLifecycleHook(target: ClassConstructor, key: string): string | symbol | undefined {
  if (!hasReflectMetadata()) return undefined;
  const out = Reflect.getMetadata(key, target) as unknown;
  if (typeof out === "string" || typeof out === "symbol") return out;
  return undefined;
}

/**
 * Detect primitive wrapper types (`Number`, `String`, `Boolean`, `Object`).
 * TS emits these for primitive constructor parameters and for interface
 * parameters that can't be resolved at runtime. The container uses this
 * to emit better errors than "TokenNotFoundError: Number".
 */
const PRIMITIVE_WRAPPERS: ReadonlySet<unknown> = new Set([
  Number,
  String,
  Boolean,
  Object,
  Array,
  Function,
]);

export function isPrimitiveTypeMarker(value: unknown): boolean {
  return typeof value === "function" && PRIMITIVE_WRAPPERS.has(value);
}
