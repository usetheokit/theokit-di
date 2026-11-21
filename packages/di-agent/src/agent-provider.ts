import { type Container, type FactoryProvider, Scope } from "@theokit/di";

import { AGENT_TOKEN } from "./tokens.js";

/**
 * Options accepted by `createAgentProvider()`. Mirrors the public
 * `AgentOptions` from `@theokit/sdk` but kept structural so this package
 * does not have a hard import dependency on the SDK's type tree.
 *
 * The factory `async () => Agent.create(options)` is provided by the
 * consumer (see `createAgentProvider` below). This package supplies the
 * scope + token wiring.
 */
export interface CreateAgentProviderOptions<TAgent> {
  /**
   * Factory function that produces a fresh Agent per REQUEST.
   * Typically `() => Agent.create({...})` from `@theokit/sdk`.
   */
  factory: () => TAgent | Promise<TAgent>;
  /**
   * Override the scope. Default is `REQUEST` (the wedge — one isolated
   * Agent per HTTP request). Override to `SINGLETON` for CLI / cron /
   * single-tenant scenarios where a shared Agent is desirable.
   */
  scope?: Scope;
}

/**
 * Options for the seeded form: the factory receives the seed the active
 * request was opened with (`runInRequest(cb, { seed })`). A factory provider
 * gets no container, so the container that opens the request is passed here.
 */
export interface CreateSeededAgentProviderOptions<TSeed, TAgent> {
  factory: (seed: TSeed) => TAgent | Promise<TAgent>;
  /** The container whose `runInRequest(cb, { seed })` carries the seed. */
  container: Container;
  scope?: Scope;
}

/**
 * Build a `FactoryProvider` that materializes an Agent on demand.
 *
 * @example
 *   import { Agent } from "@theokit/sdk";
 *   import { Module } from "@theokit/di";
 *   import { createAgentProvider } from "@theokit/di-agent";
 *
 *   @Module({
 *     providers: [
 *       createAgentProvider({
 *         factory: () => Agent.create({ apiKey: process.env.OPENROUTER_API_KEY!, model: { id: "openai/gpt-4o-mini" } }),
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 */
export function createAgentProvider<TSeed, TAgent>(
  options: CreateSeededAgentProviderOptions<TSeed, TAgent>,
): FactoryProvider<TAgent>;
export function createAgentProvider<TAgent>(
  options: CreateAgentProviderOptions<TAgent>,
): FactoryProvider<TAgent>;
export function createAgentProvider(
  options: CreateAgentProviderOptions<unknown> | CreateSeededAgentProviderOptions<unknown, unknown>,
): FactoryProvider<unknown> {
  const { container } = options as { container?: Container };
  return {
    provide: AGENT_TOKEN,
    useFactory: () =>
      container === undefined
        ? (options.factory as () => unknown)()
        : (options.factory as (seed: unknown) => unknown)(container.requestSeed()),
    scope: options.scope ?? Scope.REQUEST,
  };
}
