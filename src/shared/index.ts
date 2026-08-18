/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/index.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

// protocol/schema.ts and prompt/syscall-schema.ts are deliberately NOT re-exported:
// they are zod value modules and must stay out of the client bundle. Host code
// imports them from their own paths.

export * from './domain/agent';
export * from './domain/app';
export * from './domain/memory';
export * from './domain/models';
export * from './domain/notification';
export * from './domain/settings';
export * from './domain/skin';
export * from './domain/syscall';
export * from './domain/vfs';
export * from './domain/window';
export * from './protocol/envelope';
export * from './protocol/c2s';
export * from './protocol/s2c';
export * from './util/emoji';
export * from './util/id';
export * from './util/result';
