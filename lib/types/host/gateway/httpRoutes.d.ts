import type { Context } from '@deepseek-ai/cordis';
import type { ImageStore } from '../state/imageStore';
export declare const IMAGE_ROUTE_PATH = "/vibeos/img";
export declare function registerImageRoute(ctx: Context, store: ImageStore): () => void;
