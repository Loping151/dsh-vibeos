import type { UiRegion } from '../../shared/index';
/**
 * Apply region replacements to an HTML snapshot. Each region targets an element
 * carrying data-vibeos-region="<id>" and replaces its outerHTML.
 * Returns the merged HTML string.
 */
export declare function applyRegions(currentHtml: string, regions: UiRegion[]): string;
