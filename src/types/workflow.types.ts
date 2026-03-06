/**
 * @module workflow.types
 * @description Type definitions for workflow composition — how steps are
 * arranged, connected, and configured into a coherent business process.
 */

import { type ZodSchema } from "zod";
import type { DurationString, ID } from "./common.types.js";
import type { RetryConfig, StepDefinition } from "./step.types.js";

/**
 * A function that determines which step to execute next based on the
 * current accumulated context. Returning null signals workflow completion.
 *
 * This is the core of StateFlow's branching model — the next step is
 * always computed dynamically, making it trivially easy to add conditional
 * logic without special DSL or configuration.
 */
export type BranchFunction<TContext extends Record<string, unknown>> = (
  context: TContext,
) => string | null;

/**
 * Configuration for a parallel step group.
 * All steps in the group run concurrently. The workflow waits for ALL
 * of them to complete before proceeding to the next sequential step.
 */
export interface ParallelGroup<TContext extends Record<string, unknown>> {
  readonly type: "parallel";
  readonly steps: ReadonlyArray<StepDefinition<ZodSchema, ZodSchema, TContext>>;

  /**
   * What to do if one step in the group fails:
   * - "fail-fast"   → cancel remaining steps, begin compensation immediately
   * - "wait-all"    → let all steps finish (even after a failure), then fail
   */
  readonly failureStrategy?: "fail-fast" | "wait-all";
}

/**
 * A single node in the workflow graph — either a solo step or a parallel group.
 */
export type WorkflowNode<TContext extends Record<string, unknown>> =
  | StepDefinition<ZodSchema, ZodSchema, TContext>
  | ParallelGroup<TContext>;

/**
 * The complete, immutable definition of a workflow.
 * A workflow definition is a blueprint — it is registered once and
 * reused for every instance that runs it.
 *
 * @template TInput   The Zod schema type for the workflow's initial input
 * @template TContext The accumulated context type built up by all steps
 */
export interface WorkflowDefinition<
  TInput extends ZodSchema = ZodSchema,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * The unique name of this workflow. Used to look up the definition
   * when creating instances and resuming from persistence.
   */
  readonly name: string;

  /**
   * Semantic version number. When you update a workflow definition,
   * increment this. Old instances continue running on their original version.
   */
  readonly version: number;

  /** Human-readable description for documentation and the dashboard */
  readonly description?: string;

  /**
   * Zod schema for the workflow's initial trigger input.
   * Validated before the first step runs.
   */
  readonly input: TInput;

  /**
   * The ordered list of workflow nodes (steps or parallel groups).
   *
   * Execution order: nodes are executed in array order unless a branch
   * function redirects flow to a named step elsewhere in the list.
   */
  readonly steps: ReadonlyArray<WorkflowNode<TContext>>;

  /**
   * Optional global branch function. Called after EVERY step completes.
   * Return a step name to jump to, or null to continue in linear order.
   *
   * Most workflows don't need this — prefer per-step next() functions
   * defined in the StepBuilder API for clarity.
   */
  readonly branch?: BranchFunction<TContext>;

  /**
   * Default retry configuration applied to all steps unless overridden.
   */
  readonly defaultRetry?: Partial<RetryConfig>;

  /**
   * Global timeout for the entire workflow instance.
   * If the workflow doesn't complete within this time, it is failed.
   */
  readonly timeout?: DurationString;

  /**
   * Tags for filtering and querying instances (e.g., "payment", "critical").
   */
  readonly tags?: ReadonlyArray<string>;
}

/**
 * Registry entry pairing a definition with its resolved version.
 */
export interface RegisteredWorkflow {
  readonly definition: WorkflowDefinition<ZodSchema, Record<string, unknown>>;
  readonly registeredAt: string;
}
