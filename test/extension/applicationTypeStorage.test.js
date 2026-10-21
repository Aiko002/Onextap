/**
 * src/applicationTypeStorage.js: each surface's own choice of application
 * type, kept under APPLICATION_TYPE_KEY (completion plan B6-1). Read and
 * written against the in-memory backend, through viteModules.js: the module
 * imports './storage' with no extension, which only Vite (or those hooks)
 * resolves.
 *
 * Under node --test the Vite define is absent, so the switch in
 * src/applicationTypes.js applies: Job alone is listed. These hold what that
 * means for stored data: whatever an older build, or a build with the types
 * listed, left behind reads as Job, and nothing unlisted can be written back.
 * (test/extension/applicationTypes.test.js covers the lists themselves; the
 * extension e2e covers a listed College kept across popup opens.)
 */
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { canLoadViteModules, registerViteModules } from './viteModules.js';

const skip = canLoadViteModules ? false : 'needs module.registerHooks (Node 22.15+)';

let getApplicationType;
let setApplicationType;
let APPLICATION_TYPES;
let APPLICATION_TYPE_KEY;
let storage;
let resetStorage;
let peekStorage;

before(async () => {
  if (skip) return;
  registerViteModules();
  ({ getApplicationType, setApplicationType } = await import('../../src/applicationTypeStorage.js'));
  ({ APPLICATION_TYPES } = await import('../../src/applicationTypes.js'));
  ({ APPLICATION_TYPE_KEY } = await import('../../src/localKeys.js'));
  ({
    storage,
    __resetMemoryStorageForTests: resetStorage,
    __peekMemoryStorageForTests: peekStorage,
  } = await import('../../src/storage.js'));
});

beforeEach(() => resetStorage?.());

test('the switch applies here: Job alone is listed', { skip }, () => {
  assert.deepEqual(APPLICATION_TYPES.map((t) => t.id), ['job']);
});

test('nothing stored reads as Job', { skip }, async () => {
  assert.equal(await getApplicationType(), 'job');
  assert.equal(peekStorage(APPLICATION_TYPE_KEY), undefined, 'a read writes nothing');
});

test('an unlisted stored id reads as Job, and the read leaves it in place', { skip }, async () => {
  for (const id of ['college', 'scholarship', 'internship', 'nonsense', '']) {
    await storage.set(APPLICATION_TYPE_KEY, id);
    assert.equal(await getApplicationType(), 'job', JSON.stringify(id));
    assert.equal(peekStorage(APPLICATION_TYPE_KEY), id, 'the stored value is not rewritten');
  }
});

test('setApplicationType() throws on an unlisted id and writes nothing', { skip }, async () => {
  await setApplicationType('job');
  for (const id of ['college', 'scholarship', 'internship', 'nonsense', '', undefined, null]) {
    await assert.rejects(setApplicationType(id), /Invalid application type/, String(id));
  }
  assert.equal(peekStorage(APPLICATION_TYPE_KEY), 'job');
});

test('a listed id round-trips under APPLICATION_TYPE_KEY', { skip }, async () => {
  await storage.set(APPLICATION_TYPE_KEY, 'college');
  assert.equal(await setApplicationType('job'), 'job');
  assert.equal(peekStorage(APPLICATION_TYPE_KEY), 'job');
  assert.equal(await getApplicationType(), 'job');
});
