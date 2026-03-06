/**
 * @module step.types
 * @description Type definitions for workflow steps — the atomic units of work
 * in the StateFlow engine. Steps are designed to be pure, composable, and
 * fully type-checked at compile time.
 */

import type { ZodSchema, z } from "zod";
import type { DurationString, ID } from "./common.types.js";

/**
 * The execution status of a single step attempt.
 */
export type StepStatus =
  | "pending" // Not yet started
  | "running" // Currently executing
  | "completed" // Finished successfully
  | "failed" // Failed and exhausted all retries
  | "retrying" // Failed but retrying
  | "skipped" // Bypassed via branching logic
  | "compensating" // Running its compensation function
  | "compensated"; // Compensation completed

/**
 * Retry backoff strategy determines how long to wait between retries.
 *
 * - "fixed"        → always wait the same amount of time
 * - "linear"       → wait increases linearly: 1s, 2s, 3s...
 * - "exponential"  → wait doubles each time: 1s, 2s, 4s, 8s...
 * - "jittered"     → exponential + random jitter to prevent thundering herd
 */
export type BackoffStrategy = "fixed" | "linear" | "exponential" | "jittered";

/**
 * Configuration for automatic step retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of attempts (including the first try). Default: 1 */
  readonly maxAttempts: number;

  /** Strategy to calculate wait time between retries. Default: "exponential" */
  readonly backoff: BackoffStrategy;

  /** Initial delay before the first retry. Default: "1s" */
  readonly initialDelay: DurationString;

  /** Maximum delay cap to prevent infinite backoff growth. Default: "30s" */
  readonly maxDelay: DurationString;

  /**
   * Optional allowlist of error names/codes to retry on.
   * If omitted, all errors are retried (up to maxAttempts).
   * @example ["NetworkError", "TimeoutError"]
   */
  readonly retryOn?: ReadonlyArray<string>;

  /**
   * Optional blocklist of error names/codes that should NEVER be retried.
   * Takes precedence over retryOn.
   * @example ["CardDeclinedError", "ValidationError"]
   */
  readonly failOn?: ReadonlyArray<string>;
}

/**
 * The type of step — determines how the engine executes it.
 *
 * - "task"    → Standard synchronous-style async function. Runs and returns.
 * - "wait"    → Pauses the workflow until an external signal is received.
 * - "gate"    → A decision point. No side effects. Only used for branching.
 */
export type StepType = "task" | "wait" | "gate";

/**
 * The execution context passed to every step's execute function.
 * Provides access to the accumulated workflow context plus metadata.
 */
export interface StepExecutionContext<
  TContext extends Record<string, unknown>,
> {
  /** The full accumulated context from all previous steps */
  readonly context: TContext;

  /** The unique ID of the current workflow instance */
  readonly instanceId: ID;

  /** The name of the current workflow definition */
  readonly workflowName: string;

  /** The current attempt number (1-indexed) */
  readonly attempt: number;

  /** Metadata: when this attempt started */
  readonly startedAt: string;

  /**
   * A signal function for logging within a step.
   * This goes through StateFlow's logger so it carries workflow context.
   */
  readonly log: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Core step definition interface — the contract every step must satisfy.
 *
 * @template TInput  The Zod schema type for step input validation
 * @template TOutput The Zod schema type for step output validation
 * @template TContext The accumulated workflow context type
 */
export interface StepDefinition<
  TInput extends ZodSchema,
  TOutput extends ZodSchema,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Unique name for this step within a workflow. Must be URL-safe. */
  readonly name: string;

  /**
   * Human-readable description shown in audit logs and the CLI dashboard.
   */
  readonly description?: string;

  /** The type of step. Defaults to "task". */
  readonly type?: StepType;

  /**
   * Zod schema to validate the step's required inputs from the context.
   * StateFlow extracts and validates these fields before calling execute().
   * If validation fails, the step is immediately marked as failed (no retries).
   */
  readonly input: TInput;

  /**
   * Zod schema to validate the step's return value.
   * If the execute function returns data that doesn't match this schema,
   * StateFlow marks the step as failed before merging into context.
   */
  readonly output: TOutput;

  /**
   * Retry configuration for this step.
   * If omitted, the workflow-level default retry config is used.
   */
  readonly retry?: Partial<RetryConfig>;

  /**
   * Timeout for a single execution attempt.
   * If the execute function doesn't resolve within this time, it's aborted
   * and counts as a failed attempt (triggering retry logic if configured).
   */
  readonly timeout?: DurationString;

  /**
   * The main execution function for this step.
   * Must be idempotent when retries are configured — StateFlow may call
   * this function multiple times with the same input.
   *
   * @param input    The validated input extracted from the workflow context
   * @param ctx      The full execution context (metadata, logging, etc.)
   * @returns        The step's output, which is merged into the workflow context
   */
  readonly execute: (
    input: z.infer<TInput>,
    ctx: StepExecutionContext<TContext>,
  ) => Promise<z.infer<TOutput>>;

  /**
   * Optional compensation function — called during rollback if a later
   * step fails and the workflow needs to undo this step's effects.
   *
   * This is the "C" in the Saga pattern. Design this to be idempotent.
   *
   * @param input    The same validated input that was passed to execute()
   * @param ctx      The execution context at the time of compensation
   */
  readonly compensate?: (
    input: z.infer<TInput>,
    ctx: StepExecutionContext<TContext>,
  ) => Promise<void>;
}

/**
 * A record of one step execution attempt, stored in the audit log.
 */
export interface StepRecord {
  readonly id: ID;
  readonly instanceId: ID;
  readonly stepName: string;
  readonly status: StepStatus;
  readonly attempt: number;
  readonly input: unknown;
  readonly output: unknown;
  readonly error: SerializedError | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
}

/**
 * A serializable representation of an error for storage in the database.
 */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
  readonly retryable: boolean;
}
