/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/util/id.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** Monotonic-ish ULID generator (timestamp + randomness). */
export function ulid(now: number = Date.now()): string {
  let ts = now;
  const time = new Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    time[i] = ENCODING.charAt(ts % 32);
    ts = Math.floor(ts / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ENCODING.charAt(Math.floor(Math.random() * 32));
  }
  return time.join('') + rand;
}
