import { type ParsedAiOutput } from '../../shared/prompt/syscall-schema';
/** Incrementally extract the streaming HTML body for live patching. */
export declare function extractStreamingHtml(buffer: string): string | null;
/** Parse the complete AI output into its structured parts. */
export declare function parseAiOutput(full: string): ParsedAiOutput;
/**
 * Depth-aware extraction of every element carrying data-vibeos-region, including
 * its full (possibly nested) inner HTML. A regex like /…<\/tag>/ would stop at
 * the first closing tag and shred nested content — so we scan tag-by-tag and
 * balance open/close tags to find the true end of each region element.
 */
export declare function extractRegions(html: string): {
    region: string;
    html: string;
}[];
