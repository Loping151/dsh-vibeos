/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/AppIcon.tsx
 * (monogram fallback). Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

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
export function Monogram({ source, className }: MonogramProps) {
  const base = source.trim();
  const ascii = base.replace(/[^A-Za-z0-9]/g, '');
  const monogram = ascii ? ascii.slice(0, 2).toUpperCase() : ([...base][0] ?? '?');
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" style={{ fill: 'var(--muted)' }} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: 'var(--muted-foreground)' }}
        fontSize={monogram.length > 1 ? 12 : 15}
        fontWeight={600}
      >
        {monogram}
      </text>
    </svg>
  );
}
