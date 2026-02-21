import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateConfidence, minConfidence } from './confidence.js';

test('minConfidence picks lower confidence level', () => {
  assert.equal(minConfidence('low', 'high'), 'low');
  assert.equal(minConfidence('medium', 'high'), 'medium');
  assert.equal(minConfidence('high', 'medium'), 'medium');
});

test('calibrateConfidence returns low when no sources', () => {
  assert.equal(calibrateConfidence({ sources: [], contextChars: 1000 }), 'low');
});

test('calibrateConfidence returns medium when scores are missing', () => {
  assert.equal(
    calibrateConfidence({
      sources: [{ source: 'x' }, { source: 'y', score: null }],
      contextChars: 1000,
    }),
    'medium'
  );
});

test('calibrateConfidence returns medium on low top score', () => {
  assert.equal(
    calibrateConfidence({
      sources: [{ score: 0.69 }, { score: 0.6 }],
      contextChars: 1000,
    }),
    'medium'
  );
});

test('calibrateConfidence returns medium on small top score gap', () => {
  assert.equal(
    calibrateConfidence({
      sources: [{ score: 0.75 }, { score: 0.74 }],
      contextChars: 1000,
    }),
    'medium'
  );
});

test('calibrateConfidence returns medium on very short context', () => {
  assert.equal(
    calibrateConfidence({
      sources: [{ score: 0.8 }, { score: 0.7 }],
      contextChars: 200,
    }),
    'medium'
  );
});

test('calibrateConfidence returns high with strong score/gap/context', () => {
  assert.equal(
    calibrateConfidence({
      sources: [{ score: 0.8 }, { score: 0.7 }],
      contextChars: 1200,
    }),
    'high'
  );
});
