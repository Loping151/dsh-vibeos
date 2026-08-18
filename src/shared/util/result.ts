/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/util/result.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
