import type { AppSearchResult } from '../../shared';
import type { SdkManager } from './SdkManager';
/** Spotlight search micro-agent. A newer keystroke aborts the older query. */
export declare class AppSearch {
    private readonly sdk;
    constructor(sdk: SdkManager);
    searchApps(query: string, abort?: AbortController): Promise<AppSearchResult[]>;
}
