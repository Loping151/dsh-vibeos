/** VibeOS section inside the stock DSH settings dialog (slot `settings.section`).
 * Styled with --dsw-* tokens only — it lives outside #vibeos-root, so vibe
 * tokens/classes do not apply here. Writes go through the same WS settings
 * path the desktop uses, so both UIs stay in sync. */
import { type ReactNode } from 'react';
export declare function VibeosSection(): ReactNode;
