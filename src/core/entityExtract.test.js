import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { extractEntityCandidates } from './entityExtract.js';

test('returns empty array for empty or blank input', () => {
  assert.deepEqual(extractEntityCandidates(''), []);
  assert.deepEqual(extractEntityCandidates('   '), []);
  assert.deepEqual(extractEntityCandidates(null), []);
});

test('quoted phrase has highest priority', () => {
  const out = extractEntityCandidates('define "Account Info" for advertising');
  assert.deepEqual(out, ['Account Info']);
});

test('camel/pascal case tokens are preferred when no quotes', () => {
  const out = extractEntityCandidates('How does ClientLink relate to adGroupId and AccountInfo?');
  assert.deepEqual(out, ['ClientLink', 'adGroupId']);
});

test('camel/pascal case result is deduplicated and capped at 2', () => {
  const out = extractEntityCandidates('ClientLink ClientLink AccountInfo SignupCustomer');
  assert.deepEqual(out, ['ClientLink', 'AccountInfo']);
});

test('fallback removes stop words and picks longest meaningful words', () => {
  const out = extractEntityCandidates('what is the meaning of campaign performance metrics');
  assert.deepEqual(out, ['performance', 'campaign']);
});

test('fallback enforces minimum token length and uniqueness', () => {
  const out = extractEntityCandidates('define ad ad ads account account');
  assert.deepEqual(out, ['account', 'ads']);
});

test('cm-04 style question extracts CustomerRole', () => {
  const out = extractEntityCandidates('What is CustomerRole and what does it represent?');
  assert.deepEqual(out, ['CustomerRole']);
});

test('cm-04 style question with enrichment still extracts CustomerRole', () => {
  const out = extractEntityCandidates('What is CustomerRole and what does it represent? (Bing Ads Customer Management Service)');
  assert.deepEqual(out, ['CustomerRole']);
});

test('gold eval questions produce entity candidates aligned with expected sources', async () => {
  const goldPath = new URL('../../eval/gold.json', import.meta.url);
  const cases = JSON.parse(await fs.readFile(goldPath, 'utf8'));

  for (const tc of cases) {
    const out = extractEntityCandidates(tc.question);
    assert.ok(out.length > 0, `${tc.id}: expected at least one extracted candidate`);

    const expectedStems = (tc.expect?.must_include_any_of ?? tc.expect?.must_include_sources ?? [])
      .map((s) => String(s).split('/').pop() ?? '')
      .map((file) => file.replace(/\.md$/i, '').toLowerCase())
      .filter(Boolean);

    if (expectedStems.length === 0) continue;

    const normalizedOut = out.map((x) => String(x).replace(/[^a-z0-9]/gi, '').toLowerCase());
    const matched = expectedStems.some((stem) =>
      normalizedOut.some((cand) => cand.includes(stem) || stem.includes(cand))
    );

    assert.ok(
      matched,
      `${tc.id}: expected one of [${expectedStems.join(', ')}], got [${out.join(', ')}]`
    );
  }
});
