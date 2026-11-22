import "reflect-metadata";

import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link Hitl} declares: the `tools` whose invocation needs a human decision, and the
 *  `timeoutMs` after which waiting stops. */
export interface HitlOptions {
  tools: string[];
  timeoutMs?: number;
}

/** A stored `@Hitl`, with the method it was applied to. The map is already keyed by that method;
 *  `methodKey` repeats it so an entry read on its own still says what it guards. */
export interface HitlMetadata extends HitlOptions {
  methodKey: string | symbol;
}

/**
 * `@Hitl(options)` — declare a human-in-the-loop approval handler on a method.
 *
 * Accumulates per method, keyed by the method name, so a class may declare as many
 * handlers as it has methods. It used to keep a single object per class, which meant a
 * second `@Hitl` on the same class silently discarded the first (#6).
 *
 * @deprecated Records metadata nothing reads. @theokit/sdk has no equivalent to point to.
 */
export function Hitl(options: HitlOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const existing: Map<string | symbol, HitlMetadata> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.HITL, target.constructor) ?? new Map();
    existing.set(propertyKey, { ...options, methodKey: propertyKey });
    Reflect.defineMetadata(AGENT_METADATA_KEYS.HITL, existing, target.constructor);
  };
}

/** Read `@Hitl()` metadata off a class constructor, keyed by method (insertion-ordered).
 *
 * @deprecated Records metadata nothing reads. @theokit/sdk has no equivalent to point to.
 */
export function readHitlMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, HitlMetadata> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.HITL, target) ?? new Map();
}
