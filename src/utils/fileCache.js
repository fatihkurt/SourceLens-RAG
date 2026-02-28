import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function sha256Hex(input) {
  return createHash('sha256').update(String(input ?? ''), 'utf8').digest('hex');
}

export function normalizeCacheText(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

function resolveCacheFile(baseDir, namespace, key) {
  const ns = String(namespace ?? 'default').replace(/[^a-z0-9_\-/]/gi, '_');
  const hex = String(key ?? '');
  const prefix = hex.slice(0, 2) || '00';
  return path.join(baseDir, ns, prefix, `${hex}.json`);
}

export async function readJsonCache({ baseDir, namespace, key, ttlMs = 0 }) {
  const file = resolveCacheFile(baseDir, namespace, key);
  try {
    const stat = await fs.stat(file);
    if (Number(ttlMs) > 0 && Date.now() - stat.mtimeMs > Number(ttlMs)) {
      return { hit: false };
    }

    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'value' in parsed) {
      return { hit: true, value: parsed.value };
    }
    return { hit: true, value: parsed };
  } catch (e) {
    if (e?.code === 'ENOENT') return { hit: false };
    return { hit: false };
  }
}

export async function writeJsonCache({ baseDir, namespace, key, value }) {
  const file = resolveCacheFile(baseDir, namespace, key);
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    cached_at: new Date().toISOString(),
    value,
  };
  await fs.writeFile(file, JSON.stringify(payload), 'utf8');
}

export async function clearJsonCacheNamespace({ baseDir, namespace }) {
  const ns = String(namespace ?? 'default').replace(/[^a-z0-9_\-/]/gi, '_');
  const target = path.join(baseDir, ns);
  await fs.rm(target, { recursive: true, force: true });
}

export async function clearJsonCacheAll({ baseDir }) {
  await fs.rm(baseDir, { recursive: true, force: true });
}
