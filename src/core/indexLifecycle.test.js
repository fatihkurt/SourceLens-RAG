import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { computeDocsetHash, findReusableIndex } from './indexLifecycle.js';

test('findReusableIndex matches by docset+embedding+chunker', () => {
  const manifest = {
    indexes: [
      {
        id: 'a1',
        createdAt: '2026-01-01T00:00:00.000Z',
        docsetHash: 'h1',
        embeddingModel: 'ollama:nomic',
        chunkerVersion: 'chunker:900/180',
      },
      {
        id: 'a2',
        createdAt: '2026-02-01T00:00:00.000Z',
        docsetHash: 'h1',
        embeddingModel: 'ollama:nomic',
        chunkerVersion: 'chunker:900/180',
      },
    ],
  };

  const hit = findReusableIndex(manifest, {
    docsetHash: 'h1',
    embeddingModel: 'ollama:nomic',
    chunkerVersion: 'chunker:900/180',
  });

  assert.equal(hit?.id, 'a2');
});

test('computeDocsetHash changes when file content changes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcelens-docset-'));
  const file = path.join(dir, 'a.md');
  try {
    await fs.writeFile(file, 'hello', 'utf8');
    const h1 = await computeDocsetHash([file], {
      baseDir: dir,
      chunkerVersion: 'v1',
    });

    await fs.writeFile(file, 'hello world', 'utf8');
    const h2 = await computeDocsetHash([file], {
      baseDir: dir,
      chunkerVersion: 'v1',
    });

    assert.notEqual(h1, h2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
