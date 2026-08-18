/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/protocol/schema.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

import { z } from 'zod';
import type { ClientToServer } from './c2s';

/**
 * Runtime validation for inbound client->server messages. The WS boundary is the
 * one place untrusted input enters the host, so every frame is parsed here
 * before dispatch. HOST-ONLY value import: never pull this module into the
 * client bundle (it would drag zod in).
 */

const aiOp = z.object({
  kind: z.enum(['click', 'input', 'submit', 'change', 'key', 'custom']),
  action: z.string().optional(),
  sel: z.string().optional(),
  dataset: z.record(z.string(), z.string()).optional(),
  value: z.string().optional(),
  formData: z.record(z.string(), z.string()).optional(),
});

const dragPayload = z.object({
  kind: z.enum(['text', 'image', 'file', 'desktop-object', 'app-shortcut']),
  ref: z.string(),
  label: z.string().optional(),
});

const dropTarget = z.object({
  windowId: z.string().optional(),
  action: z.string().optional(),
  sel: z.string().optional(),
});

const empty = z.object({});

/** Build a `{ type: <literal>, payload }` message schema, preserving the literal. */
const msg = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), payload });

export const clientToServerSchema = z.discriminatedUnion('type', [
  msg('c2s.boot.hello', z.object({ clientId: z.string().optional() })),
  msg('c2s.op', z.object({ windowId: z.string(), op: aiOp })),
  msg(
    'c2s.op.dragdrop',
    z.object({ windowId: z.string().optional(), source: dragPayload, target: dropTarget }),
  ),
  msg('c2s.window.open', z.object({ appId: z.string(), hint: z.string().optional() })),
  msg('c2s.window.close', z.object({ windowId: z.string() })),
  msg('c2s.window.focus', z.object({ windowId: z.string() })),
  msg('c2s.window.minimize', z.object({ windowId: z.string() })),
  msg('c2s.window.maximize', z.object({ windowId: z.string() })),
  msg(
    'c2s.window.move',
    z.object({ windowId: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  ),
  msg('c2s.window.reorder', z.object({ ids: z.array(z.string()) })),
  msg('c2s.window.undo', z.object({ windowId: z.string() })),
  msg('c2s.window.redo', z.object({ windowId: z.string() })),
  msg(
    'c2s.vfs.move',
    z.object({
      nodeId: z.string(),
      location: z.enum(['desktop', 'folder', 'recyclebin']),
      x: z.number().optional(),
      y: z.number().optional(),
      parentId: z.string().optional(),
    }),
  ),
  msg('c2s.vfs.open', z.object({ nodeId: z.string() })),
  msg('c2s.vfs.delete', z.object({ nodeId: z.string() })),
  msg('c2s.vfs.empty', empty),
  // Settings is large and deep-merged host-side; validate only that it's an
  // object (each handler reads the fields it needs).
  msg('c2s.settings.update', z.object({ partial: z.record(z.string(), z.unknown()) })),
  msg('c2s.app.uninstall', z.object({ appId: z.string() })),
  msg('c2s.wallpaper.upload', z.object({ dataUrl: z.string() })),
  msg('c2s.notification.read', z.object({ id: z.string() })),
  msg('c2s.notification.click', z.object({ id: z.string() })),
  msg('c2s.app.search', z.object({ query: z.string(), requestId: z.string() })),
  msg('c2s.command.run', z.object({ text: z.string(), requestId: z.string() })),
  msg(
    'c2s.app.launch',
    z.object({
      name: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      widget: z.boolean().optional(),
    }),
  ),
  msg(
    'c2s.app.save',
    z.object({ windowId: z.string(), name: z.string().optional(), icon: z.string().optional() }),
  ),
  msg('c2s.app.export', z.object({ appId: z.string() })),
  msg('c2s.app.import', z.object({ json: z.string() })),
  msg(
    'c2s.activity.fetch',
    z.object({ before: z.number().optional(), limit: z.number().optional() }),
  ),
  msg('c2s.activity.stop', z.object({ runId: z.string() })),
  msg('c2s.models.list', empty),
  msg('c2s.system.reset', empty),
  msg('c2s.session.list', z.object({})),
  msg('c2s.session.restore', z.object({ id: z.string() })),
  msg('c2s.session.export', z.object({ id: z.string() })),
  msg('c2s.session.import', z.object({ json: z.string() })),
]);

/** Validate an inbound `{ type, payload }`; returns the typed message or null. */
export function parseClientMessage(input: unknown): ClientToServer | null {
  const r = clientToServerSchema.safeParse(input);
  return r.success ? (r.data as ClientToServer) : null;
}
