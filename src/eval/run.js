import fs from 'node:fs/promises';
import path from 'node:path';
import { search } from '../search.js';

function normalize(p) {
  return String(p ?? '').replace(/\\/g, '/').toLowerCase();
}

function includesAnySource(sources, mustInclude) {
  const srcs = sources.map((s) => normalize(s.source));
  return mustInclude.some((req) => {
    const r = normalize(req);
    return srcs.some((s) => s.includes(r));
  });
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveDatasetPath(inputPath) {
  if (inputPath) {
    const absolute = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
    if (await pathExists(absolute)) return absolute;
    throw new Error(`Dataset not found: ${absolute}`);
  }

  const candidates = [
    path.join(process.cwd(), 'src', 'eval', 'gold.json'),
    path.join(process.cwd(), 'eval', 'gold.json'),
    path.join(process.cwd(), 'data', 'eval', 'gold.json'),
  ];

  for (const p of candidates) {
    if (await pathExists(p)) return p;
  }

  throw new Error(`No eval dataset found. Tried: ${candidates.join(', ')}`);
}

async function main() {
  const datasetPath = await resolveDatasetPath(process.argv[2]);
  const raw = await fs.readFile(datasetPath, 'utf8');
  const cases = JSON.parse(raw);

  let pass = 0;
  const results = [];

  for (const tc of cases) {
    const topk = tc.expect?.topk ?? Number(process.env.TOP_K ?? 3);
    const { sources } = await search(tc.question, { topK: topk });

    const must = tc.expect?.must_include_sources ?? [];
    const ok = must.length === 0 ? true : includesAnySource(sources, must);

    results.push({
      id: tc.id,
      ok,
      question: tc.question,
      expected: must,
      got: sources.map((s) => s.source),
      scores: sources.map((s) => s.score),
    });

    if (ok) pass += 1;
  }

  const total = cases.length;
  const hitRate = total ? pass / total : 0;

  console.log(`\nEval results: ${pass}/${total} passed (hit-rate=${hitRate.toFixed(2)})\n`);

  for (const r of results) {
    if (r.ok) continue;
    console.log(`${r.id} FAILED`);
    console.log(`Q: ${r.question}`);
    console.log(`Expected source contains: ${JSON.stringify(r.expected)}`);
    console.log('Got sources:');
    r.got.forEach((g, i) => console.log(`  - ${g} (score=${r.scores[i]})`));
    console.log('');
  }

  const outPath = path.join(path.dirname(datasetPath), 'last_report.json');
  await fs.writeFile(outPath, JSON.stringify({ hitRate, results }, null, 2), 'utf8');
  console.log(`Wrote report: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});