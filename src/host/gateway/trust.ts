import type { IncomingMessage } from 'node:http';

/*
 * Raw webServer routes bypass the shell's /api trust fence, so we replicate it:
 * loopback Host (blocks DNS rebinding), Origin === Host on upgrades (browsers
 * always send Origin on WS upgrades), and sec-fetch-site when present.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function hostIsLoopback(host: string | undefined): boolean {
  if (!host) return false;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function secFetchSiteOk(req: IncomingMessage): boolean {
  const site = headerValue(req, 'sec-fetch-site');
  return site === undefined || site === 'same-origin' || site === 'none';
}

export function isTrustedUpgrade(req: IncomingMessage): boolean {
  const host = headerValue(req, 'host');
  if (!hostIsLoopback(host)) return false;
  const origin = headerValue(req, 'origin');
  if (origin !== undefined) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return secFetchSiteOk(req);
}

/** Same fence minus the Origin requirement (plain same-origin GETs omit it). */
export function isTrustedHttp(req: IncomingMessage): boolean {
  return hostIsLoopback(headerValue(req, 'host')) && secFetchSiteOk(req);
}
