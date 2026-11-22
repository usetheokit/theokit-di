import "reflect-metadata";
import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link Subscription} declares: the event `name` to listen for, and optionally the
 *  `transport` it arrives on. */
export interface SubscriptionOptions {
  name: string;
  transport?: string;
}

/**
 * Declare a property as a subscription to an event stream.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/subscription).
 */
export function Subscription(options: SubscriptionOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: Map<string | symbol, SubscriptionOptions> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.SUBSCRIPTION, target.constructor) ?? new Map();
    existing.set(propertyKey, options);
    Reflect.defineMetadata(AGENT_METADATA_KEYS.SUBSCRIPTION, existing, target.constructor);
  };
}

/** Every `@Subscription` on a class, keyed by the property it was applied to.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/subscription).
 */
export function readSubscriptionMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, SubscriptionOptions> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.SUBSCRIPTION, target) ?? new Map();
}
