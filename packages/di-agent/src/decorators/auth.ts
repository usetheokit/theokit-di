import "reflect-metadata";
import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

import type { DecoratedClass } from "./decorated-class.js";

/** What {@link Auth} declares: the identity `providers` this agent accepts, and any transport
 *  `sessionConfig` they need. */
export interface AuthOptions {
  providers?: string[];
  sessionConfig?: unknown;
}

/**
 * Declare how an agent class authenticates the caller.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/auth).
 */
export function Auth(options: AuthOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(AGENT_METADATA_KEYS.AUTH, options, target);
  };
}

/** The `@Auth` of a class, or `undefined` when it has none.
 *
 *  Class decorators are singular by nature, so this returns one object or `undefined` — unlike the
 *  property and method decorators, which accumulate into a map.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/auth).
 */
export function readAuthMetadata(target: DecoratedClass): AuthOptions | undefined {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.AUTH, target) as AuthOptions | undefined;
}
