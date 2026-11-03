import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { resolve, sep, isAbsolute } from 'node:path';
import { BridgeError } from './contracts.ts';
import type { PublishRequest } from './contracts.ts';

function invalid(): never { throw new BridgeError('INVALID_REQUEST'); }
export function validatePublish(value: unknown, now = Date.now(), preview = false): PublishRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const p = value as PublishRequest;
  if (Object.keys(p).some(k => !['taskId','channel','accountId','title','body','media','settings','confirmed','dueAt'].includes(k))) invalid();
  if (!['xiaohongshu','fanqie'].includes(p.channel)) invalid();
  if (typeof p.taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(p.taskId)) invalid();
  if (typeof p.accountId !== 'string' || !p.accountId || p.accountId.length > 150) invalid();
  if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > (p.channel === 'xiaohongshu' ? 20 : 100)) invalid();
  if (typeof p.body !== 'string' || !p.body.trim() || p.body.length > (p.channel === 'xiaohongshu' ? 1000 : 80000)) invalid();
  if (!p.settings || typeof p.settings !== 'object' || typeof p.settings.useAI !== 'boolean') invalid();
  if (Object.keys(p.settings).some(k => !['useAI','bookId','chapterNumber','topics'].includes(k))) invalid();
  if (!Array.isArray(p.media) || p.media.some(m => typeof m !== 'string' || m.length > 500)) invalid();
  if (p.channel === 'xiaohongshu' && (p.media.length < 1 || p.media.length > 18)) invalid();
  if (p.channel === 'fanqie' && (p.media.length || typeof p.settings.bookId !== 'string' || !/^\d+$/.test(p.settings.bookId) || !Number.isSafeInteger(p.settings.chapterNumber) || p.settings.chapterNumber! < 1)) invalid();
  if (p.settings.topics !== undefined && (!Array.isArray(p.settings.topics) || p.settings.topics.length > 10 || p.settings.topics.some(t => typeof t !== 'string' || !t.trim() || t.length > 30))) invalid();
  if (!preview && p.confirmed !== true) throw new BridgeError('CONFIRMATION_REQUIRED');
  if (p.dueAt !== undefined) {
    if (typeof p.dueAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(p.dueAt)) throw new BridgeError('TIMEZONE_REQUIRED');
    const due = Date.parse(p.dueAt);
    if (!Number.isFinite(due)) invalid();
    if (!preview && now - due > 120000) throw new BridgeError('MISSED_SCHEDULE');
    if (!preview && due - now > 30000) throw new BridgeError('NOT_DUE');
  }
  return p;
}
export async function resolveMedia(root: string, relative: string): Promise<string> {
  if (!relative || isAbsolute(relative) || relative.includes('..') || relative.includes(':') || !/\.(jpe?g|png|webp)$/i.test(relative)) throw new BridgeError('INVALID_MEDIA');
  try {
    const base = await realpath(root);
    const path = await realpath(resolve(base, relative));
    const file = await stat(path);
    if (!path.startsWith(base + sep) || !file.isFile() || file.size > 30 * 1024 * 1024) throw Error();
    return path;
  } catch { throw new BridgeError('INVALID_MEDIA'); }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)]));
  return value;
}
export function contentHash(value: PublishRequest): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
