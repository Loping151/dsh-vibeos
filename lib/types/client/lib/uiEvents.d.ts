export declare const OPEN_SPOTLIGHT_EVENT = "vibe:open-spotlight";
export interface OpenSpotlightDetail {
    /** Prefill the Spotlight input (e.g. "> make a calculator" for command mode). */
    query?: string;
}
/** Ask the Desktop to open Spotlight, optionally prefilled. */
export declare function requestSpotlight(query?: string): void;
/** Subscribe to Spotlight open requests (Desktop only; container-scoped). */
export declare function onOpenSpotlight(fn: (detail: OpenSpotlightDetail) => void): () => void;
