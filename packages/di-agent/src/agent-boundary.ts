import { Container } from "@theokit/di";

import { createAgentProvider } from "./agent-provider.js";
import { AGENT_TOKEN } from "./tokens.js";

/** Options for `createAgentBoundary()`. */
export interface AgentBoundaryOptions<TSeed, TAgent> {
  /** Called once per `withAgent` call, inside its request scope. */
  readonly factory: (seed: TSeed) => TAgent | Promise<TAgent>;
  /**
   * Optional container to register into; default a new Container. It must
   * still accept registrations (not yet resolved from) when the boundary is created.
   */
  readonly container?: Container;
}

/** A request boundary that builds one seeded agent per `withAgent` call. */
export interface AgentBoundary<TSeed, TAgent> {
  /**
   * Opens a request scope seeded with `seed`, builds the agent in it and runs
   * `work`. REQUEST-scoped providers resolved from the same container inside
   * `work` share the agent and can read the seed with `requestSeed()`.
   * Request-scoped instances (including a disposable agent) are disposed when
   * `work` settles, on success and on throw.
   */
  withAgent<R>(seed: TSeed, work: (agent: TAgent) => R | Promise<R>): Promise<R>;
}

/** One seeded agent per request: the default way to use `createAgentProvider`. */
export function createAgentBoundary<TSeed, TAgent>(
  options: AgentBoundaryOptions<TSeed, TAgent>,
): AgentBoundary<TSeed, TAgent> {
  const container = options.container ?? new Container();
  container.register(createAgentProvider<TSeed, TAgent>({ factory: options.factory, container }));
  return {
    withAgent: (seed, work) =>
      container.runInRequest(async () => work(await container.resolveAsync<TAgent>(AGENT_TOKEN)), {
        seed,
      }),
  };
}
