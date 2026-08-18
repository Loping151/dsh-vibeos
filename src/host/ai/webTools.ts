/** Model-facing web tools for UI generation, backed by the DSH web seam
 * (ctx.web: search + fetch providers, credentials handled by the harness).
 * The service is optional — absent providers simply disable the tools. */

import type { Context } from '@deepseek-ai/cordis';
import { lookup } from 'node:dns/promises';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import { logger } from '../log';

const log = logger('web');

export interface WebToolConfig {
  enabled: boolean;
  timeoutMs: number;
  maxChars: number;
  maxCalls: number;
}

export const WEB_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'web_search',
    description:
      'Search the real internet. Use it to ground generated pages in real data: real search results, news, product info, documentation. Returns numbered results with title, url and snippet.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
        maxResults: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'web_fetch',
    description:
      'Fetch a real URL and return its readable content (title, text, links). Use it when the user navigates to a real website so the rendered page matches reality.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Absolute http(s) URL.' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
];

interface WebSeam {
  search(
    req: { query: string; maxResults?: number },
    signal?: AbortSignal,
  ): Promise<{
    content?: string;
    sources: ReadonlyArray<{ url: string; title?: string; snippet?: string }>;
    truncated: boolean;
  }>;
  fetch(
    req: { url: string },
    signal?: AbortSignal,
  ): Promise<{
    url: string;
    statusCode: number;
    body: { kind: 'html' | 'text'; content: string } | { kind: string; content?: string };
    truncated: boolean;
  }>;
}

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;
  if (host === 'localhost' || PRIVATE_V4.test(host) || host === '::1' || host === '[::1]') {
    throw new Error('private address blocked');
  }
  const { address } = await lookup(host);
  if (PRIVATE_V4.test(address) || address === '::1' || address.startsWith('fe80:') || address.startsWith('fd')) {
    throw new Error('private address blocked');
  }
}

/** Anonymous direct HTTP fallback when the profile assembles no fetch provider. */
async function directFetch(
  rawUrl: string,
  timeoutMs: number,
): Promise<{ url: string; statusCode: number; kind: 'html' | 'text'; content: string }> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http(s)');
  await assertPublicHost(url);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    },
  });
  const type = res.headers.get('content-type') ?? '';
  const content = await res.text();
  return {
    url: res.url,
    statusCode: res.status,
    kind: type.includes('html') ? 'html' : 'text',
    content: content.slice(0, 800_000),
  };
}

/** Strip an HTML document down to a readable digest the model can rebuild from. */
export function htmlDigest(html: string, maxChars: number): string {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  const links: string[] = [];
  const linkRe = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && links.length < 25) {
    const label = m[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (label && m[1]!.startsWith('http')) links.push(`${label} -> ${m[1]}`);
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|#160);/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
  return [
    title ? `TITLE: ${title}` : '',
    `TEXT: ${text}`,
    links.length ? `LINKS:\n${links.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export class WebToolRuntime {
  constructor(
    private readonly ctx: Context,
    private readonly cfg: WebToolConfig,
  ) {}

  available(): boolean {
    return this.cfg.enabled && !!(this.ctx as { get(name: string): unknown }).get('web');
  }

  get maxCalls(): number {
    return this.cfg.maxCalls;
  }

  async exec(name: string, argsJson: string): Promise<{ text: string; isError: boolean }> {
    const web = (this.ctx as { get(name: string): unknown }).get('web') as WebSeam | undefined;
    if (!web) return { text: 'web access unavailable', isError: true };
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return { text: 'invalid tool arguments', isError: true };
    }
    const signal = AbortSignal.timeout(this.cfg.timeoutMs);
    try {
      if (name === 'web_search') {
        const query = String(args.query ?? '').slice(0, 400);
        if (!query) return { text: 'empty query', isError: true };
        const res = await web.search(
          { query, maxResults: Math.min(Number(args.maxResults) || 8, 10) },
          signal,
        );
        const lines = res.sources.map(
          (s, i) => `${i + 1}. ${s.title ?? s.url}\n   ${s.url}${s.snippet ? `\n   ${s.snippet}` : ''}`,
        );
        const body = [res.content?.slice(0, this.cfg.maxChars / 2), lines.join('\n')]
          .filter(Boolean)
          .join('\n\n');
        log.info(`web_search "${query.slice(0, 60)}" -> ${res.sources.length} sources`);
        return { text: body.slice(0, this.cfg.maxChars) || 'no results', isError: false };
      }
      if (name === 'web_fetch') {
        const url = String(args.url ?? '');
        if (!/^https?:\/\//i.test(url)) return { text: 'only http(s) urls', isError: true };
        let finalUrl: string;
        let status: number;
        let kind: string;
        let content: string;
        try {
          const res = await web.fetch({ url }, signal);
          finalUrl = res.url;
          status = res.statusCode;
          kind = res.body.kind;
          content = res.body.content ?? '';
        } catch (e) {
          const direct = await directFetch(url, this.cfg.timeoutMs);
          finalUrl = direct.url;
          status = direct.statusCode;
          kind = direct.kind;
          content = direct.content;
        }
        const digest =
          kind === 'html' ? htmlDigest(content, this.cfg.maxChars) : content.slice(0, this.cfg.maxChars);
        log.info(`web_fetch ${url.slice(0, 80)} -> HTTP ${status}, ${digest.length} chars`);
        return { text: `HTTP ${status} ${finalUrl}\n${digest}`, isError: false };
      }
      return { text: `unknown tool ${name}`, isError: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`${name} failed: ${msg}`);
      return { text: `${name} failed: ${msg}`, isError: true };
    }
  }
}
