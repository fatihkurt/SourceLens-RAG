import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_INDEX_PATH = path.join(process.cwd(), 'data', 'index', 'vectors.jsonl');

export async function ensureIndexDir() {
  const dir = path.dirname(DEFAULT_INDEX_PATH);
  await fs.mkdir(dir, { recursive: true });
}

export async function appendMany(items, { indexPath = DEFAULT_INDEX_PATH } = {}) {
  await ensureIndexDir();
  const lines = items.map((it) => JSON.stringify(it)).join('\n') + '\n';
  await fs.appendFile(indexPath, lines, 'utf8');
}

export async function readAll({ indexPath = DEFAULT_INDEX_PATH } = {}) {
  try {
    const txt = await fs.readFile(indexPath, 'utf8');
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



export class VectorStore {
  async upsertMany(items) { throw new Error("not implemented"); }
  async query(vector, { topK, filter }) { throw new Error("not implemented"); }
}
