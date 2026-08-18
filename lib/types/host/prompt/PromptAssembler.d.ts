import type { AiOp, AppDescriptor, AppMemory, DragPayload, Interaction } from '../../shared';
/**
 * - "force-full": the OS is certain a full render is needed (first paint,
 *   spawned window, drag-drop, or no snapshot yet). Not negotiable.
 * - "prefer-incremental": a normal interaction on an already-rendered window.
 *   The OS *suggests* incremental, but the AI — which understands the semantics
 *   of the action — may upgrade to a full render when the change is structural.
 */
export type RenderMode = 'force-full' | 'prefer-incremental';
export interface AssembleInput {
    app: AppDescriptor;
    memory: AppMemory | null;
    recent: Interaction[];
    globalState: Record<string, unknown>;
    /** Current inner size of the window, so the AI lays out responsively. */
    windowSize?: {
        w: number;
        h: number;
    };
    op?: AiOp;
    drag?: DragPayload;
    /** Seed instruction for an AI-spawned popup window. */
    seedPrompt?: string;
    firstRender: boolean;
    /** Decided by the backend BEFORE calling the AI — not left to the model. */
    renderMode: RenderMode;
    /** The data-vibeos-region ids present in the current snapshot (for incremental). */
    regionIds?: string[];
    /** OS-level user profile, injected so apps feel personalized. */
    userProfile?: string;
    /** prefs.stylePrompt — the user's preferred visual style for generated apps. */
    stylePrompt?: string;
    /** Active skin id — generated UI should match its era/material. */
    skin?: string;
    /** Prompt string the OS draws for terminals. */
    terminalPrompt?: string;
    /** [CURRENT UI] cap in chars; 0 (default) = uncapped full snapshot. */
    snapshotBudget?: number;
}
/**
 * Pre-decide the render mode before the AI runs. The OS only *forces* full when
 * it's structurally unavoidable; otherwise it nudges toward incremental but
 * lets the AI (which knows the action's intent) make the final call.
 */
export declare function decideRenderMode(input: {
    firstRender: boolean;
    hasSnapshot: boolean;
    isDrag: boolean;
    isSpawn: boolean;
    /** Browser navigation replaces the page wholesale — full mode streams it progressively. */
    isNavigate?: boolean;
}): RenderMode;
export declare function assemblePrompt(input: AssembleInput): string;
