/**
 * Settings is the one app rendered natively (not AI-hallucinated): it controls
 * real system state. Laid out like macOS System Settings — a category sidebar
 * on the left, a scrollable detail pane on the right. Each pane lives in its own
 * file; shared building blocks are in ./primitives.
 */
export declare function SettingsApp(): import("react").JSX.Element | null;
