/**
 * @module common.types
 * @description Shared primitive types used across the entire StateFlow engine.
 * Keeping primitives in one place prevents circular dependencies and makes
 * refactoring trivial — change a type here and TypeScript enforces it everywhere.
 */

/** A universally unique identifier string (UUID v4) */
export type ID = string;

/**
 * ISO 8601 timestamp string.
 * Using branded types here prevents accidentally passing a plain string
 * where a timestamp is expected.
 */
export type Timestamp = string & { readonly __brand: "Timestamp" };

/** Creates a typed Timestamp from a Date or string */
export const toTimestamp = (date: Date | string): Timestamp =>
  (typeof date === "string" ? date : date.toISOString()) as Timestamp;

/** Returns the current time as a Timestamp */
export const nowTimestamp = (): Timestamp => toTimestamp(new Date());

/**
 * Duration string format: "5s", "2m", "1h", "3d"
 * Used for timeouts and retry backoff configuration.
 */
export type DurationString = `${number}${"ms" | "s" | "m" | "h" | "d"}`;

/**
 * Parses a DurationString into milliseconds.
 * @example parseDuration("5s") // 5000
 * @example parseDuration("2m") // 120000
 */
export const parseDuration = (duration: DurationString): number => {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration format: "${duration}"`);

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit]!;
};

/**
 * A deep readonly wrapper for immutable data structures.
 * Used to prevent accidental mutation of context objects.
 */
export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * Extracts the resolved type from a Promise.
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * A result type that avoids throwing exceptions across async boundaries.
 * Functions returning this type explicitly communicate their failure modes.
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({
  success: true,
  value,
});

export const err = <E extends Error>(error: E): Result<never, E> => ({
  success: false,
  error,
});