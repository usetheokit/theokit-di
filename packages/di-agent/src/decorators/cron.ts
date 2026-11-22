import "reflect-metadata";
import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link Cron} declares: the `schedule` as a cron expression and the `timezone` it is read
 *  in. The expression is stored verbatim and never parsed here, so a malformed one surfaces
 *  wherever it is eventually scheduled. */
export interface CronOptions {
  schedule: string;
  timezone?: string;
}

/** A stored `@Cron`, with the method it was applied to. The map is already keyed by that method;
 *  `methodKey` repeats it so an entry read on its own still says what it schedules. */
export interface CronMetadata extends CronOptions {
  methodKey: string | symbol;
}

/**
 * `@Cron(options)` — declare a scheduled routine on a method.
 *
 * Accumulates per method, keyed by the method name, so a class may schedule as many
 * routines as it has methods. It used to keep a single object per class, which meant a
 * second `@Cron` on the same class silently discarded the first (#6).
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/cron).
 */
export function Cron(options: CronOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const existing: Map<string | symbol, CronMetadata> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.CRON, target.constructor) ?? new Map();
    existing.set(propertyKey, { ...options, methodKey: propertyKey });
    Reflect.defineMetadata(AGENT_METADATA_KEYS.CRON, existing, target.constructor);
  };
}

/** Read `@Cron()` metadata off a class constructor, keyed by method (insertion-ordered).
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/cron).
 */
export function readCronMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, CronMetadata> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.CRON, target) ?? new Map();
}
