import { type RefObject } from 'react';
import type { AiOp } from '../../shared/index';
/**
 * Installs one delegated listener set on the surface. Any interaction with an
 * interactive-looking element becomes a typed AiOp sent upstream. No inline
 * handlers from the AI ever execute (sanitizer strips them).
 */
export declare function useDelegatedEvents(ref: RefObject<HTMLElement | null>, onOp: (op: AiOp) => void): void;
