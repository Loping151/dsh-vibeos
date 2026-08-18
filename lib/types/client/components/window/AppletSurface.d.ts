/** Sandboxed applet surface: a full HTML document with REAL JavaScript, run in
 * an `allow-scripts`-only iframe. Without `allow-same-origin` the document sits
 * in an opaque origin — no access to the host DOM, cookies or storage — so the
 * only channel back is postMessage, validated here. */
import { type ReactNode } from 'react';
interface Props {
    windowId: string;
    /** Document body/markup produced by the model. */
    applet: string;
}
export declare function AppletSurface({ windowId, applet }: Props): ReactNode;
export {};
