import { type ReactNode } from 'react';
import type { MenuItem } from '../../registry/menus';
/** Open a context menu at the event position. Suppresses the native menu. */
export declare function openContextMenu(e: React.MouseEvent, items: MenuItem[]): void;
/** Mounted once at the end of the desktop; renders the active menu. */
export declare function ContextMenuRoot(): ReactNode;
