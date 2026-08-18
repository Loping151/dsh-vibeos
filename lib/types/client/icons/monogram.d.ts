interface MonogramProps {
    /** App label / icon name the monogram derives from. */
    source: string;
    className?: string;
}
/**
 * Monogram fallback: prefer 1-2 ASCII letters; for non-Latin names (e.g. CJK)
 * use the first character so they don't collapse to "?".
 *
 * The monogram IS the <svg> (not a <span> wrapping one) so skin rules that
 * size `.vibe-taskitem svg` (e.g. the Dock's 26px) apply to it exactly like a
 * real glyph. The rounded tile + letter live inside the viewBox, so the whole
 * thing scales with the icon at every size (Dock, start menu, desktop).
 */
export declare function Monogram({ source, className }: MonogramProps): import("react").JSX.Element;
export {};
