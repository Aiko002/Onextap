/**
 * The application types' switch (completion plan B6-1): LISTED_TYPE_IDS in
 * src/applicationTypes.js lists Job only, and turning the others on is
 * uncommenting their ids. These hold both halves: what the switch lists
 * today, and what every surface reads when all four are listed (the lists
 * are passed in, the way the e2e override lists them in a build).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_APPLICATION_TYPES,
  APPLICATION_TYPES,
  DEFAULT_APPLICATION_TYPE,
  getApplicationTypeConfig,
  hasTypeChoice,
  listApplicationTypes,
} from '../../src/applicationTypes.js';

const ALL_IDS = ['job', 'college', 'scholarship', 'internship'];

test('the switch lists Job alone, so no surface offers a choice', () => {
  assert.deepEqual(APPLICATION_TYPES.map((t) => t.id), ['job']);
  assert.equal(hasTypeChoice(), false);
  assert.equal(DEFAULT_APPLICATION_TYPE, 'job');
});

test('an unlisted id stored by an older build reads as Job', () => {
  for (const id of ['college', 'scholarship', 'internship', 'nonsense', undefined]) {
    assert.equal(getApplicationTypeConfig(id).id, 'job', String(id));
  }
});

test('the catalog keeps all four types, and every one declares every feature', () => {
  assert.deepEqual(ALL_APPLICATION_TYPES.map((t) => t.id), ALL_IDS);
  const keys = Object.keys(ALL_APPLICATION_TYPES[0].features).sort();
  for (const type of ALL_APPLICATION_TYPES) {
    assert.deepEqual(Object.keys(type.features).sort(), keys, type.id);
    for (const label of ['label', 'shortLabel', 'coverLetterLabel', 'vaultLabel', 'documentLabel']) {
      assert.equal(typeof type[label], 'string', `${type.id}.${label}`);
    }
  }
});

test('with every type listed: a choice, and each id finds its own labels', () => {
  const types = listApplicationTypes(ALL_IDS);
  assert.deepEqual(types.map((t) => t.id), ALL_IDS);
  assert.equal(hasTypeChoice(types), true);
  assert.equal(getApplicationTypeConfig('college', types).coverLetterLabel, 'Personal Statement');
  assert.equal(getApplicationTypeConfig('scholarship', types).vaultLabel, 'Essay Answers');
  assert.equal(getApplicationTypeConfig('college', types).features.jobMatches, false);
  assert.equal(getApplicationTypeConfig('internship', types).features.jobMatches, true);
  assert.equal(getApplicationTypeConfig('nonsense', types).id, 'job');
});

test('listApplicationTypes: catalog order, unknown ids dropped, Job always in', () => {
  assert.deepEqual(listApplicationTypes(['internship', 'college']).map((t) => t.id), ['job', 'college', 'internship']);
  assert.deepEqual(listApplicationTypes(['college', 'nope']).map((t) => t.id), ['job', 'college']);
  assert.deepEqual(listApplicationTypes([]).map((t) => t.id), ['job']);
  assert.deepEqual(listApplicationTypes(undefined).map((t) => t.id), ['job']);
  assert.equal(hasTypeChoice(listApplicationTypes(['job'])), false);
});
