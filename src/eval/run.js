import fs from 'node:fs/promises';
import path from 'node:path';
import { search } from '../search.js';
import { config } from '../core/config.js';

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

function findFirstMatchRank(sources, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const normalizedPatterns = patterns.map((p) => normalize(p));

  for (let i = 0; i < sources.length; i += 1) {
    const src = normalize(sources[i].source);
    if (normalizedPatterns.some((p) => src.includes(p))) return i + 1;
  }
  return null;
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

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const debug = args.includes('--debug');
  const datasetPath = args.find((a) => !a.startsWith('--'));
  return { debug, datasetPath };
}

async function main() {
  const { debug, datasetPath: datasetArg } = parseCliArgs(process.argv);
  const datasetPath = await resolveDatasetPath(datasetArg);
  const raw = await fs.readFile(datasetPath, 'utf8');
  const cases = JSON.parse(raw);

  let pass = 0;
  let preferHitCount = 0;
  const results = [];

  for (const tc of cases) {
    const topk = tc.expect?.topk ?? Number(config.retrieval.topK);
    const { sources, hits } = await search(tc.question, {
      topK: topk,
      contextDebug: config.eval.mode,
    });

    const mustAny = tc.expect?.must_include_any_of ?? tc.expect?.must_include_sources ?? [];
    const prefer = tc.expect?.prefer_sources ?? [];
    const ok = mustAny.length === 0 ? true : includesAnySource(sources, mustAny);
    const preferHit = prefer.length === 0 ? null : includesAnySource(sources, prefer);
    const mustRank = findFirstMatchRank(sources, mustAny);
    const preferRank = findFirstMatchRank(sources, prefer);

    results.push({
      id: tc.id,
      ok,
      question: tc.question,
      expected_any_of: mustAny,
      prefer_sources: prefer,
      got: sources.map((s) => s.source),
      scores: sources.map((s) => s.score),
      must_hit_rank: mustRank,
      prefer_hit: preferHit,
      prefer_hit_rank: preferRank,
    });

    if (ok) pass += 1;
    if (preferHit === true) preferHitCount += 1;

    if (debug && !ok) {
      console.log(`[debug] ${tc.id} top-${topk} breakdown`);
      hits.forEach((h, i) => {
        const boosts = (h.breakdown?.boosts ?? [])
          .map((b) => `${b.name}:+${b.delta}`)
          .join(' ') || '(none)';
        console.log(
          `  #${i + 1} ${h.metadata?.source} chunk=${h.metadata?.chunk_index} ` +
          `base=${Number(h.breakdown?.base ?? h.score ?? 0).toFixed(4)} ` +
          `boosts=${boosts} final=${Number(h.score ?? 0).toFixed(4)}`
        );
      });
      console.log('');
    }
  }

  const total = cases.length;
  const hitRate = total ? pass / total : 0;
  const preferTotal = cases.filter((tc) => (tc.expect?.prefer_sources ?? []).length > 0).length;
  const preferHitRate = preferTotal ? preferHitCount / preferTotal : null;

  console.log(`\nEval results: ${pass}/${total} passed (hit-rate=${hitRate.toFixed(2)})\n`);
  if (preferHitRate !== null) {
    console.log(`Preference hit-rate: ${preferHitCount}/${preferTotal} (${preferHitRate.toFixed(2)})\n`);
  }

  for (const r of results) {
    if (r.ok) continue;
    console.log(`${r.id} FAILED`);
    console.log(`Q: ${r.question}`);
    console.log(`Expected any source contains: ${JSON.stringify(r.expected_any_of)}`);
    console.log('Got sources:');
    r.got.forEach((g, i) => console.log(`  - ${g} (score=${r.scores[i]})`));
    console.log('');
  }

  const outPath = path.join(path.dirname(datasetPath), 'last_report.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({ hitRate, preferHitRate, pass, total, preferHitCount, preferTotal, results }, null, 2),
    'utf8'
  );
  console.log(`Wrote report: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
