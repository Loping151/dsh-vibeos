import { type ClientToServer, type ServerToClient, type ServerToClientType } from '../shared/index';
type Handler<T extends ServerToClientType> = (payload: Extract<ServerToClient, {
    type: T;
}>['payload']) => void;
export declare class WsClient {
    private ws;
    private handlers;
    private statusHandlers;
    private queue;
    private reconnectTimer;
    private disposed;
    connect(): void;
    private scheduleReconnect;
    private notifyStatus;
    onStatus(fn: (connected: boolean) => void): () => void;
    on<T extends ServerToClientType>(type: T, fn: Handler<T>): () => void;
    send<T extends ClientToServer['type']>(type: T, payload: Extract<ClientToServer, {
        type: T;
    }>['payload']): void;
    /** Stop reconnecting and close the socket (plugin dispose / HMR drain). */
    dispose(): void;
}
export declare const wsClient: WsClient;
export {};
