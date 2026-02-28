import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoAnswerMessage, evaluateNoAnswerGate } from './noAnswerGate.js';

test('abstains when no sources', () => {
  const out = evaluateNoAnswerGate({
    sources: [],
    hits: [],
    context: '',
    confidence: 'medium',
  });
  assert.equal(out.abstain, true);
  assert.ok(out.reasons.includes('no_sources'));
});

test('abstains when top score is below threshold', () => {
  const out = evaluateNoAnswerGate(
    {
      sources: [{ source: 'a.md', chunk_index: 0, score: 0.4 }],
      context: 'x'.repeat(1200),
      confidence: 'medium',
    },
    { minTopScore: 0.55 }
  );
  assert.equal(out.abstain, true);
  assert.ok(out.reasons.includes('low_top_score'));
});

test('abstains on small gap with short context', () => {
  const out = evaluateNoAnswerGate(
    {
      sources: [
        { source: 'a.md', chunk_index: 0, score: 0.71 },
        { source: 'b.md', chunk_index: 1, score: 0.705 },
      ],
      context: 'x'.repeat(120),
      confidence: 'medium',
    },
    { minGap: 0.02, minContextChars: 400 }
  );
  assert.equal(out.abstain, true);
  assert.ok(out.reasons.includes('small_gap_short_context'));
});

test('abstains on low confidence and fallback used', () => {
  const out = evaluateNoAnswerGate({
    sources: [
      { source: 'a.md', chunk_index: 0, score: 0.8, selection_reason: 'fallback_free' },
    ],
    context: 'x'.repeat(1200),
    confidence: 'low',
  });

  assert.equal(out.abstain, true);
  assert.ok(out.reasons.includes('low_confidence'));
  assert.ok(out.reasons.includes('fallback_used'));
});

test('buildNoAnswerMessage includes nearby sources and reasons', () => {
  const msg = buildNoAnswerMessage({
    sources: [{ source: 'x.md', chunk_index: 1 }],
    reasons: ['low_top_score'],
  });

  assert.ok(msg.includes("I can't confidently verify this from the retrieved sources."));
  assert.ok(msg.includes('x.md#1'));
  assert.ok(msg.includes('low_top_score'));
});
