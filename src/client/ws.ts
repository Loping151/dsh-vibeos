/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/lib/ws.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): same-origin /vibeos/ws, API_BASE dropped,
 * dispose() added for plugin unload. Original license: MIT. */

import {
  makeEnvelope,
  ulid,
  type ClientToServer,
  type ServerToClient,
  type ServerToClientType,
  type WsEnvelope,
} from '../shared/index';

type Handler<T extends ServerToClientType> = (
  payload: Extract<ServerToClient, { type: T }>['payload'],
) => void;

type AnyHandler = (payload: unknown) => void;

function wsUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/vibeos/ws`;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<AnyHandler>>();
  private statusHandlers = new Set<(connected: boolean) => void>();
  private queue: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  connect(): void {
    if (this.disposed) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.notifyStatus(true);
      for (const frame of this.queue) ws.send(frame);
      this.queue = [];
    };

    ws.onmessage = (e) => {
      let env: WsEnvelope<unknown>;
      try {
        env = JSON.parse(e.data as string) as WsEnvelope<unknown>;
      } catch {
        return;
      }
      const set = this.handlers.get(env.type);
      if (set) for (const h of set) h(env.payload);
    };

    ws.onclose = () => {
      this.notifyStatus(false);
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 800);
  }

  private notifyStatus(connected: boolean): void {
    for (const h of this.statusHandlers) h(connected);
  }

  onStatus(fn: (connected: boolean) => void): () => void {
    this.statusHandlers.add(fn);
    return () => this.statusHandlers.delete(fn);
  }

  on<T extends ServerToClientType>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as AnyHandler);
    return () => set?.delete(fn as AnyHandler);
  }

  send<T extends ClientToServer['type']>(
    type: T,
    payload: Extract<ClientToServer, { type: T }>['payload'],
  ): void {
    const env = makeEnvelope(type, payload, ulid());
    const frame = JSON.stringify(env);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
    } else {
      this.queue.push(frame);
    }
  }

  /** Stop reconnecting and close the socket (plugin dispose / HMR drain). */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.queue = [];
  }
}

export const wsClient = new WsClient();
