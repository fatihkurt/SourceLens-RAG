import fs from 'node:fs/promises';
import path from 'node:path';
import { getLegacyIndexPath, resolveActiveIndexInfo } from './indexLifecycle.js';

const DEFAULT_INDEX_PATH = getLegacyIndexPath();

export async function ensureIndexDir({ indexPath = DEFAULT_INDEX_PATH } = {}) {
  const dir = path.dirname(indexPath);
  await fs.mkdir(dir, { recursive: true });
}

export async function appendMany(items, { indexPath = DEFAULT_INDEX_PATH } = {}) {
  await ensureIndexDir({ indexPath });
  const lines = items.map((it) => JSON.stringify(it)).join('\n') + '\n';
  await fs.appendFile(indexPath, lines, 'utf8');
}

export async function readAll({ indexPath = DEFAULT_INDEX_PATH } = {}) {
  const chosenPath = indexPath === DEFAULT_INDEX_PATH
    ? (await resolveActiveIndexInfo()).path
    : indexPath;

  try {
    const txt = await fs.readFile(chosenPath, 'utf8');
    return txt
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export function getDefaultIndexPath() {
  return DEFAULT_INDEX_PATH;
}

export async function getActiveIndexInfo() {
  return resolveActiveIndexInfo();
}



export class VectorStore {
  async upsertMany(items) { throw new Error("not implemented"); }
  async query(vector, { topK, filter }) { throw new Error("not implemented"); }
}
