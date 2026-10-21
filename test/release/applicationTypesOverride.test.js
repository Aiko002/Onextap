/**
 * The e2e suites' override for the application types (completion plan B6-1,
 * scripts/applicationTypesOverride.js): unset, the source's switch applies;
 * set, the build lists what it names; a release build refuses it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OVERRIDE_VAR,
  applicationTypesOverride,
  applicationTypesDefine,
} from '../../scripts/applicationTypesOverride.js';

test('unset or blank: no override, and the define is null', () => {
  assert.equal(applicationTypesOverride({}), null);
  assert.equal(applicationTypesOverride({ [OVERRIDE_VAR]: '  ' }), null);
  assert.equal(applicationTypesOverride(undefined), null);
  assert.deepEqual(applicationTypesDefine({}), { __ONEXTAP_APPLICATION_TYPES__: 'null' });
});

test('"all" lists the whole catalog; a list lists what it names', () => {
  assert.deepEqual(applicationTypesOverride({ [OVERRIDE_VAR]: 'all' }), ['job', 'college', 'scholarship', 'internship']);
  assert.deepEqual(applicationTypesOverride({ [OVERRIDE_VAR]: ' job, college ' }), ['job', 'college']);
  assert.deepEqual(
    applicationTypesDefine({ [OVERRIDE_VAR]: 'job,scholarship' }),
    { __ONEXTAP_APPLICATION_TYPES__: '["job","scholarship"]' },
  );
});

test('a name outside the catalog fails the build instead of being dropped', () => {
  assert.throws(() => applicationTypesOverride({ [OVERRIDE_VAR]: 'job,colege' }), /colege/);
});

test('a release build refuses the override', () => {
  assert.throws(
    () => applicationTypesOverride({ [OVERRIDE_VAR]: 'all', ONEXTAP_RELEASE: '1' }),
    /release build/,
  );
  assert.equal(applicationTypesOverride({ ONEXTAP_RELEASE: '1' }), null);
});

test('both Vite configs pass the override as their define', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['vite.config.js', 'vite.dashboard.config.js']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(source, /define:\s*applicationTypesDefine\(process\.env\)/, file);
  }
});
