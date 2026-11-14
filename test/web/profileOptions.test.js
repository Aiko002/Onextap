/**
 * The option lists My Profiles offers (extension/constants.js): the phone's
 * dial codes, every country A to Z, and Gender. The Country list (COUNTRIES)
 * is shorter and curated; each of its countries must be in the dial list
 * under the same name and code, or the picker cannot show a profile's own
 * country as chosen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { COUNTRIES, DIAL_CODES, DIAL_CODE_HOMES, GENDERS } from '../../extension/constants.js';

test('the dial codes run A to Z by name', () => {
  const names = DIAL_CODES.map((c) => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
});

test('every country and territory once, each with a well-formed code', () => {
  assert.ok(DIAL_CODES.length >= 240, `only ${DIAL_CODES.length}`);
  assert.equal(new Set(DIAL_CODES.map((c) => c.name)).size, DIAL_CODES.length, 'a name twice');
  assert.equal(new Set(DIAL_CODES.map((c) => c.code)).size, DIAL_CODES.length, 'an ISO code twice');
  for (const c of DIAL_CODES) {
    assert.match(c.code, /^[A-Z]{2}$/, c.name);
    assert.match(c.dial_code, /^\+[1-9]\d{0,2}$/, c.name);
  }
});

test('each country on the Country list is in the dial list, same name, same code', () => {
  for (const country of COUNTRIES) {
    const entry = DIAL_CODES.find((c) => c.name === country.name);
    assert.ok(entry, `${country.name} missing`);
    assert.equal(entry.code, country.code, country.name);
    assert.equal(entry.dial_code, country.dial_code, country.name);
  }
});

test('a code several share has a home among them, and only those have one', () => {
  const byCode = new Map();
  for (const c of DIAL_CODES) byCode.set(c.dial_code, [...(byCode.get(c.dial_code) || []), c.code]);
  for (const [dial, isos] of byCode) {
    if (isos.length > 1) assert.ok(isos.includes(DIAL_CODE_HOMES[dial]), `${dial}: home ${DIAL_CODE_HOMES[dial]} not one of ${isos}`);
    else assert.equal(DIAL_CODE_HOMES[dial], undefined, `${dial} is not shared`);
  }
  // The Country list's own country is the home where it has one: +1 is the
  // United States, +44 the United Kingdom.
  assert.equal(DIAL_CODE_HOMES['+1'], 'US');
  assert.equal(DIAL_CODE_HOMES['+44'], 'GB');
});

test('Gender offers Transgender, and keeps the options saved profiles hold', () => {
  for (const g of ['Male', 'Female', 'Non-binary', 'Transgender', 'Decline to Identify']) assert.ok(GENDERS.includes(g), g);
});
