/**
 * Read an image File as a data URL, downscaling oversized images to keep the
 * stored wallpaper small and the desktop snappy. Large rasters are redrawn to
 * `maxW` wide and re-encoded as JPEG; small files pass through untouched.
 */
export declare function fileToWallpaperDataUrl(file: File, maxW?: number): Promise<string>;
