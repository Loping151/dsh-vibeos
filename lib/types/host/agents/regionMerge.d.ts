export declare function applyRegionsServer(current: string, regions: {
    region: string;
    html: string;
}[]): string;
/** List the data-vibeos-region ids present in a snapshot. */
export declare function extractRegionIds(html: string): string[];
