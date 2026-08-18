import { type ReactNode } from 'react';
/**
 * Native browser chrome: address bar + back/forward/reload wrapping the AI page.
 * Forward (bar -> AI) sends a "navigate" op; reverse (AI -> bar) arrives through
 * the chrome syscall and updates the URL here.
 */
export declare function BrowserChrome({ windowId, children, }: {
    windowId: string;
    children: ReactNode;
}): ReactNode;
