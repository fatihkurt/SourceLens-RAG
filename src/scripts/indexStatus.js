import { readIndexManifest, resolveActiveIndexInfo } from '../core/indexLifecycle.js';

async function main() {
  const manifest = await readIndexManifest();
  const active = await resolveActiveIndexInfo();
  const indexes = Array.isArray(manifest.indexes) ? manifest.indexes : [];

  console.log(
    JSON.stringify(
      {
        activeIndexId: active.id,
        source: active.source,
        indexCount: indexes.length,
        indexes: indexes.map((it) => ({
          id: it.id,
          createdAt: it.createdAt,
          docsetHash: it.docsetHash,
          embeddingModel: it.embeddingModel,
          chunkerVersion: it.chunkerVersion,
          docCount: it.docCount,
          chunkCount: it.chunkCount,
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
