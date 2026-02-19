import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chunkText } from './core/chunker.js';
import { embedText } from './core/embedder.js';
import { appendMany, getDefaultIndexPath } from './core/vectorstore.js';

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

async function main() {

  // get path from args

  const ingestPath = process.argv.slice(2).join(' ').trim();

  const rawDir = path.join(process.cwd(), 'data', 'raw', ingestPath);
  console.log('rawDir', rawDir)
  const files = await listFiles(rawDir).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });

  if (!files.length) {
    console.log(`No files found under ${rawDir}. Put .md/.txt files there.`);
    process.exit(0);
  }

  console.log(`Index file: ${getDefaultIndexPath()}`);
  console.log(`Found ${files.length} files. Ingesting...`);

  let totalChunks = 0;

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.md', '.txt'].includes(ext)) continue;

    const text = await fs.readFile(filePath, 'utf8');
    const chunks = chunkText(text, {
      chunkSize: Number(process.env.CHUNK_SIZE ?? 800),
      overlap: Number(process.env.CHUNK_OVERLAP ?? 150),
    });

    const rel = path.relative(process.cwd(), filePath);

    const items = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const { chunk, start, end } = chunks[idx];
      const id = sha1(`${rel}::${idx}::${sha1(chunk)}`);

      const embedding = await embedText(chunk);
      items.push({
        id,
        vector: embedding,
        metadata: {
          source: rel,
          chunk_index: idx,
          char_start: start,
          char_end: end,
          text: chunk,
        },
      });
      totalChunks++;
      if (totalChunks % 10 === 0) console.log(`...embedded ${totalChunks} chunks`);
    }

    await appendMany(items);
    console.log(`Ingested ${rel}: ${chunks.length} chunks`);
  }

  console.log(`Done. Total chunks embedded: ${totalChunks}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
