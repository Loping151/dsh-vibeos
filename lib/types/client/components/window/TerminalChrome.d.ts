/** Native terminal shell. The prompt lives INLINE at the end of the scrollback —
 * exactly where a real terminal puts it — and typing/history/echo are handled
 * locally with no model round-trip. The model only ever returns scrollback
 * output for a submitted command. */
import { type ReactNode } from 'react';
export declare function TerminalChrome({ windowId, children, }: {
    windowId: string;
    children: ReactNode;
}): ReactNode;
