import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWithBreakdown } from './score.js';

test('definition query + CustomerRole entity applies filename/entity boosts', () => {
  const baseScore = 0.55;
  const item = {
    metadata: {
      source: 'data\\raw\\bingads-13\\customer-management-service\\customerrole.md',
      section: ['CustomerRole Data Object - Customer Management'],
      text: 'The CustomerRole object represents permissions and linked accounts.',
    },
  };

  const out = scoreWithBreakdown({
    item,
    baseScore,
    query: 'What is CustomerRole and what does it represent?',
    extra: { entityCandidates: ['CustomerRole'] },
  });

  const boostNames = out.breakdown.boosts.map((b) => b.name);

  assert.ok(out.score > baseScore, 'score should increase when matching boosts apply');
  assert.ok(
    boostNames.includes('entity_lexical_match'),
    `expected entity_lexical_match boost, got: ${boostNames.join(', ')}`
  );
  assert.ok(
    boostNames.includes('definition_entity_filename_match'),
    `expected definition_entity_filename_match boost, got: ${boostNames.join(', ')}`
  );
});
