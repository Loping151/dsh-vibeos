import type { AgentRole } from '../../shared';
/** Deterministic offline stub so the OS is usable without any model calls. */
export declare function stubResponse(role: AgentRole, prompt: string): string;
