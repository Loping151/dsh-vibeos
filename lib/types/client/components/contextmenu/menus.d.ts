import type { AppDescriptor, Theme, VfsNode, WindowState } from '../../../shared/index';
import { type MenuItem } from '../../registry/menus';
type T = (k: string) => string;
/** Right-click on the desktop background. */
export declare function desktopMenu(o: {
    t: T;
    apps: AppDescriptor[];
    skin: string;
    theme: Theme;
    onAppSearch: () => void;
    onAutoArrange: () => void;
}): MenuItem[];
/** Right-click on a window title bar. */
export declare function windowMenu(o: {
    t: T;
    win: WindowState;
    native: boolean;
}): MenuItem[];
/** Right-click on a taskbar / Dock window button. */
export declare function taskbarItemMenu(o: {
    t: T;
    win: WindowState;
}): MenuItem[];
/** Right-click on a desktop item (shortcut / file / folder). */
export declare function desktopItemMenu(o: {
    t: T;
    node: VfsNode;
}): MenuItem[];
/** Right-click on empty taskbar space. */
export declare function taskbarMenu(o: {
    t: T;
}): MenuItem[];
/** Right-click inside an app's content. */
export declare function appContentMenu(o: {
    t: T;
    win: WindowState;
    native: boolean;
}): MenuItem[];
export {};
