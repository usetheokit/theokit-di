import "reflect-metadata";

import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/**
 * Metadata captured by the `@Squad()` property decorator. Declares a sequential
 * agent team by referencing the agent property names that compose it. Mirrors
 * the `@theokit/sdk` `createSquad` factory (decorator mandate — every agentic
 * capability ships a decorator alongside the factory).
 */
export interface SquadMetadata {
  /** Agent property names (or ids) that run in order. */
  agents: string[];
  /** Orchestration process. Default (omitted) = `"sequential"`. */
  process?: "sequential" | "hierarchical";
  /** Optional squad name. */
  name?: string;
}

/**
 * `@Squad(metadata)` — declare a sequential agent team on a property. The DI
 * container / agent provider materializes it into a `createSquad(...)` at wiring
 * time.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (Squad).
 */
export function Squad(metadata: SquadMetadata): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: Map<string | symbol, SquadMetadata> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.SQUAD, target.constructor) ?? new Map();
    existing.set(propertyKey, metadata);
    Reflect.defineMetadata(AGENT_METADATA_KEYS.SQUAD, existing, target.constructor);
  };
}

/** Read `@Squad()` metadata off a class constructor.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (Squad).
 */
export function readSquadMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, SquadMetadata> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.SQUAD, target) ?? new Map();
}
