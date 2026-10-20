import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonArrayLenient, parseJsonLenient } from '../../server/llmJson.js';

const entries = [
  { jobId: 'a', score: 80, gapSummary: 'Needs [AWS] and {Terraform}.', matchedSignals: ['Python', 'SQL'] },
  { jobId: 'b', score: 40, gapSummary: 'A "quoted" gap.', matchedSignals: ['React'] },
  { jobId: 'c', score: 61, gapSummary: 'Close.', matchedSignals: [] },
];
const full = JSON.stringify(entries);

test('a bare, fenced or prefaced array parses whole', () => {
  for (const raw of [full, '```json\n' + full + '\n```', 'Here you go:\n' + full]) {
    assert.deepEqual(parseJsonArrayLenient(raw), entries);
  }
});

test('an array wrapped in an object is still recovered', () => {
  assert.deepEqual(parseJsonArrayLenient(JSON.stringify({ results: entries })), entries);
});

test('an array cut off mid-entry keeps the finished entries, not a list nested inside one', () => {
  const cut = full.slice(0, full.indexOf('"jobId":"c"') + 8);
  for (const raw of [cut, '```json\n' + cut, cut.replace(/^\[/, '[\n  ')]) {
    assert.deepEqual(parseJsonArrayLenient(raw), entries.slice(0, 2));
  }
});

test('an array cut off between entries keeps all of them', () => {
  const cut = full.slice(0, full.indexOf(',{"jobId":"c"') + 1);
  assert.deepEqual(parseJsonArrayLenient(cut), entries.slice(0, 2));
});

test('an array cut off inside its first entry has nothing to keep, and says so', () => {
  assert.throws(() => parseJsonArrayLenient(full.slice(0, 20)), SyntaxError);
});

test('a bracketed aside before a wrapped array still reaches the wrapped-object recovery', () => {
  assert.deepEqual(parseJsonArrayLenient(`Scores [see below]: ${JSON.stringify({ results: entries })}`), entries);
});

test('parseJsonLenient is unchanged: the first object, fences and trailing commas', () => {
  assert.deepEqual(parseJsonLenient('```json\n{"a": 1, "b": [1, 2,],}\n```'), { a: 1, b: [1, 2] });
  assert.deepEqual(parseJsonLenient('Sure: {"a": {"b": 2}} and more'), { a: { b: 2 } });
});
