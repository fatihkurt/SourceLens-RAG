import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMergedContext, extractOperationCandidates, selectDiversifiedHits } from './search.js';

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

test('extractOperationCandidates returns camelcase operation-like terms', () => {
  const out = extractOperationCandidates('What does GetCustomer and SearchCustomers return?');
  assert.deepEqual(out, ['GetCustomer', 'SearchCustomers']);
});

test('selectDiversifiedHits marks strict_entity and fallback_free reasons', () => {
  const hits = [
    {
      score: 0.9,
      metadata: {
        source: 'docs/customerrole.md',
        chunk_index: 1,
        section: ['CustomerRole'],
        text: 'CustomerRole represents customer access role.',
      },
    },
    {
      score: 0.8,
      metadata: {
        source: 'docs/unrelated.md',
        chunk_index: 2,
        section: ['General'],
        text: 'Generic text without entity mention.',
      },
    },
  ];

  const out = selectDiversifiedHits(hits, {
    topK: 2,
    maxHitsPerSource: 2,
    entityCandidates: ['CustomerRole'],
    operationCandidates: [],
    query: 'What is CustomerRole?',
  });

  assert.equal(out.length, 2);
  assert.equal(out[0].metadata.selection_reason, 'strict_entity');
  assert.equal(out[1].metadata.selection_reason, 'fallback_free');
});

test('selectDiversifiedHits marks strict_operation when operation intent is present', () => {
  const hits = [
    {
      score: 0.91,
      metadata: {
        source: 'docs/getcustomer.md',
        chunk_index: 3,
        section: ['GetCustomer'],
        text: 'GetCustomer returns customer details.',
      },
    },
  ];

  const out = selectDiversifiedHits(hits, {
    topK: 1,
    maxHitsPerSource: 2,
    entityCandidates: [],
    operationCandidates: ['GetCustomer'],
    query: 'What does the GetCustomer operation return?',
  });

  assert.equal(out.length, 1);
  assert.equal(out[0].metadata.selection_reason, 'strict_operation');
});
