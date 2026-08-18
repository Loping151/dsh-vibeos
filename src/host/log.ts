/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/util/log.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

/* STUB seeded by workstream D; workstream E owns this file. */

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.VIBEOS_LOG_LEVEL as Level) ?? 'info'] ?? ORDER.info;

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function emit(level: Level, tag: string, msg: string, extra?: unknown): void {
  if (ORDER[level] < threshold) return;
  const head = `${ts()} ${level.toUpperCase().padEnd(5)} [vibeos:${tag}]`;
  if (extra !== undefined) {
    console.log(head, msg, typeof extra === 'string' ? extra : safe(extra));
  } else {
    console.log(head, msg);
  }
}

function safe(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 600 ? `${s.slice(0, 600)}…` : (s ?? String(v));
  } catch {
    return String(v);
  }
}

export interface Logger {
  debug: (m: string, e?: unknown) => void;
  info: (m: string, e?: unknown) => void;
  warn: (m: string, e?: unknown) => void;
  error: (m: string, e?: unknown) => void;
}

export function logger(tag: string): Logger {
  return {
    debug: (m, e) => emit('debug', tag, m, e),
    info: (m, e) => emit('info', tag, m, e),
    warn: (m, e) => emit('warn', tag, m, e),
    error: (m, e) => emit('error', tag, m, e),
  };
}
