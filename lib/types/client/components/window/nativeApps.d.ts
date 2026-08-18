import { type NativeAppRenderer } from '../../registry/apps';
/** Native renderer for a preset id, live across registrations. */
export declare function useNativeApp(presetId: string | undefined): NativeAppRenderer | undefined;
