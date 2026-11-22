import "reflect-metadata";
import { AGENT_METADATA_KEYS } from "../metadata-keys.js";

import type { DecoratedClass } from "./decorated-class.js";

/** What {@link Workflow} declares about a workflow class: its `name`, an optional `retryPolicy`,
 *  and the schemas its input and output are expected to match. */
export interface WorkflowOptions {
  name?: string;
  retryPolicy?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

/**
 * Mark a class as a workflow.
 *
 * This is the class-level marker only. The steps are declared with `@Step` on the methods, and
 * `buildWorkflow` compiles the two together into a runnable `@theokit/sdk` Workflow — which makes
 * it the one decorator in this package with a consumer that ships here.
 *
 * Records metadata only. Nothing in this package acts on it — the runtime that does lives in
 * `@theokit/sdk`, which is what lets the declaration and the execution version independently.
 */
export function Workflow(options: WorkflowOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(AGENT_METADATA_KEYS.WORKFLOW, options, target);
  };
}

/** The `@Workflow` of a class, or `undefined` when it has none.
 *
 *  Class decorators are singular by nature, so this returns one object or `undefined` — unlike the
 *  property and method decorators, which accumulate into a map. */
export function readWorkflowMetadata(target: DecoratedClass): WorkflowOptions | undefined {
  return Reflect.getMetadata(AGENT_METADATA_KEYS.WORKFLOW, target) as WorkflowOptions | undefined;
}
