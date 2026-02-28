import { activateIndexId, readIndexManifest } from '../core/indexLifecycle.js';

async function main() {
  const id = String(process.argv[2] ?? '').trim();
  if (!id) {
    throw new Error('Usage: npm run index:rollback -- <indexId>');
  }

  const manifest = await readIndexManifest();
  const ids = (manifest.indexes ?? []).map((x) => x?.id).filter(Boolean);
  if (!ids.includes(id)) {
    throw new Error(`indexId not found: ${id}. known=[${ids.join(', ')}]`);
  }

  await activateIndexId(id);
  console.log(`[index] activeIndexId -> ${id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
