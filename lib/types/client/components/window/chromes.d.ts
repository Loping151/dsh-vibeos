import { type ChromeComponent } from '../../registry/apps';
/** Native chrome shell for an AppManifest.chrome key, live across registrations. */
export declare function useChrome(key: string | undefined): ChromeComponent | undefined;
