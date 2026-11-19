// What a person reads when an API call fails (src/requestError.js): a 4xx in
// the server's own words, anything else in a plain sentence, and a dropped
// connection never in the browser's wording.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { requestError, fetchOrExplain, NETWORK_MESSAGE, SERVER_MESSAGE } from '../../src/requestError.js';

test('a 4xx keeps what the server said', () => {
  const error = requestError(403, 'No credits remaining');
  assert.equal(error.message, 'No credits remaining');
  assert.equal(error.status, 403);
});

test('a 5xx, a gateway page or a non-string body gets the plain sentence', () => {
  assert.equal(requestError(500, 'relation "profiles" does not exist').message, SERVER_MESSAGE);
  assert.equal(requestError(502, undefined).message, SERVER_MESSAGE);
  assert.equal(requestError(400, { code: 'x' }).message, SERVER_MESSAGE);
  assert.equal(requestError(422, '  ').message, SERVER_MESSAGE);
});

test('a dropped connection reads the same in every browser; an abort stays an abort', async (t) => {
  for (const wording of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
    t.mock.method(globalThis, 'fetch', async () => { throw new TypeError(wording); });
    await assert.rejects(fetchOrExplain('https://api.example/x'), { message: NETWORK_MESSAGE });
  }
  const abort = new DOMException('The operation was aborted.', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => { throw abort; });
  await assert.rejects(fetchOrExplain('https://api.example/x'), (e) => e === abort);
});

test('a response, ok or not, comes back as it is', async (t) => {
  const res = new Response('{}', { status: 500 });
  t.mock.method(globalThis, 'fetch', async () => res);
  assert.equal(await fetchOrExplain('https://api.example/x'), res);
});

mock.restoreAll();
