import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  clearJsonCacheNamespace,
  normalizeCacheText,
  readJsonCache,
  sha256Hex,
  writeJsonCache,
} from './fileCache.js';

test('normalizeCacheText collapses whitespace and trims', () => {
  assert.equal(normalizeCacheText('  Hello   \n  world\t\t '), 'Hello world');
});

test('file cache write/read roundtrip', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcelens-cache-'));
  try {
    const key = sha256Hex('k1');
    await writeJsonCache({
      baseDir: dir,
      namespace: 'queries',
      key,
      value: { a: 1 },
    });

    const cached = await readJsonCache({
      baseDir: dir,
      namespace: 'queries',
      key,
      ttlMs: 60_000,
    });

    assert.equal(cached.hit, true);
    assert.deepEqual(cached.value, { a: 1 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('clearJsonCacheNamespace removes cached keys in namespace', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcelens-cache-'));
  try {
    const key = sha256Hex('k2');
    await writeJsonCache({
      baseDir: dir,
      namespace: 'queries',
      key,
      value: { b: 2 },
    });

    await clearJsonCacheNamespace({
      baseDir: dir,
      namespace: 'queries',
    });

    const cached = await readJsonCache({
      baseDir: dir,
      namespace: 'queries',
      key,
      ttlMs: 60_000,
    });

    assert.equal(cached.hit, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
