import fs from 'node:fs/promises';
import path from 'node:path';
import { ask } from '../askCore.js';
import { config } from '../core/config.js';

function norm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

function findBestRank(gotSources, needles) {
  const got = gotSources.map((s) => norm(s.source));
  let best = null;
  for (const n of needles) {
    const needle = norm(n);
    const idx = got.findIndex((g) => g.includes(needle));
    if (idx >= 0) best = best === null ? (idx + 1) : Math.min(best, idx + 1);
  }
  return best; // 1-based or null
}

function formatSourceChunk(source, chunkIndex) {
  return `${source}#${chunkIndex}`;
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const datasetPath = process.argv[2] ?? path.join(process.cwd(), 'eval', 'gold.json');
  const raw = await fs.readFile(datasetPath, 'utf8');
  const cases = JSON.parse(raw);

  const queryEnrichment = config.eval.queryEnrichment;
  const temperature = Number(config.eval.temperature);
  const defaultTopK = Number(config.retrieval.topK);
  const sleepMs = Number(config.eval.sleepMs);
  const maxCases = Number(config.eval.maxCases); // 0 = all

  const results = [];
  let pass = 0;
  let preferHitCount = 0;
  let preferTotal = 0;

  let totalLatency = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCalls = 0;
  let errors = 0;
  let confidenceViolations = 0;
  let fallbackUsedCount = 0;
  let abstainCount = 0;
  let queryCacheHits = 0;
  let queryCacheMisses = 0;
  let queryCacheSamples = 0;

  const runList = maxCases > 0 ? cases.slice(0, maxCases) : cases;

  for (const tc of runList) {
    const topk = tc.expect?.topk ?? defaultTopK;
    const expected =
      tc.expected_any_of ??
      tc.expect?.expected_any_of ??
      tc.expect?.must_include_sources ??
      tc.expect?.must_include_any_of ??
      [];
    const prefer =
      tc.prefer_sources ??
      tc.expect?.prefer_sources ??
      [];

    let out = null;
    let err = null;

    try {
      out = await ask(tc.question, {
        temperature,
        topK: topk,
        queryEnrichment,
        contextDebug: config.eval.mode,
      });

      totalCalls++;
      totalLatency += Number(out?.meta?.latency_ms ?? 0);

      const usage = out?.meta?.usage ?? {};
      totalPromptTokens += Number(usage.prompt_tokens ?? 0);
      totalCompletionTokens += Number(usage.completion_tokens ?? 0);

    } catch (e) {
      errors++;
      err = String(e?.message ?? e);
    }

    const gotSources = out?.sources ?? [];
    const queryCacheHit = out?.meta?.retrieval_cache?.query_hit;
    if (typeof queryCacheHit === 'boolean') {
      queryCacheSamples++;
      if (queryCacheHit) queryCacheHits++;
      else queryCacheMisses++;
    }
    const fallbackUsed = gotSources.some((s) => String(s?.selection_reason ?? '').startsWith('fallback'));
    if (fallbackUsed) fallbackUsedCount++;
    const abstained = Boolean(out?.meta?.no_answer?.abstained);
    if (abstained) abstainCount++;
    const mustRank = expected.length ? findBestRank(gotSources, expected) : 1;
    const ok = err ? false : (expected.length ? mustRank !== null : true);
    const confidenceViolation = mustRank === null && out?.confidence === 'high';

    if (ok) pass++;
    if (confidenceViolation) confidenceViolations++;

    let preferHit = null;
    let preferRank = null;

    if (prefer.length) {
      preferTotal++;
      if (!err) {
        preferRank = findBestRank(gotSources, prefer);
        preferHit = preferRank !== null;
        if (preferHit) preferHitCount++;
      } else {
        preferHit = false;
      }
    }

    results.push({
      id: tc.id,
      ok,
      question: tc.question,
      expected_any_of: expected,
      prefer_sources: prefer,
      got: gotSources.map((s) => formatSourceChunk(s.source, s.chunk_index)),
      got_details: gotSources.map((s) => ({
        source: s.source,
        chunk_index: s.chunk_index,
        selection_reason: s.selection_reason ?? null,
        score: s.score ?? null,
        rerank_score: s.rerank_score ?? null,
      })),
      scores: gotSources.map((s) => s.score),
      selection_reasons: gotSources.map((s) => s.selection_reason ?? null),
      fallback_used: fallbackUsed,
      must_hit_rank: mustRank,
      prefer_hit: prefer.length ? preferHit : null,
      prefer_hit_rank: prefer.length ? preferRank : null,
      confidence: out?.confidence ?? null,
      confidence_violation: confidenceViolation,
      latency_ms: out?.meta?.latency_ms ?? null,
      usage: out?.meta?.usage ?? null,
      query_cache_hit: typeof queryCacheHit === 'boolean' ? queryCacheHit : null,
      abstained,
      no_answer_reasons: Array.isArray(out?.meta?.no_answer?.reasons) ? out.meta.no_answer.reasons : [],
      error: err,
    });

    if (sleepMs) await sleep(sleepMs);
  }

  const total = runList.length;
  const hitRate = total ? pass / total : 0;
  const preferHitRate = preferTotal ? preferHitCount / preferTotal : 0;
  const confidenceViolationRate = total ? confidenceViolations / total : 0;
  const fallbackUsedRate = total ? fallbackUsedCount / total : 0;
  const abstainRate = total ? abstainCount / total : 0;
  const queryCacheHitRate = queryCacheSamples ? queryCacheHits / queryCacheSamples : null;

  const summary = {
    hitRate,
    preferHitRate,
    pass,
    total,
    preferHitCount,
    preferTotal,
    confidenceViolations,
    confidenceViolationRate,
    fallbackUsedCount,
    fallbackUsedRate,
    abstainCount,
    abstainRate,
    queryCacheHits,
    queryCacheMisses,
    queryCacheSamples,
    queryCacheHitRate,
    errors,
    avgLatencyMs: totalCalls ? Math.round(totalLatency / totalCalls) : null,
    avgPromptTokens: totalCalls ? Math.round(totalPromptTokens / totalCalls) : null,
    avgCompletionTokens: totalCalls ? Math.round(totalCompletionTokens / totalCalls) : null,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  const outPath = path.join(process.cwd(), 'eval', 'last_answers_report.json');
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
