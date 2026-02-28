import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const INDEX_ROOT = path.join(process.cwd(), 'data', 'index');
const MANIFEST_PATH = path.join(INDEX_ROOT, 'index_manifest.json');
const LEGACY_INDEX_PATH = path.join(INDEX_ROOT, 'vectors.jsonl');

function sha256(input) {
  return crypto.createHash('sha256').update(String(input ?? ''), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(id) {
  return String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getIndexRootPath() {
  return INDEX_ROOT;
}

export function getManifestPath() {
  return MANIFEST_PATH;
}

export function getLegacyIndexPath() {
  return LEGACY_INDEX_PATH;
}

export function getChunkerVersion() {
  const explicit = String(process.env.CHUNKER_VERSION ?? '').trim();
  if (explicit) return explicit;
  return `chunker:${Number(config.ingest.chunkSize)}/${Number(config.ingest.chunkOverlap)}`;
}

export function getEmbeddingModelKey() {
  return `${config.embed.provider}:${config.embed.model}`;
}

export function createIndexId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getIndexDirPath(indexId) {
  const safeId = sanitizeId(indexId);
  return path.join(INDEX_ROOT, `index_${safeId}`);
}

export function getIndexVectorsPath(indexId) {
  return path.join(getIndexDirPath(indexId), 'vectors.jsonl');
}

export async function ensureIndexRoot() {
  await fs.mkdir(INDEX_ROOT, { recursive: true });
}

export async function readIndexManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const indexes = Array.isArray(parsed?.indexes) ? parsed.indexes : [];
    return {
      version: Number(parsed?.version ?? 1),
      activeIndexId: parsed?.activeIndexId ?? null,
      indexes,
      updatedAt: parsed?.updatedAt ?? null,
    };
  } catch (e) {
    if (e?.code === 'ENOENT') {
      return {
        version: 1,
        activeIndexId: null,
        indexes: [],
        updatedAt: null,
      };
    }
    throw e;
  }
}

export async function writeIndexManifest(manifest) {
  await ensureIndexRoot();
  const normalized = {
    version: Number(manifest?.version ?? 1),
    activeIndexId: manifest?.activeIndexId ?? null,
    indexes: Array.isArray(manifest?.indexes) ? manifest.indexes : [],
    updatedAt: nowIso(),
  };

  const tmpPath = `${MANIFEST_PATH}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(normalized, null, 2), 'utf8');
  await fs.rename(tmpPath, MANIFEST_PATH);
}

export async function computeDocsetHash(files, { baseDir = process.cwd(), chunkerVersion = '' } = {}) {
  const docs = [];
  for (const absPath of files) {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) continue;
    docs.push({
      path: path.relative(baseDir, absPath).replace(/\\/g, '/').toLowerCase(),
      size: Number(stat.size),
      mtimeMs: Math.floor(Number(stat.mtimeMs)),
    });
  }

  docs.sort((a, b) => a.path.localeCompare(b.path));
  const payload = {
    chunkerVersion,
    docs,
  };
  return sha256(JSON.stringify(payload));
}

export function findReusableIndex(
  manifest,
  { docsetHash, embeddingModel, chunkerVersion }
) {
  const indexes = Array.isArray(manifest?.indexes) ? manifest.indexes : [];
  const matches = indexes.filter(
    (it) =>
      String(it?.docsetHash ?? '') === String(docsetHash ?? '') &&
      String(it?.embeddingModel ?? '') === String(embeddingModel ?? '') &&
      String(it?.chunkerVersion ?? '') === String(chunkerVersion ?? '')
  );

  if (!matches.length) return null;
  matches.sort((a, b) => String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? '')));
  return matches[0];
}

export function getActiveIndexEntry(manifest) {
  const indexes = Array.isArray(manifest?.indexes) ? manifest.indexes : [];
  const activeId = manifest?.activeIndexId;
  if (!activeId) return null;
  return indexes.find((it) => String(it?.id ?? '') === String(activeId)) ?? null;
}

export async function resolveActiveIndexInfo() {
  const manifest = await readIndexManifest();
  const active = getActiveIndexEntry(manifest);
  if (active) {
    const vectorsPath = active?.vectorsPath || getIndexVectorsPath(active.id);
    return {
      source: 'manifest',
      id: active.id,
      path: vectorsPath,
      manifest,
      entry: active,
    };
  }

  try {
    await fs.access(LEGACY_INDEX_PATH);
    return {
      source: 'legacy',
      id: 'legacy',
      path: LEGACY_INDEX_PATH,
      manifest,
      entry: null,
    };
  } catch {
    return {
      source: 'none',
      id: null,
      path: LEGACY_INDEX_PATH,
      manifest,
      entry: null,
    };
  }
}

export async function activateIndexId(indexId) {
  const manifest = await readIndexManifest();
  const indexes = Array.isArray(manifest?.indexes) ? manifest.indexes : [];
  const exists = indexes.some((it) => String(it?.id ?? '') === String(indexId ?? ''));
  if (!exists) {
    throw new Error(`Index id not found in manifest: ${indexId}`);
  }

  manifest.activeIndexId = String(indexId);
  await writeIndexManifest(manifest);
}
