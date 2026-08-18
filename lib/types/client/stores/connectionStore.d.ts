import type { BootPhase, BootStatePayload, CatalogProvider, EffectiveModels } from '../../shared/index';
export type BootFeatures = BootStatePayload['features'];
interface ConnectionState {
    connected: boolean;
    bootPhase: BootPhase;
    bootCount: number;
    version: string;
    effective: EffectiveModels | null;
    catalog: CatalogProvider[];
    features: BootFeatures | null;
    setConnected: (v: boolean) => void;
    setBootPhase: (p: BootPhase) => void;
    setBootInfo: (info: {
        bootCount: number;
        version: string;
        effective: EffectiveModels;
        features: BootFeatures;
    }) => void;
    setModelsInfo: (info: {
        effective: EffectiveModels;
        catalog: CatalogProvider[];
    }) => void;
}
export declare const useConnectionStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ConnectionState>>;
export {};
