/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/server/httpServer.ts (/api/img route).
 * Adapted for DeepSeek Harness (dsh-vibeos): a ctx.webServer prefix route serving the content-hash
 * file store, behind the loopback trust fence. Original license: MIT. */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type { ImageStore } from '../state/imageStore';
import { isTrustedHttp } from './trust';

export const IMAGE_ROUTE_PATH = '/vibeos/img';

export function registerImageRoute(ctx: Context, store: ImageStore): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: IMAGE_ROUTE_PATH,
    handler: async (req, res) => {
      if (!isTrustedHttp(req)) {
        res.writeHead(403).end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      const id = pathname.startsWith(`${IMAGE_ROUTE_PATH}/`)
        ? pathname.slice(IMAGE_ROUTE_PATH.length + 1)
        : '';
      const img = id ? await store.get(id) : null;
      if (!img) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': img.mime,
        'Content-Length': img.bytes.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(img.bytes));
    },
  });
}
