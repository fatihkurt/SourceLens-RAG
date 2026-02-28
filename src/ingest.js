import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chunkMarkdown } from './core/chunker.js';
import { embedText } from './core/embedder.js';
import { appendMany, getDefaultIndexPath } from './core/vectorstore.js';
import { config } from './core/config.js';
import { clearJsonCacheNamespace } from './utils/fileCache.js';
import {
  activateIndexId,
  computeDocsetHash,
  createIndexId,
  findReusableIndex,
  getChunkerVersion,
  getEmbeddingModelKey,
  getIndexDirPath,
  getIndexVectorsPath,
  readIndexManifest,
  writeIndexManifest,
} from './core/indexLifecycle.js';

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const force = args.includes('--force') || String(process.env.INDEX_FORCE_REBUILD ?? '') === '1';
  const ingestPath = args.filter((a) => a !== '--force').join(' ').trim();
  return { force, ingestPath };
}

async function main() {
  const { force, ingestPath } = parseArgs(process.argv);
  const rawDir = path.join(process.cwd(), 'data', 'raw', ingestPath);

  const files = await listFiles(rawDir).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });

  const docFiles = files.filter((f) => ['.md', '.txt'].includes(path.extname(f).toLowerCase()));
  if (!docFiles.length) {
    console.log(`No files found under ${rawDir}. Put .md/.txt files there.`);
    process.exit(0);
  }

  const chunkerVersion = getChunkerVersion();
  const embeddingModel = getEmbeddingModelKey();
  const docsetHash = await computeDocsetHash(docFiles, {
    baseDir: rawDir,
    chunkerVersion,
  });

  const manifest = await readIndexManifest();
  const reusable = findReusableIndex(manifest, {
    docsetHash,
    embeddingModel,
    chunkerVersion,
  });

  if (!force && reusable) {
    if (String(manifest.activeIndexId ?? '') !== String(reusable.id)) {
      await activateIndexId(reusable.id);
      console.log(`[index] activeIndexId -> ${reusable.id} (reused)`);
    }

    console.log(`[ingest] skipped (idempotent): docsetHash=${docsetHash.slice(0, 12)} indexId=${reusable.id}`);

    if (config.cache.enabled && config.cache.queryEnabled) {
      await clearJsonCacheNamespace({
        baseDir: config.cache.dir,
        namespace: 'queries',
      });
      console.log(`[cache] invalidated query cache after active index switch: ${config.cache.dir}`);
    }
    process.exit(0);
  }

  const newIndexId = createIndexId();
  const newIndexDir = getIndexDirPath(newIndexId);
  const newIndexPath = getIndexVectorsPath(newIndexId);

  console.log(`Legacy index file: ${getDefaultIndexPath()}`);
  console.log(`New index file: ${newIndexPath}`);
  console.log(`Found ${docFiles.length} files. Ingesting...`);

  let totalChunks = 0;
  let ingestedDocs = 0;

  try {
    for (const filePath of docFiles) {
      const ext = path.extname(filePath).toLowerCase();
      if (!['.md', '.txt'].includes(ext)) continue;

      const text = await fs.readFile(filePath, 'utf8');
      const chunks = chunkMarkdown(text, {
        chunkSize: Number(config.ingest.chunkSize),
        overlap: Number(config.ingest.chunkOverlap),
      });

      const rel = path.relative(process.cwd(), filePath);
      const items = [];
      for (let idx = 0; idx < chunks.length; idx++) {
        const { chunk, local_start, local_end, section, chunk_index } = chunks[idx];
        const id = sha1(`${rel}::${idx}::${sha1(chunk)}`);

        const embedding = await embedText(chunk);
        items.push({
          id,
          vector: embedding,
          metadata: {
            source: rel,
            chunk_index,
            section,
            char_start: local_start,
            char_end: local_end,
            text: chunk,
          },
        });

        totalChunks++;
        if (totalChunks % 10 === 0) console.log(`...embedded ${totalChunks} chunks`);
      }

      await appendMany(items, { indexPath: newIndexPath });
      console.log(`Ingested ${rel}: ${chunks.length} chunks`);
      ingestedDocs++;
    }

    const nextManifest = await readIndexManifest();
    const indexes = Array.isArray(nextManifest.indexes) ? nextManifest.indexes : [];
    const createdAt = new Date().toISOString();

    indexes.push({
      id: newIndexId,
      createdAt,
      vectorsPath: newIndexPath,
      docsetHash,
      embeddingModel,
      chunkerVersion,
      docCount: ingestedDocs,
      chunkCount: totalChunks,
    });

    nextManifest.indexes = indexes;
    nextManifest.activeIndexId = newIndexId;
    await writeIndexManifest(nextManifest);
    console.log(`[index] activeIndexId -> ${newIndexId}`);

    if (totalChunks > 0 && config.cache.enabled && config.cache.queryEnabled) {
      await clearJsonCacheNamespace({
        baseDir: config.cache.dir,
        namespace: 'queries',
      });
      console.log(`[cache] invalidated query cache after ingest: ${config.cache.dir}`);
    }

    console.log(`Done. Total chunks embedded: ${totalChunks}`);
  } catch (e) {
    await fs.rm(newIndexDir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
