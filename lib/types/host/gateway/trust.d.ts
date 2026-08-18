import type { IncomingMessage } from 'node:http';
export declare function isTrustedUpgrade(req: IncomingMessage): boolean;
/** Same fence minus the Origin requirement (plain same-origin GETs omit it). */
export declare function isTrustedHttp(req: IncomingMessage): boolean;
