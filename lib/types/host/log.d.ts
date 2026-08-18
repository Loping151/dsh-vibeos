export interface Logger {
    debug: (m: string, e?: unknown) => void;
    info: (m: string, e?: unknown) => void;
    warn: (m: string, e?: unknown) => void;
    error: (m: string, e?: unknown) => void;
}
export declare function logger(tag: string): Logger;
