import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SRC_DIR = path.join(process.cwd(), 'src');

function isTestFile(name) {
  return name.endsWith('.test.js') || name.endsWith('.test.ts');
}

async function collectTests(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTests(full, out);
      continue;
    }
    if (entry.isFile() && isTestFile(entry.name)) {
      out.push(full);
    }
  }
}

function tsxCliPath() {
  return path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
}

async function main() {
  const tests = [];
  await collectTests(SRC_DIR, tests);
  tests.sort((a, b) => a.localeCompare(b));

  if (!tests.length) {
    console.error('No test files found under src (expected *.test.js or *.test.ts).');
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [tsxCliPath(), '--test', ...tests], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
