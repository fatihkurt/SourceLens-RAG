// src/eval/gate.js
import fs from 'node:fs';
import { config } from '../core/config.js';

function num(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function fail(msg) {
  console.error(`\n[EVAL GATE] FAIL: ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`\n[EVAL GATE] WARN: ${msg}`);
}

function ok(msg) {
  console.log(`\n[EVAL GATE] OK: ${msg}`);
}

// Usage: node ./src/eval/gate.js ./eval/last_answers_report.json
const reportPath = process.argv[2] || './eval/last_answers_report.json';

if (!fs.existsSync(reportPath)) {
  console.error(`[EVAL GATE] Report not found: ${reportPath}`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const thresholds = config.eval.gate;

// --- hard gates (fail)
const errors = num(report.errors, 0);
if (errors > thresholds.maxErrors) fail(`errors must be <= ${thresholds.maxErrors}, got ${errors}`);

const hitRate = num(report.hitRate, 0);
if (hitRate < thresholds.minHitRate) fail(`hitRate must be >= ${thresholds.minHitRate}, got ${hitRate}`);

const preferTotal = num(report.preferTotal, 0);
const preferHitRate = num(report.preferHitRate, 0);
if (preferTotal > 0 && preferHitRate < thresholds.minPreferHitRate) {
  fail(
    `preferHitRate must be >= ${thresholds.minPreferHitRate} when preferTotal>0, got ${preferHitRate} (preferTotal=${preferTotal})`
  );
}

const confViolRate = num(report.confidenceViolationRate, 0);
if (confViolRate > thresholds.maxConfidenceViolationRate) {
  fail(`confidenceViolationRate must be <= ${thresholds.maxConfidenceViolationRate}, got ${confViolRate}`);
}

// --- soft gates (warn)
const avgPromptTokens = num(report.avgPromptTokens, 0);
if (avgPromptTokens > thresholds.warnAvgPromptTokens) {
  warn(`avgPromptTokens high: ${avgPromptTokens} (>${thresholds.warnAvgPromptTokens})`);
}

const avgLatencyMs = num(report.avgLatencyMs, 0);
if (avgLatencyMs > thresholds.warnAvgLatencyMs) {
  warn(`avgLatencyMs high: ${avgLatencyMs}ms (>${thresholds.warnAvgLatencyMs}ms)`);
}

// summarize
if (!process.exitCode) {
  ok(`passed: hitRate=${hitRate}, preferHitRate=${preferHitRate}, errors=${errors}, confidenceViolationRate=${confViolRate}`);
} else {
  console.error(`\n[EVAL GATE] FAILED. See messages above.`);
}
