import { config } from '../core/config.js';
import { clearJsonCacheAll, clearJsonCacheNamespace } from '../utils/fileCache.js';

async function main() {
  const target = String(process.argv[2] ?? 'all').trim().toLowerCase();
  const baseDir = config.cache.dir;

  if (target === 'all') {
    await clearJsonCacheAll({ baseDir });
    console.log(`[cache] cleared all namespaces under ${baseDir}`);
    return;
  }

  await clearJsonCacheNamespace({ baseDir, namespace: target });
  console.log(`[cache] cleared namespace="${target}" under ${baseDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
