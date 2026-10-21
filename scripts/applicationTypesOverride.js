/**
 * The e2e suites' switch for src/applicationTypes.js (completion plan B6-1).
 *
 * ONEXTAP_E2E_APPLICATION_TYPES, a comma-separated list of type ids or `all`,
 * lists those types in a dev server or a build, as if their ids were
 * uncommented in LISTED_TYPE_IDS. Both Vite configs pass what
 * applicationTypesDefine() returns as `define`; unset, the define is null and
 * the switch in the source applies. A name outside the catalog fails the
 * build instead of being dropped, so a typo in a test's list cannot quietly
 * test Job alone.
 *
 * A release build (ONEXTAP_RELEASE=1) refuses it: the store zip lists what
 * src/applicationTypes.js lists, never a test's list.
 *
 * Pure, no I/O: the Vite configs and the unit tests import it.
 */
import { ALL_APPLICATION_TYPES } from '../src/applicationTypes.js';

export const OVERRIDE_VAR = 'ONEXTAP_E2E_APPLICATION_TYPES';

/**
 * @param {Record<string, string|undefined>} env process.env
 * @returns {string[]|null} the ids to list, or null when the variable is unset
 */
export function applicationTypesOverride(env) {
  const raw = String(env?.[OVERRIDE_VAR] ?? '').trim();
  if (!raw) return null;
  if (env?.ONEXTAP_RELEASE === '1') {
    throw new Error(`${OVERRIDE_VAR} is a test-time override; a release build lists the types src/applicationTypes.js lists`);
  }
  const known = ALL_APPLICATION_TYPES.map((t) => t.id);
  const ids = raw === 'all' ? known : raw.split(',').map((id) => id.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !known.includes(id));
  if (unknown.length) throw new Error(`${OVERRIDE_VAR} names types the catalog does not have: ${unknown.join(', ')}`);
  return ids;
}

/** Vite's `define` entry for src/applicationTypes.js. */
export function applicationTypesDefine(env) {
  return { __ONEXTAP_APPLICATION_TYPES__: JSON.stringify(applicationTypesOverride(env)) };
}
