import "reflect-metadata";

import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link SubAgent} declares: how the parent agent describes the delegate when deciding
 *  whether to hand work over, and optionally which model it runs on and how deep delegation may
 *  nest before it stops. */
export interface SubAgentOptions {
  name: string;
  description: string;
  instructions: string;
  model?: string;
  maxDelegationDepth?: number;
}

/**
 * Declare a property as a subagent this one may delegate to, exposed to the parent as a tool.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/subagents).
 */
export function SubAgent(options: SubAgentOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: Map<string | symbol, SubAgentOptions> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.SUBAGENT, target.constructor) ?? new Map();
    existing.set(propertyKey, options);
    Reflect.defineMetadata(AGENT_METADATA_KEYS.SUBAGENT, existing, target.constructor);
  };
}

/** Every `@SubAgent` on a class, keyed by the property it was applied to.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/subagents).
 */
export function readSubAgentMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, SubAgentOptions> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.SUBAGENT, target) ?? new Map();
}
