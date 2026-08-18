/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/ai/imageCache.ts (storeUpload)
 * + db/repositories/ImagesRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the images BLOB table becomes content-hashed files under the DSH
 * storages dir, served by /vibeos/img. Original license: MIT. */

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const IMAGE_URL_PREFIX = '/vibeos/img/';

const ID_RE = /^[0-9a-f]{32}$/;
const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/;

interface ImageType {
  mime: string;
  ext: string;
}

const TYPES: readonly ImageType[] = [
  { mime: 'image/png', ext: 'png' },
  { mime: 'image/jpeg', ext: 'jpg' },
  { mime: 'image/webp', ext: 'webp' },
  { mime: 'image/gif', ext: 'gif' },
];

/** Magic-byte sniff; the stored mime is never taken from the uploader. */
function sniff(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return TYPES[0]!;
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return TYPES[1]!;
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return TYPES[2]!;
  }
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return TYPES[3]!;
  }
  return null;
}

export function dshStoragesPath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages');
}

export class ImageStore {
  constructor(private readonly dir: string = join(dshStoragesPath(), 'vibeos-images')) {}

  /** `dataUrl` → served path, or null when it is not a decodable image (or too big). */
  async put(dataUrl: string, maxBytes?: number): Promise<string | null> {
    const m = DATA_URL_RE.exec(dataUrl);
    if (!m) return null;
    const body = m[3] ?? '';
    let bytes: Uint8Array;
    try {
      bytes = m[2]
        ? new Uint8Array(Buffer.from(body, 'base64'))
        : new Uint8Array(Buffer.from(decodeURIComponent(body)));
    } catch {
      return null;
    }
    if (!bytes.length) return null;
    if (maxBytes != null && bytes.length > maxBytes) return null;
    const type = sniff(bytes);
    if (!type) return null;

    const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const target = join(this.dir, `${id}.${type.ext}`);
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(temp, bytes, { mode: 0o600 });
      await rename(temp, target);
    } catch (e) {
      await unlink(temp).catch(() => {});
      throw e;
    }
    return IMAGE_URL_PREFIX + id;
  }

  async get(id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
    if (!ID_RE.test(id)) return null;
    for (const type of TYPES) {
      let buf: Buffer;
      try {
        buf = await readFile(join(this.dir, `${id}.${type.ext}`));
      } catch {
        continue;
      }
      const bytes = new Uint8Array(buf);
      const sniffed = sniff(bytes);
      if (!sniffed) return null;
      return { mime: sniffed.mime, bytes };
    }
    return null;
  }
}
