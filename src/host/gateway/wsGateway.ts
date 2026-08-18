/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/server/wsGateway.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): Bun.serve sockets become a ws@8 noServer WebSocketServer
 * fed by ctx.webServer.registerUpgrade; teardown terminates every client. Original license: MIT. */

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { ServerToClientPayload, ServerToClientType } from '../../shared';
import { makeEnvelope, ulid } from '../../shared';

/** Inbound half of the bridge; the router implements it. */
export interface InboundHandler {
  handleMessage(ws: WebSocket, raw: string): Promise<void>;
  handleClose(ws: WebSocket): void;
}

function rawToString(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return String(data);
}

export class WsGateway {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sockets = new Set<WebSocket>();

  /** Connected browser tabs; ambient agents idle at zero. */
  clientCount(): number {
    return this.sockets.size;
  }
  private handler: InboundHandler | null = null;

  attach(handler: InboundHandler): void {
    this.handler = handler;
  }

  /** Called by the /vibeos/ws upgrade route AFTER the trust fence passed. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.register(ws));
  }

  register(ws: WebSocket): void {
    this.sockets.add(ws);
    ws.on('message', (data) => {
      void this.handler?.handleMessage(ws, rawToString(data));
    });
    const drop = () => {
      if (!this.sockets.delete(ws)) return;
      this.handler?.handleClose(ws);
    };
    ws.on('close', drop);
    ws.on('error', drop);
  }

  /** Send a single frame to one socket (request/response-ish messages only). */
  sendTo<T extends ServerToClientType>(
    ws: WebSocket,
    type: T,
    payload: ServerToClientPayload<T>,
  ): void {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(makeEnvelope(type, payload, ulid())));
  }

  /**
   * Broadcast a frame to every connected socket. Load-bearing: multiple tabs
   * mirror the one shared desktop through this fan-out.
   */
  broadcast<T extends ServerToClientType>(type: T, payload: ServerToClientPayload<T>): void {
    if (this.sockets.size === 0) return;
    const data = JSON.stringify(makeEnvelope(type, payload, ulid()));
    for (const ws of this.sockets) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  teardown(): void {
    for (const ws of this.wss.clients) ws.terminate();
    for (const ws of this.sockets) ws.terminate();
    this.sockets.clear();
    this.wss.close();
  }
}
