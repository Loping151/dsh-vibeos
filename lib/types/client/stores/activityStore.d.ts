import type { AgentRun } from '../../shared/index';
interface ActivityState {
    runs: AgentRun[];
    hasMore: boolean;
    loading: boolean;
    /** Initial set (boot). */
    setAll: (runs: AgentRun[]) => void;
    /** Older page appended on scroll. */
    appendPage: (runs: AgentRun[], hasMore: boolean) => void;
    /** Live insert/update of a single run. */
    upsert: (run: AgentRun) => void;
    /** Request the next older page (no-op while loading or exhausted). */
    fetchMore: () => void;
}
/** Live feed of agent runs for the Activity Monitor (boot + s2c.agent.run + paging). */
export declare const useActivityStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ActivityState>>;
export {};
