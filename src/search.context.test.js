import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMergedContext } from './search.js';

test('buildMergedContext merges hits from same source into one block in normal mode', () => {
  const hits = [
    {
      score: 0.91,
      metadata: {
        source: 'docs/customerrole.md',
        chunk_index: 1,
        section: ['CustomerRole'],
        text: 'CustomerRole defines user permissions.',
      },
    },
    {
      score: 0.87,
      metadata: {
        source: 'docs/customerrole.md',
        chunk_index: 2,
        section: ['CustomerRole'],
        text: 'RoleId links a user role to a customer.',
      },
    },
    {
      score: 0.73,
      metadata: {
        source: 'docs/address.md',
        chunk_index: 1,
        section: ['Address'],
        text: 'Address stores postal info.',
      },
    },
  ];

  const context = buildMergedContext(hits, { maxChars: 10000, debug: false });

  const sourceHeaderMatches = context.match(/\[#1\] source=docs\/customerrole\.md/g) ?? [];
  assert.equal(sourceHeaderMatches.length, 1, 'same source should appear once as a header block');
  assert.ok(context.includes('CustomerRole defines user permissions.'));
  assert.ok(context.includes('RoleId links a user role to a customer.'));
  assert.ok(!context.includes('---'), 'normal mode should not include debug separators');
  assert.ok(
    context.indexOf('[#1] source=docs/customerrole.md') < context.indexOf('[#2] source=docs/address.md'),
    'source blocks should preserve first-seen order'
  );
});
