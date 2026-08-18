/** Inline-SVG chrome icon set replacing lucide-react (loader can't seed it).
 * Path data from Lucide (https://lucide.dev), ISC license — kept verbatim so
 * glyphs match the icons VibeOS used. */
import { type FC } from 'react';
export type IconNode = ReadonlyArray<readonly [string, Record<string, string>]>;
export interface IconProps {
    size?: number;
    className?: string;
    strokeWidth?: number;
}
export declare function LucideGlyph({ node, size, className, strokeWidth, }: IconProps & {
    node: IconNode;
}): import("react").JSX.Element;
export declare function makeIcon(node: IconNode): FC<IconProps>;
export declare const X: FC<IconProps>;
export declare const Minus: FC<IconProps>;
export declare const Square: FC<IconProps>;
export declare const Search: FC<IconProps>;
export declare const Loader2: FC<IconProps>;
export declare const Bell: FC<IconProps>;
export declare const ChevronDown: FC<IconProps>;
export declare const ChevronLeft: FC<IconProps>;
export declare const ChevronRight: FC<IconProps>;
export declare const ArrowLeft: FC<IconProps>;
export declare const ArrowRight: FC<IconProps>;
export declare const RotateCw: FC<IconProps>;
export declare const RefreshCw: FC<IconProps>;
export declare const Undo2: FC<IconProps>;
export declare const Redo2: FC<IconProps>;
export declare const Power: FC<IconProps>;
export declare const MessageSquare: FC<IconProps>;
export declare const Info: FC<IconProps>;
export declare const CheckCircle2: FC<IconProps>;
export declare const AlertTriangle: FC<IconProps>;
export declare const XCircle: FC<IconProps>;
export declare const Check: FC<IconProps>;
export declare const CheckCheck: FC<IconProps>;
export declare const Copy: FC<IconProps>;
export declare const Save: FC<IconProps>;
export declare const Download: FC<IconProps>;
export declare const Upload: FC<IconProps>;
export declare const Eye: FC<IconProps>;
export declare const EyeOff: FC<IconProps>;
export declare const Languages: FC<IconProps>;
export declare const LayoutGrid: FC<IconProps>;
export declare const AppWindow: FC<IconProps>;
export declare const Sparkles: FC<IconProps>;
export declare const Sun: FC<IconProps>;
export declare const Moon: FC<IconProps>;
export declare const Monitor: FC<IconProps>;
export declare const Pencil: FC<IconProps>;
export declare const Plus: FC<IconProps>;
export declare const User: FC<IconProps>;
export declare const Boxes: FC<IconProps>;
export declare const Server: FC<IconProps>;
export declare const SlidersHorizontal: FC<IconProps>;
export declare const Activity: FC<IconProps>;
export declare const Trash2: FC<IconProps>;
export declare const StopCircle: FC<IconProps>;
