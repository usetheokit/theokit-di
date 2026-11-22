import "reflect-metadata";

import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link UseSandbox} declares: which `backend` isolates the execution, the `workDir` it
 *  starts in, and the `timeoutMs` after which it is abandoned. */
export interface UseSandboxOptions {
  backend?: "local" | "docker" | string;
  workDir?: string;
  timeoutMs?: number;
}

/**
 * Declare that a property's work runs inside a sandbox rather than in this process.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/sandbox).
 */
export function UseSandbox(options: UseSandboxOptions = {}): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: Map<string | symbol, UseSandboxOptions> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.SANDBOX, target.constructor) ?? new Map();
    existing.set(propertyKey, options);
    Reflect.defineMetadata(AGENT_METADATA_KEYS.SANDBOX, existing, target.constructor);
  };
}

/** Every `@UseSandbox` on a class, keyed by the property it was applied to.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (@theokit/sdk/sandbox).
 */
export function readSandboxMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, UseSandboxOptions> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.SANDBOX, target) ?? new Map();
}
