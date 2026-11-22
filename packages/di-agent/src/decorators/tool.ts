import "reflect-metadata";
import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link Tool} declares about one tool: the name and description an agent sees when
 *  choosing it, and optionally the schema its input must match. */
export interface ToolOptions {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/**
 * Declare a property as a tool an agent may call.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (defineTool).
 */
export function Tool(options: ToolOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: Map<string | symbol, ToolOptions> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.TOOL, target.constructor) ?? new Map();
    existing.set(propertyKey, options);
    Reflect.defineMetadata(AGENT_METADATA_KEYS.TOOL, existing, target.constructor);
  };
}

/** Every `@Tool` on a class, keyed by the property it was applied to. Empty map when there are
 *  none — a class with no tools is ordinary, not an error.
 *
 * @deprecated Records metadata nothing reads. Use the @theokit/sdk equivalent (defineTool).
 */
export function readToolMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, ToolOptions> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.TOOL, target) ?? new Map();
}
