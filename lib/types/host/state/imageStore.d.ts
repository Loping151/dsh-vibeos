export declare const IMAGE_URL_PREFIX = "/vibeos/img/";
export declare function dshStoragesPath(): string;
export declare class ImageStore {
    private readonly dir;
    constructor(dir?: string);
    /** `dataUrl` → served path, or null when it is not a decodable image (or too big). */
    put(dataUrl: string, maxBytes?: number): Promise<string | null>;
    get(id: string): Promise<{
        mime: string;
        bytes: Uint8Array;
    } | null>;
}
