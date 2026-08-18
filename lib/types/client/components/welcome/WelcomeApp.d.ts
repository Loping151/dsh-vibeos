/**
 * Native Welcome app — the cold-start landing. A real VibeOS window (opened on
 * first boot, reopenable from the start menu), so this renders only the body;
 * the window chrome provides the titlebar and close button. On open it centers
 * itself and sizes the window to fit its content.
 */
export declare function WelcomeApp({ windowId }: {
    windowId: string;
}): import("react").JSX.Element;
