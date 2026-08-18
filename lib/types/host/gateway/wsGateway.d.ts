import type { WebSocket } from 'ws';
import type { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { ServerToClientPayload, ServerToClientType } from '../../shared';
/** Inbound half of the bridge; the router implements it. */
export interface InboundHandler {
    handleMessage(ws: WebSocket, raw: string): Promise<void>;
    handleClose(ws: WebSocket): void;
}
export declare class WsGateway {
    private readonly wss;
    private readonly sockets;
    /** Connected browser tabs; ambient agents idle at zero. */
    clientCount(): number;
    private handler;
    attach(handler: InboundHandler): void;
    /** Called by the /vibeos/ws upgrade route AFTER the trust fence passed. */
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
    register(ws: WebSocket): void;
    /** Send a single frame to one socket (request/response-ish messages only). */
    sendTo<T extends ServerToClientType>(ws: WebSocket, type: T, payload: ServerToClientPayload<T>): void;
    /**
     * Broadcast a frame to every connected socket. Load-bearing: multiple tabs
     * mirror the one shared desktop through this fan-out.
     */
    broadcast<T extends ServerToClientType>(type: T, payload: ServerToClientPayload<T>): void;
    teardown(): void;
}
