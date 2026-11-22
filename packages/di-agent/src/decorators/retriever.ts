import "reflect-metadata";
import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

/** What {@link Retriever} declares: how many passages to return (`topK`) and the minimum score
 *  a passage needs to be worth returning at all (`threshold`). */
export interface RetrieverOptions {
  topK?: number;
  threshold?: number;
}

/**
 * Declare a property as the retrieval step of a RAG pipeline.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 *
 * @deprecated Records metadata nothing reads. @theokit/sdk has no equivalent to point to.
 */
export function Retriever(options: RetrieverOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: Map<string | symbol, RetrieverOptions> =
      Reflect.getMetadata(AGENT_METADATA_KEYS.RETRIEVER, target.constructor) ?? new Map();
    existing.set(propertyKey, options);
    Reflect.defineMetadata(AGENT_METADATA_KEYS.RETRIEVER, existing, target.constructor);
  };
}

/** Every `@Retriever` on a class, keyed by the property it was applied to.
 *
 * @deprecated Records metadata nothing reads. @theokit/sdk has no equivalent to point to.
 */
export function readRetrieverMetadata(
  target: abstract new (...args: never) => unknown,
): ReadonlyMap<string | symbol, RetrieverOptions> {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.RETRIEVER, target) ?? new Map();
}
